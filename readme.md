# FOV - Flexible Output View

A flexible, customizable video streaming platform that allows streamers to broadcast multi-track video/audio streams and viewers to personalize their viewing experience.

## 📋 Project Overview

FOV is a complete video streaming solution composed of two main components:

1. **Backend** (`/backend`) - Node.js/Express REST API with SRT ingest and HLS streaming
2. **Frontend** (`/fov-angular`) - Angular-based web client for streaming and viewing

### Key Features

- ✅ Multi-track video/audio streaming support
- ✅ Low-latency SRT (Secure Reliable Transport) ingest protocol
- ✅ HLS (HTTP Live Streaming) delivery to browsers
- ✅ Viewer customization of stream layout and audio mixing
- ✅ Category-based content organization
- ✅ User authentication and profiles
- ✅ Real-time stream status monitoring

---

## 🏗️ Architecture Overview

```
┌─────────────────┐     ┌──────────────────────┐
│  OBS Encoder    │     │  Browser/Client      │
│  (Streamer)     │     │  (Viewer)            │
└────────┬────────┘     └──────────┬───────────┘
         │ SRT (Port 9999)          │ HTTPS
         │                          │
    ┌────▼──────────────────────────▼────┐
    │    FOV Backend (Node.js/Express)    │
    │    Port 4000                        │
    ├─────────────────────────────────────┤
    │ • REST API (/api/users, /streams)   │
    │ • SRT Server (ingest)               │
    │ • FFmpeg Transcoding                │
    │ • HLS Stream Distribution           │
    └────┬──────────────────┬─────────────┘
         │                  │
    ┌────▼─────┐      ┌─────▼──────────┐
    │ MySQL DB │      │ HLS Media Files│
    │ fovwebdb │      │ /media/hls/    │
    └──────────┘      └────────────────┘
```

---

## 📁 Project Structure

```
web-fov/
├── backend/                    # Node.js REST API & Media Server
│   ├── src/
│   │   ├── index.js           # Express app entry point
│   │   ├── db.js              # MySQL connection pool
│   │   ├── mediaServer.mjs    # SRT server & HLS transcoding
│   │   └── routes/            # API endpoints
│   │       ├── users.js       # User management
│   │       ├── streams.js     # Stream metadata & HLS
│   │       └── categories.js  # Category management
│   ├── __tests__/             # Unit tests
│   ├── docker-compose.yml     # Local development setup
│   ├── Dockerfile             # Production container
│   └── package.json           # Dependencies
│
├── fov-angular/               # Angular Frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/    # Reusable UI components
│   │   │   ├── services/      # API clients
│   │   │   ├── pages/         # Route pages
│   │   │   └── models/        # TypeScript interfaces
│   │   ├── assets/            # Images, media
│   │   └── environments/      # Config by environment
│   ├── angular.json           # Angular CLI config
│   └── package.json           # Dependencies
│
├── docker-compose.yml         # Full stack (backend + frontend + DB)
├── docker-compose.prod.yml    # Production deployment
└── readme.md                  # This file
```

---

## 🚀 Quick Start

### Prerequisites

- **Docker** & **Docker Compose** (recommended)
- OR manually: Node.js v18+, npm v8+, MySQL 8.0+

### Option 1: Docker Compose (Recommended)

```bash
# Clone repository
git clone <repo> && cd web-fov

# Start all services (backend, frontend, MySQL)
docker-compose up --build

# Services will be available at:
# - Frontend: http://localhost:4200
# - Backend API: http://localhost:4000
# - Postgres: localhost:5432
```

### Option 2: Manual Setup

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run dev  # Runs on http://localhost:4000
```

**Frontend:**
```bash
cd fov-angular
npm install
npm start  # Runs on http://localhost:4200
```

---

## 📡 Media Pipeline

### How Streaming Works

```
1. Streamer (OBS):
   - Configures video sources (camera, screen share, etc.)
   - Sends via SRT protocol to backend (port 9999)

