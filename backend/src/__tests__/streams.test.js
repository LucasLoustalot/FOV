import express from 'express';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mediaRoot = path.join(__dirname, 'test-media');
const hlsRoot = path.join(mediaRoot, 'hls');

const dbQuery = jest.fn();
const readdirSync = jest.fn();
const resolveTrackIsVideo = jest.fn();
const sortTrackIds = jest.fn(trackIds => [...trackIds].sort((a, b) => Number(a) - Number(b)));

process.env.MEDIA_ROOT = mediaRoot;
delete process.env.API_HOSTNAME;
delete process.env.API_PROTOCOL;

jest.unstable_mockModule('../db.js', () => ({
    default: { query: dbQuery }
}));
jest.unstable_mockModule('fs', () => ({
    default: { readdirSync }
}));
jest.unstable_mockModule('../mediaServer.mjs', () => ({
    ffmpegProcesses: new Map()
}));
jest.unstable_mockModule('../streamTrackUtils.js', () => ({
    resolveTrackIsVideo,
    sortTrackIds
}));

const { default: streamsRouter } = await import('../routes/streams.js');

function createApp() {
    const app = express();
    app.use('/', streamsRouter);
    app.use((err, req, res, _next) => {
        res.status(500).json({ error: err.message });
    });
    return app;
}

function setDirectoryEntries(entries) {
    readdirSync.mockImplementation(directory => {
        if (directory === hlsRoot) {
            return entries;
        }
        return [{ name: '10', isDirectory: () => true }, { name: '2', isDirectory: () => true }];
    });
}

describe('Streams Routes', () => {
    let consoleErrorSpy;
    let consoleLogSpy;

    beforeAll(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
        consoleLogSpy.mockRestore();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resolveTrackIsVideo.mockResolvedValue(true);
        setDirectoryEntries([]);
        delete process.env.API_HOSTNAME;
        delete process.env.API_PROTOCOL;
    });

    test('lists streams from the database', async () => {
        const rows = [{ id: 1, title: 'Live now' }];
        dbQuery.mockResolvedValue(rows);

        const response = await request(createApp()).get('/');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(rows[0]);
        expect(dbQuery).toHaveBeenCalledWith(
            'SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams ORDER BY viewers DESC'
        );
    });

    test('returns a stream by id and handles missing streams', async () => {
        dbQuery.mockResolvedValueOnce([{ id: 4, title: 'Found' }]);
        const found = await request(createApp()).get('/4');
        expect(found.status).toBe(200);
        expect(found.body).toEqual({ id: 4, title: 'Found' });
        expect(dbQuery).toHaveBeenCalledWith(
            'SELECT id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live FROM streams WHERE id = ?',
            ['4']
        );

        dbQuery.mockResolvedValueOnce([]);
        const missing = await request(createApp()).get('/99');
        expect(missing.status).toBe(404);
        expect(missing.body).toEqual({ error: 'Stream not found' });
    });

    test('returns an HLS URL using the request host and protocol', async () => {
        const response = await request(createApp()).get('/abc/hls').set('Host', 'stream.example.test');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            hls: 'http://stream.example.test/api/hls/live/abc/playlist.m3u8'
        });
    });

    test('builds available streams with sorted tracks and database metadata', async () => {
        setDirectoryEntries([
            { name: '12', isDirectory: () => true },
            { name: '2', isDirectory: () => true },
            { name: 'live', isDirectory: () => true }
        ]);
        dbQuery.mockResolvedValueOnce([{
            title: 'Concert',
            category: 'Music',
            viewers: 123,
            avatar_url: 'avatar.png',
            thumbnail_url: 'thumb.png'
        }]).mockResolvedValueOnce([]);

        const response = await request(createApp()).get('/available').set('Host', 'edge.example.test:8080');

        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers.pragma).toBe('no-cache');
        expect(response.body).toEqual([
            {
                streamId: '12',
                trackCount: 2,
                tracks: [
                    {
                        trackId: '2',
                        videoUrl: 'http://edge.example.test:8080/api/hls/12/2/playlist.m3u8',
                        isVideo: true
                    },
                    {
                        trackId: '10',
                        videoUrl: 'http://edge.example.test:8080/api/hls/12/10/playlist.m3u8',
                        isVideo: true
                    }
                ],
                title: 'Concert',
                category: 'Music',
                viewers: 123,
                avatarUrl: 'avatar.png',
                thumbnailUrl: 'thumb.png'
            },
            {
                streamId: '2',
                trackCount: 2,
                tracks: [
                    {
                        trackId: '2',
                        videoUrl: 'http://edge.example.test:8080/api/hls/2/2/playlist.m3u8',
                        isVideo: true
                    },
                    {
                        trackId: '10',
                        videoUrl: 'http://edge.example.test:8080/api/hls/2/10/playlist.m3u8',
                        isVideo: true
                    }
                ],
                title: '',
                category: '',
                viewers: 0,
                avatarUrl: '',
                thumbnailUrl: ''
            },
            {
                streamId: 'live',
                trackCount: 2,
                tracks: [
                    {
                        trackId: '2',
                        videoUrl: 'http://edge.example.test:8080/api/hls/live/2/playlist.m3u8',
                        isVideo: true
                    },
                    {
                        trackId: '10',
                        videoUrl: 'http://edge.example.test:8080/api/hls/live/10/playlist.m3u8',
                        isVideo: true
                    }
                ],
                title: '',
                category: '',
                viewers: 0,
                avatarUrl: '',
                thumbnailUrl: ''
            }
        ]);
        expect(resolveTrackIsVideo).toHaveBeenCalledTimes(6);
    });

    test('continues with tracks when stream metadata lookup fails', async () => {
        setDirectoryEntries([{ name: '7', isDirectory: () => true }]);
        dbQuery.mockRejectedValue(new Error('database unavailable'));

        const response = await request(createApp()).get('/available');

        expect(response.status).toBe(200);
        expect(response.body[0]).toMatchObject({
            streamId: '7',
            title: '',
            category: '',
            viewers: 0
        });
    });

    test('forwards HLS directory errors to error middleware', async () => {
        readdirSync.mockImplementation(() => {
            throw new Error('HLS directory unavailable');
        });

        const response = await request(createApp()).get('/available');

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'HLS directory unavailable' });
    });
});
