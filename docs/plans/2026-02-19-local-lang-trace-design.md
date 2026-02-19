# local-lang-trace Design

## Overview

Lightweight LangChain trace collection/storage/visualization tool running locally without LangSmith.
Replaces `LANGSMITH_ENDPOINT` with a local Fastify server that stores traces in SQLite and serves a React SPA viewer.

## Architecture

```
LangChain App → HTTP POST /runs/batch → Fastify Server
                                          ├── Circular Buffer (in-memory)
                                          ├── Flusher → better-sqlite3 (traces.db)
                                          ├── /api/* → Viewer API
                                          ├── /api/events → SSE live updates
                                          └── /ui → React SPA (Vite build)
```

## Monorepo Structure

npm workspaces, ESM throughout.

```
local-lang-trace/
├── packages/server/        # Fastify server
│   ├── src/
│   │   ├── index.js        # Entry point
│   │   ├── routes/
│   │   │   ├── ingest.js   # /runs/* LangSmith-compatible
│   │   │   └── api.js      # /api/* Viewer API + SSE
│   │   ├── buffer.js       # Circular Buffer
│   │   ├── flusher.js      # Flush + TTL logic
│   │   └── db.js           # better-sqlite3 wrapper
│   └── package.json
├── packages/ui/            # React SPA
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── TraceList.jsx
│   │   │   └── TraceDetail.jsx
│   │   └── components/
│   │       ├── RunTree.jsx
│   │       ├── StatsPanel.jsx
│   │       └── PromptViewer.jsx
│   ├── vite.config.js
│   └── package.json
├── .env.example
└── package.json            # Root (npx entry + workspaces)
```

## Key Decisions

- **npm workspaces**: Simple monorepo, no extra tooling
- **ESM**: `"type": "module"` in all package.json files
- **SSE**: `/api/events` endpoint for real-time trace updates (beyond PRD)
- **better-sqlite3**: Synchronous writes, fast bulk inserts
- **Circular Buffer**: Fixed-size array with head pointer, drop-oldest on overflow
- **Tailwind + Zustand + SWR**: PRD-specified UI stack

## Data Flow

1. LangChain SDK sends runs to `/runs/batch` or `/runs`
2. Server validates and stores in circular buffer (no serialization)
3. Flusher triggers on `FLUSH_INTERVAL_MS` (5s) or `FLUSH_BATCH_SIZE` (100)
4. Bulk INSERT into SQLite in single transaction
5. TTL cleanup runs after each flush
6. SSE broadcasts new traces to connected UI clients
7. UI renders trace list with infinite scroll and live updates

## SQLite Schema

Per PRD section 4-2: `runs` table with id, trace_id, parent_id, name, run_type, status, inputs, outputs, error, start_time, end_time, tokens_prompt, tokens_completion, extra. Indexes on trace_id, start_time, status.

## API Endpoints

### Ingest (LangSmith-compatible)
- `POST /runs/batch` - Batch run ingestion
- `POST /runs` - Single run ingestion
- `PATCH /runs/:id` - Run update (end time, outputs)
- `GET /info` - Server meta (SDK handshake)

### Viewer API
- `GET /api/traces` - Trace list with pagination/filters
- `GET /api/traces/:traceId` - Trace detail with run tree
- `GET /api/stats` - Aggregate statistics
- `GET /api/health` - Server health
- `GET /api/events` - SSE stream for live updates

## UI Screens

1. **Main view**: Header + stats sidebar + trace list (infinite scroll)
2. **Trace detail**: Recursive run tree + prompt/response viewer + token counts
3. **Error highlighting**: Red badges on error traces, inline error messages
