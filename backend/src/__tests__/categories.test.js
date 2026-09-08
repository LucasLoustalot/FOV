import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../db.js', () => ({
    default: {
        query: jest.fn()
    }
}));

const { default: db } = await import('../db.js');
const { default: categoriesRouter } = await import('../routes/categories.js');

describe('Categories Routes', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/', categoriesRouter);
        app.use((err, req, res, _next) => {
            res.status(500).json({ error: err.message });
        });
        jest.clearAllMocks();
    });

    describe('GET /', () => {
        test('returns the first category query result', async () => {
            const mockCategories = [{ id: 1, name: 'Gaming', viewers: 100 }];

            db.query.mockResolvedValue(mockCategories);

            const response = await request(app).get('/');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockCategories[0]);
            expect(db.query).toHaveBeenCalledWith(
                'SELECT id, name, viewers, image_url FROM categories ORDER BY viewers DESC'
            );
        });

        test('should handle database errors', async () => {
            db.query.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app).get('/');

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('GET /:id', () => {
        test('returns a category by id', async () => {
            const category = { id: 7, name: 'Sports', viewers: 42 };
            db.query.mockResolvedValue([category]);

            const response = await request(app).get('/7');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(category);
            expect(db.query).toHaveBeenCalledWith(
                'SELECT id, name, viewers, image_url FROM categories WHERE id = ?',
                ['7']
            );
        });

        test('returns 404 when a category does not exist', async () => {
            db.query.mockResolvedValue([]);

            const response = await request(app).get('/999');

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ error: 'Categorie not found' });
        });

        test('forwards database errors', async () => {
            db.query.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app).get('/7');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ error: 'Database connection failed' });
        });
    });
});
