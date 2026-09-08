import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
const DEFAULT_HLS_DIR = path.join(MEDIA_ROOT, 'hls');

function getFfprobePath() {
    const ffmpegPath = process.env.FFMPEG_PATH;
    if (ffmpegPath) {
        return ffmpegPath.replace(/ffmpeg$/, 'ffprobe');
    }
    return 'ffprobe';
}

function isVideoVariant(variantIndex, tracksV) {
    // true = variant includes video (typically paired with audio at the same index)
    return variantIndex < tracksV;
}

function getStreamMetaPath(streamId, hlsDir = DEFAULT_HLS_DIR) {
    return path.join(hlsDir, streamId, 'meta.json');
}

function readStreamMeta(streamId, hlsDir = DEFAULT_HLS_DIR) {
    try {
        const metaPath = getStreamMetaPath(streamId, hlsDir);
        if (!fs.existsSync(metaPath)) {
            return null;
        }
        const content = fs.readFileSync(metaPath, 'utf8');
        const meta = JSON.parse(content);
        if (!Number.isInteger(meta.tracksV) || !Number.isInteger(meta.tracksA)) {
            return null;
        }
        return meta;
    } catch (err) {
        console.error(`Error reading stream meta for ${streamId}:`, err.message);
        return null;
    }
}

function writeStreamMeta(streamId, tracksV, tracksA, hlsDir = DEFAULT_HLS_DIR) {
    const streamDir = path.join(hlsDir, streamId);
    fs.mkdirSync(streamDir, { recursive: true });
    const metaPath = getStreamMetaPath(streamId, hlsDir);
    fs.writeFileSync(metaPath, JSON.stringify({ tracksV, tracksA }));
}

function findFirstSegment(trackDir) {
    if (!fs.existsSync(trackDir)) {
        return null;
    }

    const playlistPath = path.join(trackDir, 'playlist.m3u8');
    if (fs.existsSync(playlistPath)) {
        const content = fs.readFileSync(playlistPath, 'utf8');
        const segmentMatch = content.match(/^(seg\d+\.ts)$/m);
        if (segmentMatch) {
            return path.join(trackDir, segmentMatch[1]);
        }
    }

    const tsFiles = fs.readdirSync(trackDir)
        .filter((name) => name.endsWith('.ts'))
        .sort();
    return tsFiles.length > 0 ? path.join(trackDir, tsFiles[0]) : null;
}

async function probeTrackHasVideo(trackDir) {
    const segmentPath = findFirstSegment(trackDir);
    if (!segmentPath) {
        return false;
    }

    try {
        const { stdout } = await execFileAsync(getFfprobePath(), [
            '-v', 'error',
            '-select_streams', 'v',
            '-show_entries', 'stream=codec_type',
            '-of', 'csv=p=0',
            segmentPath
        ]);
        return stdout.trim().length > 0;
    } catch (err) {
        console.error(`Error probing track at ${trackDir}:`, err.message);
        return false;
    }
}

async function resolveTrackIsVideo(streamId, trackId, trackPath, options = {}) {
    const { hlsDir = DEFAULT_HLS_DIR, ffmpegProcesses = null } = options;
    const variantIndex = parseInt(trackId, 10);

    if (Number.isFinite(variantIndex)) {
        const meta = readStreamMeta(streamId, hlsDir);
        if (meta) {
            return isVideoVariant(variantIndex, meta.tracksV);
        }

        const liveData = ffmpegProcesses?.get(streamId);
        if (liveData?.tracksV !== null) {
            return isVideoVariant(variantIndex, liveData.tracksV);
        }
    }

    return probeTrackHasVideo(trackPath);
}

function sortTrackIds(trackIds) {
    return [...trackIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

export {
    isVideoVariant,
    readStreamMeta,
    writeStreamMeta,
    probeTrackHasVideo,
    resolveTrackIsVideo,
    sortTrackIds,
    findFirstSegment,
    getFfprobePath
};
