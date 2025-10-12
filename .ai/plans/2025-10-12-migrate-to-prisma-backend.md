# Migration Plan: sql.js → SQLite + Prisma Backend

**Date:** 2025-10-12
**Status:** Planning
**Goal:** Migrate from sql.js (in-memory with file persistence) to a proper backend service using SQLite + Prisma

## Motivation

sql.js is proving too immature for our use case:
- In-memory database requires manual save operations
- No concurrent access support
- WASM overhead and complexity
- Limited tooling and migration support

## Current State

### sql.js Implementations
- **`src/generated-images-db.ts`**: Standalone implementation for image tracking
- **`extension/jarvis4-worldview-updater/src/database.ts`**: VSCode extension for highlights

### Database
- **Location**: `jarvis4/db.sqlite`
- **Tables**:
  - `highlights` - Tracking state (NEW/INTEGRATED/ARCHIVED), snooze history, visibility
  - `generated_images` - Image URLs mapped to entry hashes and document IDs
  - `metadata` - Key-value store (e.g., lastReadwiseFetch timestamp)

### Existing Scripts
- Direct sqlite3 CLI access via npm scripts
- Migration scripts in `extension/jarvis4-worldview-updater/migrations/`
- Raycast script opens Cursor and triggers extension

## Target Architecture

```
jarvis4/
├── src/
│   ├── server.ts                  # Fastify server entry point
│   ├── db/
│   │   ├── client.ts              # Prisma client singleton
│   │   └── seed.ts                # Optional seeding
│   ├── routes/
│   │   ├── highlights.ts          # Highlight CRUD endpoints
│   │   ├── generated-images.ts    # Image tracking endpoints
│   │   └── metadata.ts            # Metadata endpoints
│   └── services/
│       ├── highlightService.ts    # Business logic for highlights
│       └── imageService.ts        # Business logic for images
├── prisma/
│   ├── schema.prisma              # Prisma schema definition
│   └── migrations/                # Prisma migrations folder
│       └── <timestamp>_init/      # Initial migration from sql.js schema
├── db.sqlite                      # SQLite database file
├── scripts/
│   ├── open-worldview.sh          # Updated with backend check/start
│   └── migrate-sql-to-prisma.ts   # One-time migration script
├── package.json
└── tsconfig.json
```

## Technology Decisions

### Backend Stack
- **Fastify** (over Express)
  - Faster performance
  - Better TypeScript support out of the box
  - Built-in schema validation
  - Modern plugin architecture

- **Prisma** (ORM)
  - Type-safe database client
  - Excellent migration tooling
  - Auto-generates TypeScript types
  - Great developer experience

- **SQLite** (Database)
  - Keep same DB format for easier migration
  - File-based simplicity
  - No server process required

### Process Management
- **launchd**: Backend managed as macOS user agent (launchd, not systemd)
- **Service name**: `com.jasonbenn.jarvis4-backend`
- **Plist location**: `~/Library/LaunchAgents/com.jasonbenn.jarvis4-backend.plist`
- **Health check**: `GET /health` endpoint returns 200 when running
- **Port**: 3456 (configurable via `JARVIS4_PORT` env var)
- **Logs**: stdout/stderr redirected to `~/code/jarvis4/logs/backend.log`
- **Error handling**: VSCode extension shows helpful error message if backend is down on startup

### Database Location
- **New location**: `jarvis4/db.sqlite`
- Prisma will manage the SQLite file in the project root
- Migration script converts existing data from old location

## API Design

### Endpoints

```
GET    /health                          # Health check (returns 200 OK)

# Highlights
GET    /highlights                      # Get visible highlights (status=NEW, past next_show_date)
GET    /highlights/:id                  # Get single highlight state
POST   /highlights/:id/track            # Track new highlight (creates if not exists)
PATCH  /highlights/:id/status           # Update status (INTEGRATED/ARCHIVED)
PATCH  /highlights/:id/snooze           # Snooze highlight (body: { durationWeeks: 4 })

# Generated Images
GET    /generated-images/:entryHash     # Find image by entry hash
POST   /generated-images                # Create new image record (body: { entryHash, imageUrl })
PATCH  /generated-images/:entryHash     # Update document_id (body: { documentId })

# Metadata
GET    /metadata/:key                   # Get metadata value
PUT    /metadata/:key                   # Set metadata value (body: { value })
```

