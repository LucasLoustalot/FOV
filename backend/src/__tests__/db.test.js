import { jest } from '@jest/globals';

const poolQuery = jest.fn();
const poolConnect = jest.fn();

jest.unstable_mockModule('pg', () => ({
    Pool: jest.fn(() => ({
        query: poolQuery,
        connect: poolConnect
    }))
}));

const { default: db } = await import('../db.js');

describe('Database Module', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('exports the pool and adapter methods', () => {
        expect(typeof db.getClient).toBe('function');
        expect(typeof db.query).toBe('function');
        expect(db.pool).toBeDefined();
    });

    describe('getClient', () => {
        test('delegates to the pool connection method', async () => {
            const client = { release: jest.fn() };
            poolConnect.mockResolvedValue(client);

            await expect(db.getClient()).resolves.toBe(client);
            expect(poolConnect).toHaveBeenCalledTimes(1);
        });
    });

    describe('query', () => {
        test('converts question-mark placeholders and returns rows', async () => {
            poolQuery.mockResolvedValue({ rows: [{ id: 1 }] });

            await expect(db.query('SELECT * FROM users WHERE id = ? AND name = ?', [1, 'Ada']))
                .resolves.toEqual([{ id: 1 }]);
            expect(poolQuery).toHaveBeenCalledWith(
                'SELECT * FROM users WHERE id = $1 AND name = $2',
                [1, 'Ada']
            );
        });

        test('leaves SQL without parameters unchanged', async () => {
            poolQuery.mockResolvedValue({ rows: [] });

            await expect(db.query('SELECT NOW()')).resolves.toEqual([]);
            expect(poolQuery).toHaveBeenCalledWith('SELECT NOW()', []);
        });
    });
});
