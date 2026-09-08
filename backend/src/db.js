import * as dotenv from 'dotenv';
dotenv.config();
import { Pool } from 'pg';

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fovwebdb',
    max: 5,
    idleTimeoutMillis: 30000,
    keepAlive: true
});

function toPostgresPlaceholders(text) {
    let index = 0;
    return text.replace(/\?/g, () => `$${++index}`);
}

export default {
    pool,
    async query(text, params = []) {
        const sql = params.length > 0 ? toPostgresPlaceholders(text) : text;
        const res = await pool.query(sql, params);
        return res.rows;
    },
    async getClient() {
        return pool.connect();
    }
};