### Example Request/Response

```typescript
// GET /highlights
Response: {
  highlights: [
    {
      id: "abc123",
      status: "NEW",
      snoozeHistory: ["2025-09-15T10:00:00Z"],
      nextShowDate: null,
      firstSeen: "2025-09-01T08:00:00Z",
      lastUpdated: "2025-09-15T10:00:00Z"
    }
  ]
}

// PATCH /highlights/abc123/snooze
Request: { durationWeeks: 4 }
Response: { success: true }
```

## Prisma Schema

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./db.sqlite"
}

generator client {
  provider = "prisma-client-js"
}

model Highlight {
  id            String    @id
  status        String    @default("NEW") // NEW, INTEGRATED, ARCHIVED
  snoozeHistory String?   // JSON string
  nextShowDate  DateTime?
  firstSeen     DateTime
  lastUpdated   DateTime

  @@index([status])
  @@index([nextShowDate])
}

model GeneratedImage {
  id         String    @id @default(uuid())
  entryHash  String    @unique
  imageUrl   String
  documentId String?
  createdAt  DateTime  @default(now())

  @@index([entryHash])
}

model Metadata {
  key       String   @id
  value     String
  updatedAt DateTime @default(now())
}
```

## Migration Steps

### Phase 1: Backend Setup (Tasks 1-6)

1. **Install dependencies**
   ```bash
   pnpm add fastify @fastify/cors prisma @prisma/client
   pnpm add -D typescript @types/node tsx
   ```

2. **Initialize Prisma**
   ```bash
   npx prisma init --datasource-provider sqlite
   ```

3. **Define Prisma schema**
   - Create schema matching existing tables
   - Set database URL to `file:./db.sqlite`

4. **Create initial migration**
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Build Fastify server**
   - Create `server.ts` with all routes
   - Implement service layer for business logic
   - Add CORS for local development

6. **Create launchd plist file**
   - Create `~/Library/LaunchAgents/com.jasonbenn.jarvis4-backend.plist`
   - Load and start service: `launchctl load ~/Library/LaunchAgents/com.jasonbenn.jarvis4-backend.plist`

### Phase 2: Process Management (Tasks 7-9)

7. **Create launchd plist file** (`~/Library/LaunchAgents/com.jasonbenn.jarvis4-backend.plist`)
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>Label</key>
       <string>com.jasonbenn.jarvis4-backend</string>
       <key>ProgramArguments</key>
       <array>
           <string>/usr/local/bin/pnpm</string>
           <string>start</string>
       </array>
       <key>WorkingDirectory</key>
       <string>/Users/jasonbenn/code/jarvis4</string>
       <key>StandardOutPath</key>
       <string>/Users/jasonbenn/code/jarvis4/logs/backend.log</string>
       <key>StandardErrorPath</key>
       <string>/Users/jasonbenn/code/jarvis4/logs/backend.log</string>
       <key>EnvironmentVariables</key>
       <dict>
           <key>NODE_ENV</key>
           <string>production</string>
           <key>JARVIS4_PORT</key>
           <string>3456</string>
       </dict>
       <key>RunAtLoad</key>
       <true/>
       <key>KeepAlive</key>
       <true/>
   </dict>
   </plist>
   ```

8. **Update `scripts/open-worldview.sh`**
   - Check if backend is running via health endpoint
   - If not, start with `launchctl start com.jasonbenn.jarvis4-backend`
   - Wait for health check to pass before continuing

