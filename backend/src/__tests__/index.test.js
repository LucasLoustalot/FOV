import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

function mockRouter() {
    const router = express.Router();
    router.get('/sentinel', (req, res) => res.json({ mounted: true }));
    return router;
}

jest.unstable_mockModule('../routes/categories.js', () => ({ default: mockRouter() }));
jest.unstable_mockModule('../routes/streams.js', () => ({ default: mockRouter() }));
jest.unstable_mockModule('../routes/users.js', () => ({ default: mockRouter() }));
jest.unstable_mockModule('../routes/twitch.js', () => ({ default: mockRouter() }));

const { default: apiRouter } = await import('../routes/index.js');

describe('API router', () => {
    test('returns the API health response', async () => {
        const app = express();
        app.use('/api', apiRouter);

        const response = await request(app).get('/api');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true, api: true });
    });

    test('mounts each feature router under its API prefix', async () => {
        const app = express();
        app.use('/api', apiRouter);

        for (const prefix of ['categories', 'streams', 'users', 'twitch']) {
            const response = await request(app).get(`/api/${prefix}/sentinel`);
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ mounted: true });
        }
    });
});
