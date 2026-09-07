import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';

import db from './db.js';
import apiRoutes from './routes/index.js';
import { createMediaRoutes, startMediaServer } from './mediaServer.mjs';
import swaggerDocument from './swagger.js';

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.enable('trust proxy');

// Mount media routes (HLS and FFmpeg endpoints)
const mediaRouter = createMediaRoutes();
app.use(mediaRouter);

app.get('/', (req, res) => res.json({ ok: true, message: 'FOV backend running' }));
app.get('/api-docs.json', (req, res) => res.json(swaggerDocument));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Mount API routes under /api
app.use('/api', apiRoutes);

app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

async function start() { 
    try {
        // verify PostgreSQL connection
        await db.query('SELECT 1');
        console.log('✅ Connected to BDD');

        // initialize media server
        await startMediaServer(app);

        const server = app.listen(PORT, () => {
            console.log(`🚀 Server listening on http://localhost:${PORT}`);
            console.log(`📺 HLS available at http://localhost:${PORT}/api/hls`);
        });

        // Handle server errors
        server.on('error', (err) => {
            console.error('Server error:', err);
            process.exit(1);
        });
    } catch (err) {
        console.error('Unable to connect to DB', err);
        process.exit(1);
    }
}

start();