9. **Add npm scripts to root `package.json`**
   ```json
   {
     "start": "tsx src/server.ts",
     "dev": "tsx watch src/server.ts",
     "backend:start": "launchctl start com.jasonbenn.jarvis4-backend",
     "backend:stop": "launchctl stop com.jasonbenn.jarvis4-backend",
     "backend:restart": "launchctl stop com.jasonbenn.jarvis4-backend && launchctl start com.jasonbenn.jarvis4-backend",
     "backend:status": "launchctl list | grep jarvis4-backend",
     "backend:logs": "tail -f logs/backend.log",
     "backend:load": "launchctl load ~/Library/LaunchAgents/com.jasonbenn.jarvis4-backend.plist",
     "backend:unload": "launchctl unload ~/Library/LaunchAgents/com.jasonbenn.jarvis4-backend.plist"
   }
   ```

### Phase 3: Migration & Client Updates (Tasks 10-13)

10. **Create data migration script** (`scripts/migrate-sql-to-prisma.ts`)
    - Copy data from old location: `~/Library/Application Support/Cursor/User/globalStorage/jasonbenn.jarvis4-worldview-updater/readwise-highlights.db`
    - Verify existing data integrity
    - Run Prisma migration
    - Validate all data migrated correctly
    - Backup original DB file

11. **Update VSCode extension** (`extension/jarvis4-worldview-updater/src/database.ts`)
    - Replace `HighlightDatabase` class with HTTP client
    - Use `fetch` to call backend endpoints
    - Handle connection errors gracefully with helpful error message:
      - "Jarvis4 backend is not running. Start it with: launchctl start com.jasonbenn.jarvis4-backend"
    - Remove sql.js imports

12. **Update image tracking** (`src/generated-images-db.ts`)
    - Replace direct sql.js calls with HTTP client
    - Maintain same interface for backwards compatibility
    - Remove sql.js imports

13. **Remove sql.js dependencies**
    ```bash
    pnpm remove sql.js @types/sql.js
    ```

### Phase 4: Testing (Task 14)

14. **Test all functionality**
    - Load service: `pnpm backend:load`
    - Start backend: `pnpm backend:start`
    - Check status: `pnpm backend:status`
    - Test Raycast script: Check auto-start behavior
    - Test VSCode extension: Fetch highlights, track, snooze, archive
    - Test VSCode extension error handling: Stop backend, restart VSCode, verify helpful error message
    - Test image generation: Create, update document_id
    - Test metadata: Read/write lastReadwiseFetch
    - Verify concurrent access works correctly
    - Test backend restart: `pnpm backend:restart`
    - View logs: `pnpm backend:logs`

## Benefits

1. **Reliability**: Proper database connections, no in-memory sync issues
2. **Concurrency**: Multiple processes can safely access DB simultaneously
3. **Developer Experience**: Prisma Client provides excellent TypeScript types and autocomplete
4. **Migrations**: Proper version control for schema changes via Prisma Migrate
5. **Separation of Concerns**: Backend logic separate from UI/extension code
6. **Scalability**: Easy to add features, can scale to PostgreSQL later if needed
7. **Debugging**: Backend logs, health checks, proper error handling
8. **Consistency**: Single source of truth for DB operations

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Backend not running when VSCode starts | High | Show helpful error message with launchctl command |
| Port 3456 might be in use | Low | Make port configurable via `JARVIS4_PORT` env var |
| Data migration errors | High | Backup DB before migration, validation script |
| Slower than in-memory | Low | SQLite is fast enough, network overhead minimal (localhost) |


## Success Criteria

- [ ] Backend starts reliably via launchd
- [ ] Backend auto-starts on login (RunAtLoad)
- [ ] Backend auto-restarts on crash (KeepAlive)
- [ ] VSCode extension shows helpful error if backend is down
- [ ] Raycast script auto-starts backend if not running
- [ ] All existing functionality works (no regressions)
- [ ] VSCode extension can fetch, track, snooze, archive highlights
- [ ] Image generation tracking works via backend
- [ ] Metadata read/write works
- [ ] Multiple processes can access DB concurrently
- [ ] Backend can be restarted without data loss
- [ ] Database at jarvis4/db.sqlite
- [ ] sql.js completely removed from codebase
- [ ] All tests pass (or new tests written and passing)
