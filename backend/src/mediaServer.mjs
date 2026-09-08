import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { writeStreamMeta } from './streamTrackUtils.js';

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
const HLS_DIR = path.join(MEDIA_ROOT, 'hls');

await fs.promises.mkdir(HLS_DIR, { recursive: true });

const ffmpegProcesses = new Map();
const registeredStreams = new Map();
const baseSrtPort = parseInt(process.env.SRT_PORT || '9999', 10);
const debugSrtPort = parseInt(process.env.DEBUG_SRT_PORT || String(baseSrtPort), 10);

function parseRegisterRequest(body) {
    const { tracks: tracksV, audioTracks: tracksA, streamId: providedStreamId } = body ?? {};
    const trackVNum = Number.parseInt(tracksV, 10);
    const trackANum = Number.parseInt(tracksA, 10);

    if (!Number.isInteger(trackVNum) || trackVNum <= 0) {
        return { error: "Invalid 'video tracks' parameter." };
    }
    if (!Number.isInteger(trackANum) || trackANum <= 0) {
        return { error: "Invalid 'audio tracks' parameter." };
    }

    return {
        trackVNum,
        trackANum,
        streamId: providedStreamId || randomUUID()
    };
}

function buildSrtUrl(host, port, mode) {
    return [
        `srt://${host}:${port}`,
        `?mode=${mode}`,
        '&latency=4000000',
        '&rcvbuf=134217728',
        '&sndbuf=134217728',
        '&peerlatency=4000000',
        '&tlpktdrop=0',
        '&nakreport=1'
    ].join('');
}

// Configuration for process termination
const PROCESS_GRACE_PERIOD = 5000; // 5 seconds to gracefully shut down
const PROCESS_CHECK_INTERVAL = 30000; // Check every 30 seconds for zombie processes

function clearHLSFiles() {
    try {
        if (fs.existsSync(HLS_DIR)) {
            for (const file of fs.readdirSync(HLS_DIR)) {
                fs.rmSync(path.join(HLS_DIR, file), { recursive: true, force: true });
            }
            console.log('🧹 HLS directory cleared');
        }
    } catch (err) {
        console.error('⚠️ Failed to clear HLS directory:', err);
    }
}

function clearStreamHLSFiles(streamId) {
    try {
        const streamHlsDir = path.join(HLS_DIR, streamId);
        if (fs.existsSync(streamHlsDir)) {
            fs.rmSync(streamHlsDir, { recursive: true, force: true });
            console.log(`🧹 HLS directory cleared for stream ${streamId}`);
        }
    } catch (err) {
        console.error(`⚠️ Failed to clear HLS directory for stream ${streamId}:`, err);
    }
}

// Safely kill a process with grace period - try SIGINT first, then SIGKILL
function killFFmpegProcess(streamId, process, timeout = PROCESS_GRACE_PERIOD) {
    return new Promise((resolve) => {
        if (!process || process.killed) {
            resolve(true);
            return;
        }

        const killTimer = setTimeout(() => {
            if (!process.killed) {
                console.log(`⚠️ FFmpeg for stream ${streamId} did not exit gracefully, force killing (SIGKILL)...`);
                try {
                    process.kill('SIGKILL');
                } catch (err) {
                    console.error(`⚠️ Failed to SIGKILL ffmpeg for stream ${streamId}:`, err);
                }
            }
            resolve(true);
        }, timeout);

        process.once('exit', () => {
            clearTimeout(killTimer);
            resolve(true);
        });

        // Try graceful shutdown first
        try {
            process.kill('SIGINT');
        } catch (err) {
            console.error(`⚠️ Failed to SIGINT ffmpeg for stream ${streamId}:`, err);
            clearTimeout(killTimer);
            resolve(false);
        }
    });
}

