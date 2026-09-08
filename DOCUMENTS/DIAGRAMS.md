# FOV Backend - Architecture Diagrams & Flows

Visual representations of the FOV Backend system architecture and workflows.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Client Applications                         │
│         (Angular Frontend, Mobile Apps, Web Clients)            │
└────┬────────────────────────────────────────────────────────────┘
     │ HTTPS/HTTP Requests
     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Reverse Proxy / Load Balancer                  │
│                      (Nginx in production)                      │
└────┬────────────────────────────────────────────────────────────┘
     │
┌────▼────────────────────────────────────────────────────────────┐
│             FOV Backend - Express.js (Port 4000)                │
├─────────────────────────────────────────────────────────────────┤
│  Middleware Layer:                                              │
│  ├─ CORS (Cross-Origin Resource Sharing)                       │
│  ├─ Morgan (HTTP Request Logging)                              │
│  ├─ Express.json (JSON Parser)                                 │
│  └─ Error Handler (Centralized)                                │
├─────────────────────────────────────────────────────────────────┤
│  Routes Layer:                                                  │
│  ├─ GET  /                    (Health check)                   │
│  ├─ GET  /api/                (API status)                     │
│  ├─ GET  /api/users/:id       (Fetch user)                    │
│  ├─ POST /api/users           (Create user)                    │
│  ├─ GET  /api/categories      (List categories)                │
│  ├─ POST /api/categories      (Create category)                │
│  ├─ GET  /api/streams         (List streams)                   │
│  ├─ GET  /hls/:id/playlist    (HLS streaming)                 │
│  └─ GET  /hls/:id/:segment    (Video segments)                │
├─────────────────────────────────────────────────────────────────┤
│  Business Logic Layer:                                          │
│  ├─ Route Handlers (Async/await)                               │
│  ├─ Input Validation                                           │
│  ├─ Error Handling                                             │
│  └─ Database Queries                                           │
└────┬────────────────────────────────────────────────────────────┘
     │
     ├──────────────────────────────┬───────────────────────────────┐
     ▼                              ▼                               ▼
┌─────────────────┐    ┌────────────────────────┐    ┌──────────────────┐
│  Postgres Db    │    │  Media Server (SRT)    │    │  File System     │
│  (Port 5432)    │    │  (Port 9999)           │    │  (/media/hls)    │
├─────────────────┤    ├────────────────────────┤    ├──────────────────┤
│ Connection Pool │    │  ├─ SRT Ingest        │    │ ├─ Segments      │
│ ├─ users        │    │  ├─ FFmpeg Trans.    │    │ ├─ Playlists     │
│ ├─ streams      │    │  └─ HLS Output       │    │ └─ Metadata      │
│ └─ categories   │    │                       │    │                  │
└─────────────────┘    │ Encoder Input:        │    │ Client Playback: │
                       │ OBS Studio            │    │ HLS Players      │
                       │ FFmpeg                │    │ (Safari, iOS)    │
         │             │ StreamYard            │    │                  │
         │             │ etc.                  │    │                  │
         │             └────────────────────────┘    └──────────────────┘
         │
         └─────────────────────────────────────────────────────────────
              Persistent Data Storage & Recovery
```

---

## Module Dependency Graph

```
app (index.js)
│
├─ Express.js
│  ├─ Router (routes/index.js)
│  │  ├─ Users Route (routes/users.js)
│  │  │  └─ Database (db.js)
│  │  │     └─ MySQL Pool (mysql2/promise)
│  │  ├─ Streams Route (routes/streams.js)
│  │  │  ├─ Database (db.js)
│  │  │  ├─ File System (fs)
│  │  │  └─ Path utilities
│  │  └─ Categories Route (routes/categories.js)
│  │     └─ Database (db.js)
│  ├─ CORS (cors)
│  ├─ Morgan (morgan - logging)
│  └─ JSON Parser (express.json)
│
├─ Media Server (mediaServer.mjs)
│  ├─ Node Media Server
│  ├─ FFmpeg
│  └─ File System
│
└─ Environment Config (dotenv)
   └─ .env file
```

---

## Request Response Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ CLIENT                                                          │
│ curl -X POST /api/users -d {username: 'john'}                 │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ EXPRESS MIDDLEWARE STACK                                        │
│ ├─ CORS Middleware       → Allow origin                         │
│ ├─ Morgan Middleware     → Log request                          │
│ ├─ JSON Parser           → Parse body JSON                      │
│ └─ Route Matching        → Find handler                         │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ ROUTE HANDLER (Async)                                           │
│ ├─ Extract params/body                                         │
│ ├─ Validate input                                              │
│ │  └─ If invalid → res.status(400).json({error: '...'})       │
│ └─ Proceed to try/catch                                        │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ DATABASE OPERATION                                              │
│ ├─ Get connection from pool                                    │
│ ├─ Execute parameterized query                                │
│ │  └─ INSERT INTO users (username) VALUES (?)                 │
│ └─ Release connection back to pool                             │
└────────────────┬────────────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
    SUCCESS           ERROR
    └─ Catch           └─ Catch Error
       ├─ Get insertId  ├─ Log error internally
       ├─ res.status    ├─ Generic message to client
       │  (201)         ├─ res.status(500)
       └─ Send JSON     └─ next(error)
          {id: 42}           │
                             ▼
                   ┌──────────────────────┐
                   │ Global Error Handler │
                   │ res.status(500)      │
                   │ .json({error: msg})  │
                   └──────────────────────┘
```

