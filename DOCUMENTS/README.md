# FOV Backend - README

## Project Overview

The **FOV Backend** is an Express.js-based REST API and media streaming server that powers the FOV video streaming platform. It handles user management, stream metadata, categories, and serves HLS (HTTP Live Streaming) content for live and on-demand video delivery.

**Key Features:**
- RESTful API for users, streams, and categories
- MySQL database integration with connection pooling
- HLS streaming support via SRT ingest
- CORS-enabled for multi-origin requests
- Comprehensive error handling and logging
- Docker-ready deployment

---

## Table of Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Project Structure](#project-structure)
4. [Running the Server](#running-the-server)
5. [API Endpoints](#api-endpoints)
6. [Testing](#testing)
7. [Linting & Code Quality](#linting--code-quality)
8. [Deployment](#deployment)
9. [Documentation](#documentation)
10. [Troubleshooting](#troubleshooting)

---

## Installation

### Prerequisites

- **Node.js**: v18+ (v20 recommended)
- **npm**: v8+
- **MySQL**: v8.0+ (for development and production)
- **FFmpeg**: Required for media transcoding (optional, if using media server features)

### Steps

1. **Clone and navigate to the backend:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your database and server configuration
   ```

4. **Verify database connection:**
   ```bash
   node test-db.js
   ```

---

## Configuration

### Environment Variables

Create a `.env` file in the `backend/` directory. See `.env.example` for template.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | int | 4000 | Express server port |
| `NODE_ENV` | string | development | Environment (development/production) |
| `DB_HOST` | string | localhost | MySQL host |
| `DB_USER` | string | admin | MySQL user |
| `DB_PASSWORD` | string | (required) | MySQL password |
| `DB_NAME` | string | fovwebdb | Database name |
| `MEDIA_ROOT` | string | ./media | Path to HLS and media files |
| `FFMPEG_PATH` | string | auto-detected | Path to FFmpeg binary |
| `CORS_ORIGIN` | string | * | CORS allowed origin |

### Production Configuration

For production, create `.env.production` based on `.env.production.example`:

```bash
cp .env.production.example .env.production
# Update with production credentials and endpoints
```

---

## Project Structure

```
backend/
├── src/
│   ├── index.js                 # Express app initialization & server startup
│   ├── db.js                    # MySQL connection pool & helper methods
│   ├── mediaServer.mjs          # SRT server & HLS transcoding setup
│   └── routes/
│       ├── index.js             # Route aggregator
│       ├── users.js             # User CRUD operations
│       ├── streams.js           # Stream metadata & HLS playlists
│       └── categories.js        # Category management
├── src/__tests__/               # Unit tests
│   ├── db.test.js
│   └── users.test.js
├── media/
│   ├── hls/                     # HLS segments & manifests
│   └── .gitkeep
├── .eslintrc.json               # ESLint configuration
├── jest.config.js               # Jest test configuration
├── package.json                 # Dependencies & scripts
├── .env.example                 # Environment template
├── .env.production.example      # Production environment template
├── Dockerfile                   # Docker image definition
├── README.md                    # This file
├── ARCHITECTURE.md              # System design & justification
├── DEVELOPMENT.md               # Development guide
├── DEPLOYMENT.md                # Deployment instructions
├── CHANGELOG.md                 # Version history
└── SECURITY.md                  # Security policies & practices
```

---

## Running the Server

### Development

Start with automatic restart on file changes:

```bash
npm run dev
```

Server will be available at `http://localhost:4000`

### Production

```bash
npm start
```

Ensure environment variables are properly set in `.env` or the environment.

---

## API Endpoints

### Users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user

**Example:**
```bash
# Create user
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"john_doe","display_name":"John Doe"}'

# Get user
curl http://localhost:4000/api/users/1
```

### Streams
- `GET /api/streams` - List all streams
- `GET /api/streams/:id` - Get stream details & HLS playlist
- `POST /api/streams` - Create new stream

### Categories
- `GET /api/categories` - List all categories
- `POST /api/categories` - Create new category

### Media (HLS)
- `GET /hls/:stream_id/playlist.m3u8` - Master HLS playlist
- `GET /hls/:stream_id/:segment.ts` - Video segments

---

## Testing

### Run All Tests

```bash
npm test
```

This runs all tests in `src/__tests__/` and generates a coverage report.

### Run Tests in Watch Mode

```bash
npm run test:watch
```

Useful during development to re-run tests on file changes.

### View Coverage Report

After running tests, open `coverage/lcov-report/index.html` in your browser.

### Test Structure

Tests are organized following the module structure:
- `db.test.js` - Database connection and query testing
- `users.test.js` - User route tests (CRUD operations)

---

## Linting & Code Quality

### Run Linter

Check for code style issues:

```bash
npm run lint
```

### Auto-Fix Linting Issues

```bash
npm run lint:fix
```

### Code Standards

The project enforces:
- **Indentation**: 4 spaces
- **Quotes**: Single quotes
- **Semicolons**: Always required
- **Variable Declaration**: `const` preferred, no `var`
- **Equality**: Strict equality (`===`)
- **Naming**: camelCase for variables/functions, PascalCase for classes

See `.eslintrc.json` for complete rules.

---

## Deployment

### Docker

Build and run using Docker:

```bash
# Build image
docker build -t fov-backend:latest .

# Run container
docker run -p 4000:4000 \
  -e DB_HOST=mysql-host \
  -e DB_USER=admin \
  -e DB_PASSWORD=xxxx \
  -e DB_NAME=fovwebdb \
  fov-backend:latest
```

### Docker Compose

```bash
docker-compose up -d
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

### GitHub Actions CI/CD

The project includes automated testing and linting on push/PR:
- **File**: `.github/workflows/backend-tests.yml`
- **Triggers**: Push to `backend/` or PR to main
- **Steps**: Install → Lint → Test

---

## Additional Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design, technology stack justification, data flows
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Development setup, debugging, contribution guidelines
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment, scaling, backup strategies
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and feature updates
- **[SECURITY.md](SECURITY.md)** - Security practices, authentication, data protection

---

## Troubleshooting

### Database Connection Failed

```
Unable to connect to DB Error: ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**
1. Verify Postgres is running
2. Check `.env` credentials match your Postgres setup
3. Ensure database fovwebdb exists

### Port Already in Use

```
Error: listen EADDRINUSE :::4000
```

**Solutions:**
1. Change PORT in `.env`: `PORT=5000`
2. Kill existing process: `lsof -ti:4000 | xargs kill -9`

### Tests Failing

Run with verbose output:
```bash
npm test -- --verbose
```

Check test database connectivity in `.env`.

### Linting Errors

Auto-fix most issues:
```bash
npm run lint:fix
```

---

## Support & Contributing

For issues, improvements, or questions:
1. Review [DEVELOPMENT.md](DEVELOPMENT.md) for contribution guidelines
2. Check existing issues/documentation
3. Submit bug reports with test cases and logs

---

**Last Updated**: April 2026
**Maintainer**: FOV Development Team
