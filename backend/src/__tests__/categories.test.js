import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

// Mock the database module
jest.unstable_mockModule('../db.js', () => ({
    default: {
        query: jest.fn()
    }
}));

const { default: db } = await import('../db.js');

// Mock router - simplified version of categories endpoint
const categoriesRouter = express.Router();

categoriesRouter.get('/', async (req, res, next) => {
    try {
        const rows = await db.query('SELECT id, name, description FROM categories');
        res.json({ data: rows });
    } catch (err) {
        next(err);
    }
});

categoriesRouter.post('/', async (req, res, next) => {
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'name required' });
    }
    try {
        const result = await db.query(
            'INSERT INTO categories (name, description) VALUES (?, ?)',
            [name, description || null]
        );
        res.status(201).json({ id: result.insertId });
    } catch (err) {
        next(err);
    }
});

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
        test('should return all categories', async () => {
            const mockCategories = [
                { id: 1, name: 'Gaming', description: 'Gaming streams' },
                { id: 2, name: 'Music', description: 'Music streams' }
            ];

            db.query.mockResolvedValue(mockCategories);

            const response = await request(app).get('/');

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual(mockCategories);
            expect(db.query).toHaveBeenCalledWith(
                'SELECT id, name, description FROM categories'
            );
        });

        test('should return empty array when no categories', async () => {
            db.query.mockResolvedValue([]);

            const response = await request(app).get('/');

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual([]);
        });

        test('should handle database errors', async () => {
            db.query.mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app).get('/');

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('POST /', () => {
        test('should create a new category', async () => {
            const newCategory = {
                name: 'Sports',
                description: 'Sports streams'
            };

            db.query.mockResolvedValue({ insertId: 3 });

            const response = await request(app)
                .post('/')
                .send(newCategory);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id', 3);
            expect(db.query).toHaveBeenCalledWith(
                'INSERT INTO categories (name, description) VALUES (?, ?)',
                ['Sports', 'Sports streams']
            );
        });

        test('should create category without description', async () => {
            db.query.mockResolvedValue({ insertId: 4 });

            const response = await request(app)
                .post('/')
                .send({ name: 'Art' });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id', 4);
            expect(db.query).toHaveBeenCalledWith(
                'INSERT INTO categories (name, description) VALUES (?, ?)',
                ['Art', null]
            );
        });

        test('should return 400 when name is missing', async () => {
            const response = await request(app)
                .post('/')
                .send({ description: 'No name provided' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'name required');
        });

        test('should handle duplicate category error', async () => {
            db.query.mockRejectedValue(new Error('Duplicate entry for key name'));

            const response = await request(app)
                .post('/')
                .send({ name: 'Gaming' });

            expect(response.status).toBe(500);
        });
    });
});