function buildFfmpegArgs(videoTrackCount, audioTrackCount, streamId, srtUrl) {
    const streamHlsDir = path.join(HLS_DIR, streamId);
    const mapArgs = [];
    const audioCodecArgs = [];
    const varStreamEntries = [];

    // 1. Map all available video tracks
    for (let v = 0; v < videoTrackCount; v++) {
        mapArgs.push('-map', `0:v:${v}`);
    }

    // 2. Map all available audio tracks
    for (let a = 0; a < audioTrackCount; a++) {
        mapArgs.push('-map', `0:a:${a}`);
        audioCodecArgs.push(`-c:a:${a}`, 'copy');
    }

    // 3. Pair each video track with its audio at the same index (v:0,a:0).
    // Extra audio tracks beyond the video count get their own audio-only variant (a:N).
    const maxTracks = Math.max(videoTrackCount, audioTrackCount);

    for (let i = 0; i < maxTracks; i++) {
        const hasVideo = i < videoTrackCount;
        const hasAudio = i < audioTrackCount;

        if (hasVideo && hasAudio) {
            varStreamEntries.push(`v:${i},a:${i}`);
        } else if (hasVideo) {
            varStreamEntries.push(`v:${i}`);
        } else if (hasAudio) {
            varStreamEntries.push(`a:${i}`);
        }
    }

    const srtParams = [
        'mode=listener',
        'latency=4000000',
        'rcvbuf=134217728',
        'sndbuf=134217728',
        'peerlatency=4000000',
        'tlpktdrop=0',
        'nakreport=1',
        'connect_timeout=5000',
        'linger=0'
    ].join('&');

    const inputSource = srtUrl
        ? `${srtUrl}?${srtParams}`
        : 'pipe:';

    const ffmpegArgs = [
        '-err_detect', 'ignore_err',
        '-fflags', '+genpts+discardcorrupt+igndts',
        '-flags', 'low_delay',
        '-strict', 'experimental',
        '-i', inputSource,
        ...mapArgs,
        '-c:v', 'copy',
        ...audioCodecArgs,
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '15',
        '-hls_flags', 'delete_segments+independent_segments+omit_endlist',
        '-hls_segment_type', 'mpegts',
        '-hls_segment_filename', path.join(streamHlsDir, '%v', 'seg%05d.ts'),
        '-var_stream_map', varStreamEntries.join(' '),
        path.join(streamHlsDir, '%v', 'playlist.m3u8')
    ];

    return ffmpegArgs;
}

function startFFmpegListener(streamId, tracksV, tracksA, socket, srtUrl = null) {
    if (!tracksV || tracksV === 0) {
        if (socket) {
            socket.destroy();
        }
        return;
    }

    const ffmpegArgs = buildFfmpegArgs(tracksV, tracksA, streamId, srtUrl);

    console.log(`📀 Spawning FFmpeg for stream ${streamId}:`, 'ffmpeg', ffmpegArgs.join(' '));

    const stdio = srtUrl ? ['inherit', 'inherit', 'inherit'] : ['pipe', 'inherit', 'inherit'];
    const ffmpegProc = spawn('ffmpeg', ffmpegArgs, { stdio });

    if (socket) {
        socket.pipe(ffmpegProc.stdin);
    }

    ffmpegProc.on('exit', (code, signal) => {
        console.log(`ℹ️ FFmpeg for stream ${streamId} exited (code=${code} signal=${signal})`);
        clearStreamHLSFiles(streamId);
        ffmpegProcesses.delete(streamId);
        registeredStreams.delete(streamId);
        console.log(`📊 Active streams: ${ffmpegProcesses.size}`);
        if (socket) {
            try {
                socket.destroy();
            } catch (err) {
                console.error(`⚠️ Error destroying socket for stream ${streamId}:`, err);
            }
        }
    });

    ffmpegProc.on('error', (err) => {
        console.error(`⚠️ FFmpeg spawn failed for stream ${streamId}:`, err);
        if (socket) {
            try {
                socket.destroy();
            } catch (err) {
                console.error(`⚠️ Error destroying socket for stream ${streamId}:`, err);
            }
        }
    });

    if (socket) {
        socket.on('error', (err) => {
            console.error(`⚠️ Socket error for stream ${streamId}:`, err);
            // Use the new kill function with grace period
            killFFmpegProcess(streamId, ffmpegProc).catch(err => {
                console.error(`⚠️ Error killing ffmpeg for stream ${streamId}:`, err);
            });
        });

        socket.on('end', () => {
            console.log(`📴 Socket closed for stream ${streamId}`);
            killFFmpegProcess(streamId, ffmpegProc).catch(err => {
                console.error(`⚠️ Error killing ffmpeg for stream ${streamId}:`, err);
            });
        });

        socket.on('close', () => {
            console.log(`🔌 Socket fully closed for stream ${streamId}`);
        });
    }

    ffmpegProcesses.set(streamId, {
        process: ffmpegProc,
        tracksV,
        tracksA,
        socket,
        stopped: false,
        createdAt: Date.now()
    });
}