2. Backend (mediaServer.mjs):
   - Listens for SRT ingest
   - Transcodes with FFmpeg
   - Generates HLS segments
   - Serves .m3u8 playlists & .ts segments

3. Viewer (Browser):
   - Requests HLS playlist from API
   - Streams video segments
   - Customizes layout/audio via web client
```

### SRT Configuration

Encoders should use these settings:

| Setting | Value |
|---------|-------|
| **Protocol** | SRT |
| **Host** | backend server IP/domain |
| **Port** | 9999 |
| **Mode** | Caller |
| **Bitrate** | 5000-10000 kbps (adjust for quality) |
| **FPS** | 30 or 60 |
| **Resolution** | 1920x1080 or 1280x720 |

---

## 🎮 API Endpoints

### Base URL: `http://localhost:4000/api`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/users/:id` | GET | Get user profile |
| `/users` | POST | Create new user |
| `/streams` | GET | List all streams |
| `/streams/available` | GET | Get active streams with HLS URLs |
| `/streams/:id` | GET | Get stream details |
| `/streams/:id/hls` | GET | Get HLS playlist URL |
| `/categories` | GET | List categories |
| `/categories/:id` | GET | Get category details |

See [DOCUMENTS/API-TESTING.md](DOCUMENTS/API-TESTING.md) for detailed examples.

---

## 🛠️ Development

### Backend Development

```bash
cd backend

# Install dependencies
npm install

# Development mode (auto-reload)
npm run dev

# Run tests
npm test

# Code linting
npm run lint
npm run lint:fix
```

See [DOCUMENTS/DEVELOPMENT.md](DOCUMENTS/DEVELOPMENT.md) for details.

### Frontend Development

```bash
cd fov-angular

# Install dependencies
npm install

# Start development server
npm start

# Run tests
npm test

# Build for production
npm run build
```

---

## 📦 Deployment

### Docker Deployment

```bash
# Build images
docker build -t fov-backend backend/
docker build -t fov-frontend fov-angular/

# Run with docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

---

## 🔒 Security

**Current Status:** Beta - Security hardening in progress

### Implemented
- CORS configuration
- Connection pooling
- Environment variable separation

### TODO (High Priority)
- JWT authentication
- Input validation & sanitization
- Rate limiting
- HTTPS enforcement

See [DOCUMENTS/SECURITY.md](DOCUMENTS/SECURITY.md) for full security policy.

---

## 📖 Documentation

- [Backend Architecture](DOCUMENTS/ARCHITECTURE.md) - System design & technical justification
- [Backend API Testing](DOCUMENTS/API-TESTING.md) - API endpoint examples
- [Deployment Guide](DOCUMENTS/DEPLOYMENT.md) - Production setup
- [Development Guide](DOCUMENTS/DEVELOPMENT.md) - Development workflow
- [Security Policy](DOCUMENTS/SECURITY.md) - Security practices & roadmap
- [Changelog](DOCUMENTS/CHANGELOG.md) - Version history

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| **Can't connect to database** | Check DB_HOST/DB_USER/DB_PASSWORD in `.env`. Run `node test-db.js` |
| **SRT port already in use** | Change `SRT_PORT` in `.env` or kill process on port 9999 |
| **Frontend can't reach backend** | Verify backend is running on port 4000. Check CORS_ORIGIN in `.env` |
| **No HLS segments being generated** | Check FFmpeg is installed: `which ffmpeg` |

---

## 📝 License

See [LICENSE](LICENSE) file for details.

---

**Last Updated:** April 2026  
**Current Version:** 0.1.0 (Beta)

Set up OBS
The stream key will be used to separate the different stream as you can se on the nginx conf
```
# Define stream keys
hls_variant _stream1 BANDWIDTH=1000000; # Stream 1
hls_variant _stream2 BANDWIDTH=1000000; # Stream 2
```
![Stream settings](https://i.imgur.com/VqlS9Lh.png "OBS")

and then start obs, with the custom settings in obs.sh
```
./obs.sh
```
