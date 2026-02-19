# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

local-lang-trace — a local replacement for LangSmith. Fastify server collects LangChain traces via LangSmith-compatible HTTP endpoints, stores them in SQLite, and serves a React SPA viewer.

## Commands

```bash
npm install              # Install all workspace dependencies
npm start                # Start server (port 4318)
npm test                 # Run all server tests (node:test)
npm run build:ui         # Build React SPA → packages/ui/dist/
npm run dev              # Server with --watch
npm run dev:ui           # Vite dev server for UI (proxies /api to :4318)
```

Run a single test file:
```bash
cd packages/server && node --test src/buffer.test.js
```

## Architecture

**Monorepo**: npm workspaces with two packages. ESM throughout (`"type": "module"`).

### Data Flow

```
LangChain SDK → POST /runs/batch → CircularBuffer (in-memory)
                                        ↓ flush (time or batch-size trigger)
                                   SQLite (traces.db) via better-sqlite3
                                        ↓ onFlush callback
                                   SSE broadcast → connected UI clients
```

### Server (`packages/server/src/`)

Core modules are factory functions that accept dependencies (no singletons):

- **buffer.js** — `CircularBuffer` class. Fixed-size ring buffer, `push()`/`drain()`/`size`. Drop-oldest on overflow.
- **db.js** — `createDb(path)` returns a DB API wrapping better-sqlite3. Prepared statements, transactional bulk insert, COALESCE-based partial updates.
- **flusher.js** — `createFlusher({db, buffer, ...config})`. Drains buffer → SQLite. Separates new runs from patches (`_patch` flag). Runs TTL + size-based cleanup after each flush. `onFlush` callback triggers SSE broadcast.
- **sse.js** — `createSSE()` manages SSE client set, `addClient(reply)`/`broadcast(event, data)`.
- **routes/ingest.js** — LangSmith-compatible endpoints. Items tagged with `_patch: true` are routed to `db.updateRun` during flush.
- **routes/api.js** — Viewer API (`/api/traces`, `/api/traces/:traceId`, `/api/stats`, `/api/health`, `/api/events` SSE).
- **index.js** — Wires everything together. Reads env vars, registers routes, serves UI static files from `../../ui/dist`, handles graceful shutdown (SIGTERM/SIGINT → flush → close).

### UI (`packages/ui/src/`)

React 18 + Vite + Tailwind CSS v4 (via `@tailwindcss/vite` plugin). State: Zustand. Data fetching: SWR with 5s polling + SSE live updates.

- **store.js** — `apiUrl()` resolves API base path differently in dev (Vite proxy) vs production (`/ui/..`).
- **pages/TraceList.jsx** — Infinite scroll via IntersectionObserver. SSE reconnects on failure with 5s retry.
- **pages/TraceDetail.jsx** — Fetches runs for a trace, renders RunTree.
- **components/RunTree.jsx** — Builds parent-child tree from flat runs array, renders recursive expandable nodes.
- **components/PromptViewer.jsx** — Shows I/O for runs; auto-expanded for `run_type === 'llm'`.

### LangSmith Compatibility

The SDK does a `GET /info` handshake first, then sends `POST /runs/batch` with `{post: [...], patch: [...]}`. Unimplemented endpoints return `200 OK` (silent pass). The `normalizeRun()` function in flusher.js handles LangChain field name aliases (`parent_run_id` → `parent_id`, `prompt_tokens` → `tokens_prompt`, etc.) and various timestamp formats (Date objects, ISO strings, Unix ms).

## Configuration

All via environment variables (see `.env.example`). Key ones: `PORT` (4318), `DB_PATH`, `FLUSH_INTERVAL_MS` (5000), `FLUSH_BATCH_SIZE` (100), `TTL_DAYS` (3), `MAX_DB_SIZE_MB` (200).

## Testing

Tests use Node.js built-in test runner (`node:test` + `node:assert/strict`). Test files are colocated: `buffer.test.js`, `db.test.js`, `flusher.test.js`. DB tests create/delete temporary `.db` files in the working directory.
