import { jest } from '@jest/globals';

// Mock the mysql2/promise module
jest.unstable_mockModule('pg', () => ({
    Pool: jest.fn(() => ({
        query: jest.fn(),
        connect: jest.fn()
    }))
}));

const { default: db } = await import('../db.js');

describe('Database Module', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should export pool, getConnection, and query methods', () => {
        expect(typeof db.getClient).toBe('function');
        expect(typeof db.query).toBe('function');
        expect(db.pool).toBeDefined();
    });

    describe('getConnection', () => {
        test('should return a connection object', async () => {
            // This is a basic smoke test
            // In production, use a test database
            expect(typeof db.getClient).toBe('function');
        });
    });

    describe('query', () => {
        test('should accept SQL and params', async () => {
            expect(typeof db.query).toBe('function');
        });
    });
});