function createMediaRoutes() {
    const router = express.Router();

    router.use(cors({
        origin: '*',
        methods: ['GET', 'HEAD', 'OPTIONS'],
        allowedHeaders: ['Range', 'Content-Type', 'Cache-Control'],
        exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges']
    }));

    router.use('/api/hls', (req, res, next) => {
        if (req.path.endsWith('.m3u8')) {
            res.set({
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/vnd.apple.mpegurl'
            });
        } else if (req.path.endsWith('.ts')) {
            res.set({
                'Cache-Control': 'public, max-age=30',
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'video/mp2t'
            });
        }
        next();
    }, express.static(HLS_DIR, {
        etag: false,
        lastModified: false
    }));

    router.use(express.json());

    // POST /ffmpeg/register — register a stream and create a unique SRT listener
    router.post('/ffmpeg/register', (req, res) => {
        const parsed = parseRegisterRequest(req.body);
        if (parsed.error) {
            return res.status(400).json({ error: parsed.error });
        }

        const { trackVNum, trackANum, streamId } = parsed;

        if (registeredStreams.has(streamId)) {
            return res.status(409).json({ error: 'StreamId already registered', streamId });
        }

        try {
            const host = process.env.SRT_URL || '127.0.0.1';
            let srtPort = baseSrtPort;
            while (Array.from(registeredStreams.values()).some(s => s.port === srtPort)) {
                srtPort++;
            }

            const srtUrl = `srt://0.0.0.0:${srtPort}`;
            const srtUrlExternal = buildSrtUrl(host, srtPort, 'caller');

            writeStreamMeta(streamId, trackVNum, trackANum, HLS_DIR);
            startFFmpegListener(streamId, trackVNum, trackANum, null, srtUrl);

            registeredStreams.set(streamId, {
                tracksV: trackVNum,
                tracksA: trackANum,
                port: srtPort,
                srtUrl
            });

            console.log(`📝 Stream registered: ${streamId} (tracksV=${trackVNum}, (tracksA=${trackANum}, port=${srtPort})`);

            return res.status(200).json({
                status: 'registered',
                streamId,
                tracksV: trackVNum,
                tracksA: trackANum,
                srtUrl: srtUrlExternal,
                hlsUrl: `/api/hls/${streamId}/0/playlist.m3u8`
            });
        } catch (err) {
            console.error(`⚠️ Failed to register stream ${streamId}:`, err);
            return res.status(500).json({ error: 'Failed to register stream' });
        }
    });

    // POST /ffmpeg/register/debug — same as register but returns a hardcoded SRT listener URL for VLC (no FFmpeg)
    router.post('/ffmpeg/register/debug', (req, res) => {
        const parsed = parseRegisterRequest(req.body);
        if (parsed.error) {
            return res.status(400).json({ error: parsed.error });
        }

        const { trackVNum, trackANum, streamId } = parsed;

        if (registeredStreams.has(streamId)) {
            return res.status(409).json({ error: 'StreamId already registered', streamId });
        }

        try {
            const srtUrlListener = 'srt://0.0.0.0:5555?mode=listener';
            writeStreamMeta(streamId, trackVNum, trackANum, HLS_DIR);

            registeredStreams.set(streamId, {
                tracksV: trackVNum,
                tracksA: trackANum,
                port: debugSrtPort,
                debug: true
            });

            console.log(`🐛 Debug stream registered: ${streamId} (tracksV=${trackVNum}, tracksA=${trackANum}, vlc listener port=${debugSrtPort})`);

            return res.status(200).json({
                status: 'registered',
                streamId,
                tracksV: trackVNum,
                tracksA: trackANum,
                srtUrl: srtUrlListener,
                hlsUrl: `/api/hls/${streamId}/0/playlist.m3u8`
            });
        } catch (err) {
            console.error(`⚠️ Failed to register debug stream ${streamId}:`, err);
            return res.status(500).json({ error: 'Failed to register stream' });
        }
    });

    // POST /ffmpeg/stop — request FFmpeg to stop for a specific stream
    router.post('/ffmpeg/stop', async (req, res) => {
        const { streamId } = req.body ?? {};

        if (!streamId) {
            return res.status(400).json({ error: "Missing 'streamId' parameter" });
        }

        const streamData = ffmpegProcesses.get(streamId);
        const registered = registeredStreams.get(streamId);

        if (!streamData && !registered) {
            return res.status(200).json({ status: 'not_found', streamId });
        }

        try {
            if (streamData) {
                if (streamData.process) {
                    const pid = streamData.process.pid;
                    console.log(`⏹️ FFmpeg stop requested for stream ${streamId} (pid=${pid})`);
                    await killFFmpegProcess(streamId, streamData.process);
                }
                if (streamData.socket) {
                    streamData.socket.destroy();
                }
                ffmpegProcesses.delete(streamId);
            }

            if (registered) {
                registeredStreams.delete(streamId);
                console.log(`🗑️ Cancelled registration for stream ${streamId}`);
            }

            clearStreamHLSFiles(streamId);
            return res.status(200).json({ status: 'stopped', streamId });
        } catch (err) {
            console.error(`⚠️ Failed to stop stream ${streamId}:`, err);
            return res.status(500).json({ error: 'Failed to stop stream' });
        }
    });

    // GET /ffmpeg/status — get current FFmpeg state for all or a specific stream
    router.get('/ffmpeg/status', (req, res) => {
        const { streamId } = req.query;

        if (streamId) {
            const streamData = ffmpegProcesses.get(streamId);
            const registered = registeredStreams.get(streamId);

            if (streamData) {
                return res.status(200).json({
                    streamId,
                    status: 'active',
                    running: true,
                    pid: streamData.process?.pid,
                    tracks: streamData.tracks,
                    hlsUrl: `/api/hls/${streamId}/0/playlist.m3u8`,
                    srtUrl: registered
                        ? `srt://${process.env.API_HOSTNAME || 'localhost'}:${registered.port}?mode=caller&latency=4000000&tlpktdrop=0`
                        : null
                });
            }

            return res.status(200).json({ streamId, status: 'not_found' });
        }

        const allStreams = {};

        for (const [id, data] of ffmpegProcesses.entries()) {
            const registered = registeredStreams.get(id);
            allStreams[id] = {
                status: 'active',
                running: true,
                pid: data.process.pid,
                tracks: data.tracks,
                hlsUrl: `/api/hls/${id}/0/playlist.m3u8`,
                srtUrl: registered
                    ? `srt://${process.env.API_HOSTNAME || 'localhost'}:${registered.port}?mode=caller&latency=4000000&tlpktdrop=0`
                    : null,
                srtPort: registered ? registered.port : null
            };
        }

        return res.status(200).json({
            totalStreams: ffmpegProcesses.size,
            activeStreams: ffmpegProcesses.size,
            streams: allStreams
        });
    });

    return router;
}