---

## Testing Flow

```
┌──────────────────────────────────────────────────────────────┐
│ DEVELOPER WRITES TEST                                        │
│                                                              │
│ describe('Users', () => {                                   │
│   test('should create user', async () => {                 │
│     db.query.mockResolveValue({insertId: 42})             │
│     const res = await request(app).post('/api/users')     │
│     expect(res.status).toBe(201)                          │
│   })                                                        │
│ })                                                          │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ npm test (or: npm run test:watch)                            │
│                                                              │
│ Jest reads jest.config.js                                   │
│   ├─ testMatch: '**/__tests__/**/*.test.js'                │
│   ├─ collectCoverageFrom: src/**/*.js                       │
│   └─ coverageThreshold: 50%                                 │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ TEST EXECUTION                                               │
│                                                              │
│ For each test file:                                         │
│ ├─ Mock external dependencies (db.js)                       │
│ ├─ Run beforeEach hooks                                     │
│ ├─ Execute test code                                        │
│ │  ├─ Setup test data (Arrange)                            │
│ │  ├─ Call function under test (Act)                       │
│ │  └─ Verify results (Assert)                              │
│ ├─ Run afterEach hooks (cleanup)                            │
│ └─ Record pass/fail status                                  │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ COVERAGE ANALYSIS                                            │
│                                                              │
│ Instrument code and track execution:                        │
│ ├─ Statements: 62% (123/198 lines)                         │
│ ├─ Branches: 48% (72/150 decision paths)                   │
│ ├─ Functions: 70% (35/50 functions)                        │
│ └─ Lines: 65% (128/197 lines)                              │
│                                                              │
│ If coverage < 50%:                                          │
│ └─ ❌ Tests FAIL (threshold not met)                        │
└────────────────┬─────────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
    ✅ PASS           ❌ FAIL
    │                 │
    ├─ All tests      ├─ Some tests failed
    ├─ Coverage OK    ├─ Or coverage too low
    └─ Coverage       └─ Show errors
       report         └─ Developer fixes
       displayed
```

---

## Linting Flow

```
┌────────────────────────────────────────────────────────────┐
│ DEVELOPER SOURCE CODE                                      │
│                                                            │
│ var username = req.body.username;  // Bad style           │
│ var name='John'                    // Bad style           │
│ if(auth==true) {                   // Bad style           │
│   console.log('debug')             // Bad practice        │
│ }                                                          │
└────────────────┬───────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│ npm run lint (or: npm run lint:fix)                        │
│                                                            │
│ Reads .eslintrc.json:                                     │
│ ├─ indent: ["error", 4]                                  │
│ ├─ quotes: ["error", "single"]                           │
│ ├─ semi: ["error", "always"]                             │
│ ├─ no-var: "error"                                       │
│ ├─ eqeqeq: ["error", "always"]                           │
│ ├─ no-console: ["warn"]                                  │
│ └─ prefer-const: "error"                                 │
└────────────────┬───────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│ ESLINT ANALYSIS                                            │
│                                                            │
│ For each .js file in src/:                               │
│ ├─ Parse code into AST                                   │
│ ├─ Check against rules                                   │
│ │  ├─ "var" found → ERROR: no-var                       │
│ │  ├─ Double quotes → ERROR: quotes                     │
│ │  ├─ No semicolon → ERROR: semi                        │
│ │  ├─ console.log → WARNING: no-console                 │
│ │  └─ == operator → ERROR: eqeqeq                       │
│ └─ Collect violations                                    │
└────────────────┬───────────────────────────────────────────┘
                 │
        ┌────────┴────────────────────┐
        │                             │
        ▼                             ▼
   npm run lint              npm run lint:fix
   (Show violations)         (Auto-fix violations)
   │                         │
   ├─ /src/users.js          ├─ var → const
   │  5:4 error: no-var      ├─ '' → ""
   │  12:1 error: semi       ├─ == → ===
   │  ...                    └─ Add semicolons
   │
   └─ Developer fixes        Creates fixed code:
      manually

                             const username = req.body.username;
                             const name = 'John';
                             if (auth === true) {
                               // console removed or kept depending on rule
                             }
```

---

## CI/CD Pipeline (GitHub Actions)

