import express from 'express';
const router = express.Router();
import db from '../db.js';
import fs from 'fs';
import path from 'path';
import { ffmpegProcesses } from '../mediaServer.mjs';
import { resolveTrackIsVideo, sortTrackIds } from '../streamTrackUtils.js';

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), 'media');
const HLS_DIR = path.join(MEDIA_ROOT, 'hls');

/*function isPlaylistReady(playlistPath, minSegments = 2) {
    try {
        if (!fs.existsSync(playlistPath)) {
            return false;
        }

        const content = fs.readFileSync(playlistPath, 'utf8');

        if (!content.includes('#EXTM3U')) {
            return false;
        }

        const segmentMatches = content.match(/\.ts/g);
        if (!segmentMatches) {
            return false;
        }

        return segmentMatches.length >= minSegments;
    } catch (err) {
        console.error(`Error checking playlist ${playlistPath}:`, err.message);
        return false;
    }
}*/

/*function getSegmentCount(playlistPath) {
    try {
        if (!fs.existsSync(playlistPath)) {
            return 0;
        }
        const content = fs.readFileSync(playlistPath, 'utf8');
        const segmentMatches = content.match(/\.ts/g);
        return segmentMatches ? segmentMatches.length : 0;
    } catch (err) {
        return 0;
    }
}*/

/*function getCurrentTracksState(protocol = 'http') {
    try {
        if (!fs.existsSync(HLS_DIR)) {
            return {
                tracks: [],
                videoCount: 0,
                ready: false,
                pending: 0,
                totalDirs: 0,
                message: 'HLS directory does not exist yet'
            };
        }

        let dirs;
        try {
            dirs = fs.readdirSync(HLS_DIR, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name)
                .sort((a, b) => parseInt(a) - parseInt(b));
        } catch (err) {
            return {
                tracks: [],
                videoCount: 0,
                ready: false,
                pending: 0,
                totalDirs: 0,
                message: 'Cannot read HLS directory'
            };
        }

        if (dirs.length === 0) {
            return {
                tracks: [],
                videoCount: 0,
                ready: false,
                pending: 0,
                totalDirs: 0,
                message: 'No track directories found'
            };
        }

        const httpPort = `localhost:${process.env.PORT || 4000}`;
        const readyTracks = [];
        const pendingTracks = [];

        for (const id of dirs) {
            const playlistPath = path.join(HLS_DIR, id, 'playlist.m3u8');
            const segmentCount = getSegmentCount(playlistPath);

            if (isPlaylistReady(playlistPath, 2)) {
                readyTracks.push({
                    index: readyTracks.length,
                    name: id,
                    videoUrl: `${protocol}://${httpPort}/api/hls/${id}/playlist.m3u8`,
                    segments: segmentCount
                });
            } else {
                pendingTracks.push({
                    name: id,
                    segments: segmentCount,
                    exists: fs.existsSync(playlistPath)
                });
            }
        }

        return {
            tracks: readyTracks,
            videoCount: readyTracks.length,
            ready: readyTracks.length > 0 && pendingTracks.length === 0 && readyTracks.length === dirs.length,
            pending: pendingTracks.length,
            totalDirs: dirs.length
        };
    } catch (err) {
        console.error('[getCurrentTracksState] Error:', err);
        return {
            tracks: [],
            videoCount: 0,
            ready: false,
            pending: 0,
            totalDirs: 0,
            message: 'Error reading tracks'
        };
    }
}*/

async function buildTracks(streamId, trackDirs, url) {
    const sortedTrackIds = sortTrackIds(trackDirs);
    const tracks = [];

    for (const trackId of sortedTrackIds) {
        const trackPath = path.join(HLS_DIR, streamId, trackId);
        const isVideo = await resolveTrackIsVideo(streamId, trackId, trackPath, {
            hlsDir: HLS_DIR,
            ffmpegProcesses
        });

        tracks.push({
            trackId,
            videoUrl: `${url}/api/hls/${streamId}/${trackId}/playlist.m3u8`,
            isVideo
        });
    }

    return tracks;
}

function isNumericStreamId(streamId) {
    return /^\d+$/.test(streamId);
}

async function fetchStreamInfo(streamId) {
    if (!isNumericStreamId(streamId)) {
        return null;
    }

    const dbRows = await db.query(
        'SELECT s.id, s.title, s.viewers, s.avatar_url, s.thumbnail_url, c.name as category FROM streams s LEFT JOIN categories c ON s.category_id = c.id WHERE s.id = ?',
        [streamId]
    );

    return dbRows.length > 0 ? dbRows[0] : null;
}

function buildStreamEntry(streamId, tracks, streamInfo) {
    return {
        streamId,
        trackCount: tracks.length,
        tracks,
        title: streamInfo?.title || '',
        category: streamInfo?.category || '',
        viewers: streamInfo?.viewers || 0,
        avatarUrl: streamInfo?.avatar_url || '',
        thumbnailUrl: streamInfo?.thumbnail_url || ''
    };
}

router.get('/', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams ORDER BY viewers DESC');
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.get('/available', async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store'); // Disable caching
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const port = process.env.PORT || 4000;
        const rawHost = process.env.API_HOSTNAME || req.get('host') || `localhost:${port}`;
        const normalizedHost = rawHost.trim().replace(/:\s*/, ':');
        const hostUrl = new URL(/^https?:\/\//i.test(normalizedHost) ? normalizedHost : `http://${normalizedHost}`);
        const host = hostUrl.host.replace(/\/api(?:\/.*)?$/i, '');
        const protocol = process.env.API_PROTOCOL || req.protocol || hostUrl.protocol.replace(':', '') || 'http';
        const url = `${protocol}://${host}`;
        const streams = [];

        // Get all stream directories
        const streamDirs = fs.readdirSync(HLS_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        // For each stream, get database info and HLS tracks
        for (const streamId of streamDirs) {
            try {
                const streamInfo = await fetchStreamInfo(streamId);

                const streamPath = path.join(HLS_DIR, streamId);
                const trackDirs = fs.readdirSync(streamPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                const tracks = await buildTracks(streamId, trackDirs, url);
                streams.push(buildStreamEntry(streamId, tracks, streamInfo));
            } catch (err) {
                console.error(`Error processing stream ${streamId}: `, err);
                const streamPath = path.join(HLS_DIR, streamId);
                const trackDirs = fs.readdirSync(streamPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                const tracks = await buildTracks(streamId, trackDirs, url);
                streams.push(buildStreamEntry(streamId, tracks, null));
            }
        }

        res.status(200).json(streams);
    } catch (err) {
        console.error('[/available] Error:', err);
        next(err);
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams WHERE id = ?', [req.params.id]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Stream not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

router.get('/:id/hls', async (req, res, next) => {
    try {
        const streamId = req.params.id;
        const host = req.get('host') || `localhost:${process.env.PORT || 4000}`;
        const protocol = req.protocol || 'http';
        const hlsUrl = `${protocol}://${host}/api/hls/live/${streamId}/playlist.m3u8`;
        console.log(`DEBUG 111 HLS URL: ${hlsUrl}`);
        res.json({ hls: hlsUrl });
    } catch (err) {
        next(err);
    }
});

export default router;