async function startMediaServer() {
    console.log('🚀 Media server ready!');
    console.log(`   📝 Register stream: POST ${process.env.API_HOSTNAME || 'localhost'}/ffmpeg/register with {"tracks": 2}`);
    console.log(`   🐛 Debug register: POST ${process.env.API_HOSTNAME || 'localhost'}/ffmpeg/register/debug (returns VLC listener URL on port ${debugSrtPort})`);
    console.log('   🔗 FFmpeg starts immediately with its own SRT URL');
    console.log(`   📊 Check status: GET ${process.env.API_HOSTNAME || 'localhost'}/ffmpeg/status`);

    // Periodic check for zombie processes (every 30 seconds)
    const healthCheckInterval = setInterval(async () => {
        const deadStreams = [];
        for (const [streamId, streamData] of ffmpegProcesses.entries()) {
            if (streamData.process && streamData.process.killed) {
                console.log(`🧟 Detected killed ffmpeg for stream ${streamId}, cleaning up...`);
                deadStreams.push(streamId);
            }
        }
        // Clean up dead processes
        for (const streamId of deadStreams) {
            clearStreamHLSFiles(streamId);
            ffmpegProcesses.delete(streamId);
            registeredStreams.delete(streamId);
        }
    }, PROCESS_CHECK_INTERVAL);

    // Graceful shutdown handler
    async function gracefulShutdown(signal) {
        console.log(`\n⏳ ${signal} received, gracefully shutting down ffmpeg processes...`);

        const shutdownPromises = [];
        for (const [streamId, streamData] of ffmpegProcesses.entries()) {
            console.log(`   Stopping stream ${streamId}...`);
            shutdownPromises.push(killFFmpegProcess(streamId, streamData.process));
        }

        await Promise.all(shutdownPromises);

        // Clear HLS files
        clearHLSFiles();

        // Clean up health check interval
        clearInterval(healthCheckInterval);

        console.log('✅ All ffmpeg processes stopped');
        process.exit(0);
    }

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', async (err) => {
        console.error('💥 Uncaught exception:', err);
        await gracefulShutdown('uncaughtException');
    });
}

export { createMediaRoutes, startMediaServer, ffmpegProcesses, killFFmpegProcess, clearHLSFiles };