```
┌─────────────────────────────────────────────────────────────┐
│ DEVELOPER PUSH                                              │
│ git push origin feature/my-feature                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ GITHUB WEBHOOK                                              │
│                                                             │
│ Detects push to "backend/**" directory                      │
│ Triggers: .github/workflows/backend-tests.yml              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ GitHub Actions Runner (Ubuntu Latest)                       │
│ ├─ Step 1: Checkout Code                                  │
│ ├─ Step 2: Setup Node.js v20                              │
│ ├─ Step 3: npm ci (clean install)                         │
│ ├─ Step 4: npm run lint (check code style)                │
│ ├─ Step 5: npm test (run tests with coverage)             │
│ └─ Step 6: Upload coverage report                         │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
    ✅ ALL PASS       ❌ ANY FAIL
    │                 │
    ├─ Green check   ├─ Red X
    ├─ Can merge     ├─ Cannot merge
    │   (if branch   │   until fixed
    │   protection)  │
    └─ PR shows ✓    └─ PR shows ✗
       All checks       Check failed
       passed           Details link


Create Pull Request (Push triggers CI)
         │
         ▼
    Wait for Actions
         │
      ┌──┴──┐
      │     │
      ▼     ▼
    PASS  FAIL
    │     │
    ├─OK  ├─Fix code
    │     │  └─ npm run lint:fix
    │     │  └─ npm test
    │     │  └─ git add . && git push
    │     │  └─ CI runs again
    │     │  └─ (repeat until PASS)
    │     │
    ▼     └────┐
   Request      │
   Review       │
      │        │
   Approve     │
      │        │
    Merge ◄────┘
      │
      ▼
   ✅ MERGED
```

---

## Deployment Flow

```
┌──────────────────────────────────────────────────┐
│ SOURCE CODE                                      │
│ (backend/ directory)                             │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│ DOCKERFILE                                       │
│                                                  │
│ FROM node:20                                    │
│ WORKDIR /app                                    │
│ COPY package*.json .                            │
│ RUN npm ci --only=production                    │
│ COPY src/ src/                                  │
│ EXPOSE 4000                                     │
│ CMD ["npm", "start"]                            │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│ BUILD IMAGE                                      │
│ docker build -t fov-backend:1.0.0 .              │
│                                                  │
│ Image created: fov-backend:1.0.0                │
└────────────┬─────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────┐
│ PUSH TO REGISTRY                                 │
│ docker push registry.io/fov-backend:1.0.0        │
└────────────┬─────────────────────────────────────┘
             │
        ┌────┴────┐
        │          │
        ▼          ▼
   DOCKER      DOCKER
   COMPOSE     SWARM / K8S
   │           │
   ├─docker-   ├─Pull image
   │  compose  ├─Create service
   │  up       ├─Deploy replicas
   │           └─Load balancing
   │
   └─Start    └─Health checks
             │
             ▼
        ┌──────────────────────────────────┐
        │ RUNNING CONTAINER(S)             │
        │ fov-backend:1.0.0                │
        │                                  │
        │ Port 4000 exposed                │
        │ Mounted volumes:                 │
        │ ├─ /media (persistent)          │
        │ ├─ .env (secrets)                │
        │ └─ Logs                          │
        │                                  │
        │ Health checks                    │
        │ ├─ GET / (every 30s)            │
        │ └─ Restart if fails              │
        └──────────────────────────────────┘

        Health Check Loop:
        ├─ Success → Running ✅
        ├─ Failure → Retry
        │ └─ Still fails → Restart container
        └─ Persistent failure → Alert on-call
```

---

## Database Changes Flow

```
┌────────────────────────────────────────────┐
│ ADD NEW DATABASE FEATURE                   │
│ (e.g., new column in users table)         │
└────────────┬───────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────┐
│ UPDATE CODE                                │
│ ├─ Write SQL query with new column        │
│ ├─ Update route handler                   │
│ ├─ Add tests for new functionality        │
│ └─ Update documentation                   │
└────────────┬───────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────┐
│ LOCAL TESTING                              │
│ ├─ Update local .env if needed            │
│ ├─ Run migrations (manual SQL)             │
│ ├─ npm run lint:fix && npm test           │
│ └─ Manual endpoint testing                 │
└────────────┬───────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────┐
│ COMMIT & PUSH                              │
│ └─ Triggers GitHub Actions                 │
└────────────┬───────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────┐
│ PRODUCTION DEPLOYMENT                      │
│ (After PR merged)                          │
│                                            │
│ 1. Backup database                         │
│ 2. Build new Docker image                  │
│ 3. Run schema migrations                   │
│ 4. Deploy new container(s)                 │
│ 5. Health checks                           │
│ 6. Monitor for issues                      │
│ 7. Keep backup for rollback                │
└────────────────────────────────────────────┘
```

---

## Error Handling Flow

```
Client Request
     │
     ▼
Express Route Handler
     │
  try/catch
     │
  ┌──┴──┐
  │     │
  ▼     ▼
SUCCESS ERROR
│       │
├─   ├─ Caught exception
│      │
│      ├─ Log error (internal)
│      │  └─ console.error or Winston
│      │
│      ├─ Generic response
│      │  └─ res.status(500)
│      │     .json({error: "Internal server error"})
│      │
│      └─ next(error)
│         │
│         ▼
│    Global Error Handler
│         │
│         ├─ Log error with context
│         ├─ Ensure no stacktrace exposed
│         └─ Send generic response
│
└─ res.status(200/201/etc)
   .json(data)

Database Connection:
  pool.getConnection()
    └─ try/finally
       └─ Always release connection
          (even if error)
```

---

**Last Updated**: April 2026
