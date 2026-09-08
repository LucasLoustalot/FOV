import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const fetchMock = jest.fn();
process.env.TWITCH_ID = 'test-client';
process.env.TWITCH_SECRET = 'test-secret';

jest.unstable_mockModule('node-fetch', () => ({
    default: fetchMock
}));

const { default: twitchRouter } = await import('../routes/twitch.js');

function createApp() {
    const app = express();
    app.use('/', twitchRouter);
    app.use((err, req, res, _next) => {
        res.status(500).json({ error: err.message });
    });
    return app;
}

function response(body, ok = true, statusText = 'OK') {
    return {
        ok,
        statusText,
        json: jest.fn().mockResolvedValue(body)
    };
}

describe('Twitch Routes', () => {
    let consoleErrorSpy;

    beforeAll(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('gets a token and maps top categories with the requested limit', async () => {
        fetchMock
            .mockResolvedValueOnce(response({ access_token: 'token', expires_in: 0 }))
            .mockResolvedValueOnce(response({
                data: [{
                    name: 'Gaming',
                    box_art_url: 'https://cdn.test/{width}x{height}.jpg'
                }]
            }));

        const result = await request(createApp()).get('/top-categories?limit=10');

        expect(result.status).toBe(200);
        expect(result.body).toEqual([{
            name: 'Gaming',
            viewers: '',
            image: 'https://cdn.test/285x380.jpg'
        }]);
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://id.twitch.tv/oauth2/token',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'client_id=test-client&client_secret=test-secret&grant_type=client_credentials'
            })
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://api.twitch.tv/helix/games/top?first=10',
            {
                headers: {
                    'Client-ID': 'test-client',
                    Authorization: 'Bearer token'
                }
            }
        );
    });

    test('returns an error when Twitch API responds unsuccessfully', async () => {
        fetchMock
            .mockResolvedValueOnce(response({ access_token: 'api-error-token', expires_in: 0 }))
            .mockResolvedValueOnce(response({}, false, 'Service Unavailable'));

        const result = await request(createApp()).get('/top-categories');

        expect(result.status).toBe(500);
        expect(result.body).toEqual({ error: 'Twitch API error: Service Unavailable' });
    });

    test('returns an error when token acquisition fails', async () => {
        fetchMock.mockResolvedValueOnce(response({}, false, 'Unauthorized'));

        const result = await request(createApp()).get('/top-categories');

        expect(result.status).toBe(500);
        expect(result.body).toEqual({ error: 'Token request failed: Unauthorized' });
    });

    test('uses the default category limit and cached token', async () => {
        fetchMock
            .mockResolvedValueOnce(response({ access_token: 'cached-token', expires_in: 3600 }))
            .mockResolvedValueOnce(response({ data: [] }))
            .mockResolvedValueOnce(response({ data: [] }));

        const app = createApp();
        const first = await request(app).get('/top-categories');
        const second = await request(app).get('/top-categories');

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://api.twitch.tv/helix/games/top?first=30',
            expect.any(Object)
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            'https://api.twitch.tv/helix/games/top?first=30',
            expect.any(Object)
        );
    });
});
