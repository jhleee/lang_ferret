# local-lang-trace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local LangChain trace collection/storage/visualization tool that replaces LangSmith for local dev.

**Architecture:** Fastify server receives LangSmith-compatible run data, buffers in a circular array, flushes to SQLite via better-sqlite3, serves a React SPA at /ui with SSE live updates.

**Tech Stack:** Node 18+ ESM, Fastify, better-sqlite3, React 18, Vite, Tailwind CSS, Zustand, SWR

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `packages/server/package.json`
- Create: `packages/ui/package.json`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Create root package.json**

```json
{
  "name": "local-lang-trace",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "workspaces": ["packages/*"],
  "bin": {
    "local-lang-trace": "./packages/server/src/index.js"
  },
  "scripts": {
    "dev": "npm run dev --workspace=packages/server",
    "dev:ui": "npm run dev --workspace=packages/ui",
    "build:ui": "npm run build --workspace=packages/ui",
    "start": "node packages/server/src/index.js",
    "test": "npm run test --workspace=packages/server"
  }
}
```

**Step 2: Create packages/server/package.json**

```json
{
  "name": "@local-lang-trace/server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "node --test src/**/*.test.js"
  },
  "dependencies": {
    "fastify": "^5.2.1",
    "@fastify/static": "^8.1.0",
    "@fastify/cors": "^10.0.2",
    "better-sqlite3": "^11.8.1",
    "dotenv": "^16.4.7"
  }
}
```

**Step 3: Create packages/ui/package.json**

```json
{
  "name": "@local-lang-trace/ui",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.3",
    "swr": "^2.3.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.1.0",
    "tailwindcss": "^4.0.6",
    "@tailwindcss/vite": "^4.0.6"
  }
}
```

**Step 4: Create .env.example**

```dotenv
PORT=4318
DB_PATH=./traces.db
BUFFER_MAX_SIZE=1000
FLUSH_INTERVAL_MS=5000
FLUSH_BATCH_SIZE=100
TTL_DAYS=3
MAX_DB_SIZE_MB=200
VACUUM_ON_CLEANUP=false
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
*.db
.env
```

**Step 6: Install dependencies**

Run: `npm install`

**Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold monorepo with npm workspaces"
```

---

### Task 2: Circular Buffer

**Files:**
- Create: `packages/server/src/buffer.js`
- Create: `packages/server/src/buffer.test.js`

**Step 1: Write the failing test**

```js
// packages/server/src/buffer.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CircularBuffer } from './buffer.js';

describe('CircularBuffer', () => {
  it('should store and drain items', () => {
    const buf = new CircularBuffer(5);
    buf.push({ id: '1' });
    buf.push({ id: '2' });
    assert.equal(buf.size, 2);
    const items = buf.drain();
    assert.equal(items.length, 2);
    assert.equal(items[0].id, '1');
    assert.equal(buf.size, 0);
  });

  it('should overwrite oldest when full', () => {
    const buf = new CircularBuffer(3);
    buf.push({ id: '1' });
    buf.push({ id: '2' });
    buf.push({ id: '3' });
    buf.push({ id: '4' }); // overwrites '1'
    const items = buf.drain();
    assert.equal(items.length, 3);
    assert.equal(items[0].id, '2');
    assert.equal(items[2].id, '4');
  });

  it('should report correct size', () => {
    const buf = new CircularBuffer(2);
    assert.equal(buf.size, 0);
    buf.push({ id: '1' });
    assert.equal(buf.size, 1);
    buf.push({ id: '2' });
    assert.equal(buf.size, 2);
    buf.push({ id: '3' }); // overflow
    assert.equal(buf.size, 2);
  });

  it('drain returns empty array when empty', () => {
    const buf = new CircularBuffer(5);
    assert.deepEqual(buf.drain(), []);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/server && node --test src/buffer.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

```js
// packages/server/src/buffer.js
export class CircularBuffer {
  #buf;
  #head = 0;
  #count = 0;
  #capacity;

  constructor(capacity = 1000) {
    this.#capacity = capacity;
    this.#buf = new Array(capacity);
  }

  push(item) {
    const idx = (this.#head + this.#count) % this.#capacity;
    if (this.#count < this.#capacity) {
      this.#count++;
    } else {
      this.#head = (this.#head + 1) % this.#capacity;
    }
    this.#buf[idx] = item;
  }

  drain() {
    const items = [];
    for (let i = 0; i < this.#count; i++) {
      items.push(this.#buf[(this.#head + i) % this.#capacity]);
    }
    this.#count = 0;
    this.#head = 0;
    return items;
  }

  get size() {
    return this.#count;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/server && node --test src/buffer.test.js`
Expected: all 4 tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/buffer.js packages/server/src/buffer.test.js
git commit -m "feat(server): add circular buffer with tests"
```

---

### Task 3: SQLite Database Wrapper

**Files:**
- Create: `packages/server/src/db.js`
- Create: `packages/server/src/db.test.js`

**Step 1: Write the failing test**

```js
// packages/server/src/db.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDb } from './db.js';

const TEST_DB = './test-traces.db';

describe('Database', () => {
  let db;

  before(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = createDb(TEST_DB);
  });

  after(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('should insert and query runs', () => {
    db.insertRuns([{
      id: 'run-1',
      trace_id: 'trace-1',
      parent_id: null,
      name: 'test_chain',
      run_type: 'chain',
      status: 'success',
      inputs: '{"q":"hello"}',
      outputs: '{"a":"world"}',
      error: null,
      start_time: Date.now() - 1000,
      end_time: Date.now(),
      tokens_prompt: 10,
      tokens_completion: 5,
      extra: null,
    }]);
    const rows = db.getTraces({ limit: 10, offset: 0 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].trace_id, 'trace-1');
  });

  it('should update a run', () => {
    db.updateRun('run-1', {
      end_time: Date.now() + 500,
      outputs: '{"a":"updated"}',
      status: 'success',
    });
    const runs = db.getRunsByTrace('trace-1');
    assert.equal(runs[0].outputs, '{"a":"updated"}');
  });

  it('should return stats', () => {
    const stats = db.getStats();
    assert.equal(stats.total_runs, 1);
    assert.equal(typeof stats.avg_latency_ms, 'number');
  });

  it('should delete old runs by TTL', () => {
    db.insertRuns([{
      id: 'run-old',
      trace_id: 'trace-old',
      parent_id: null,
      name: 'old_chain',
      run_type: 'chain',
      status: 'success',
      inputs: '{}',
      outputs: '{}',
      error: null,
      start_time: 1000, // very old
      end_time: 2000,
      tokens_prompt: 0,
      tokens_completion: 0,
      extra: null,
    }]);
    const deleted = db.deleteOlderThan(Date.now() - 86400000);
    assert.ok(deleted >= 1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/server && node --test src/db.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

```js
// packages/server/src/db.js
import Database from 'better-sqlite3';

export function createDb(dbPath = './traces.db') {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id                TEXT PRIMARY KEY,
      trace_id          TEXT NOT NULL,
      parent_id         TEXT,
      name              TEXT,
      run_type          TEXT,
      status            TEXT,
      inputs            TEXT,
      outputs           TEXT,
      error             TEXT,
      start_time        INTEGER NOT NULL,
      end_time          INTEGER,
      tokens_prompt     INTEGER,
      tokens_completion INTEGER,
      extra             TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trace_id   ON runs(trace_id);
    CREATE INDEX IF NOT EXISTS idx_start_time ON runs(start_time);
    CREATE INDEX IF NOT EXISTS idx_status     ON runs(status);
  `);

  const insertStmt = sqlite.prepare(`
    INSERT OR REPLACE INTO runs
      (id, trace_id, parent_id, name, run_type, status, inputs, outputs, error,
       start_time, end_time, tokens_prompt, tokens_completion, extra)
    VALUES
      (@id, @trace_id, @parent_id, @name, @run_type, @status, @inputs, @outputs, @error,
       @start_time, @end_time, @tokens_prompt, @tokens_completion, @extra)
  `);

  const insertMany = sqlite.transaction((runs) => {
    for (const run of runs) insertStmt.run(run);
  });

  const updateStmt = sqlite.prepare(`
    UPDATE runs SET
      end_time   = COALESCE(@end_time, end_time),
      outputs    = COALESCE(@outputs, outputs),
      status     = COALESCE(@status, status),
      error      = COALESCE(@error, error),
      tokens_prompt     = COALESCE(@tokens_prompt, tokens_prompt),
      tokens_completion = COALESCE(@tokens_completion, tokens_completion),
      extra      = COALESCE(@extra, extra)
    WHERE id = @id
  `);

  return {
    insertRuns(runs) {
      insertMany(runs);
    },

    updateRun(id, fields) {
      updateStmt.run({ id, end_time: null, outputs: null, status: null, error: null, tokens_prompt: null, tokens_completion: null, extra: null, ...fields });
    },

    getTraces({ limit = 50, offset = 0, status, from, to, name } = {}) {
      let where = 'WHERE parent_id IS NULL';
      const params = {};
      if (status) { where += ' AND status = @status'; params.status = status; }
      if (from) { where += ' AND start_time >= @from'; params.from = new Date(from).getTime(); }
      if (to) { where += ' AND start_time <= @to'; params.to = new Date(to).getTime(); }
      if (name) { where += ' AND name LIKE @name'; params.name = `%${name}%`; }
      params.limit = limit;
      params.offset = offset;
      return sqlite.prepare(
        `SELECT * FROM runs ${where} ORDER BY start_time DESC LIMIT @limit OFFSET @offset`
      ).all(params);
    },

    getRunsByTrace(traceId) {
      return sqlite.prepare('SELECT * FROM runs WHERE trace_id = ? ORDER BY start_time ASC').all(traceId);
    },

    getStats() {
      return sqlite.prepare(`
        SELECT
          COUNT(*) as total_runs,
          COUNT(DISTINCT trace_id) as total_traces,
          AVG(CASE WHEN end_time IS NOT NULL THEN end_time - start_time END) as avg_latency_ms,
          SUM(tokens_prompt) as total_prompt_tokens,
          SUM(tokens_completion) as total_completion_tokens,
          ROUND(100.0 * SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as error_rate
        FROM runs
      `).get();
    },

    deleteOlderThan(timestampMs) {
      return sqlite.prepare('DELETE FROM runs WHERE start_time < ?').run(timestampMs).changes;
    },

    deleteOldestTraces(maxSizeBytes) {
      // Delete oldest trace_id groups until file is under limit
      // Returns number of traces deleted
      let deleted = 0;
      while (true) {
        const oldest = sqlite.prepare(
          'SELECT DISTINCT trace_id FROM runs ORDER BY start_time ASC LIMIT 1'
        ).get();
        if (!oldest) break;
        sqlite.prepare('DELETE FROM runs WHERE trace_id = ?').run(oldest.trace_id);
        deleted++;
        // Caller should check file size externally
        break; // Delete one trace at a time, caller loops
      }
      return deleted;
    },

    vacuum() {
      sqlite.exec('VACUUM');
    },

    close() {
      sqlite.close();
    },

    get raw() { return sqlite; },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/server && node --test src/db.test.js`
Expected: all 4 tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/db.js packages/server/src/db.test.js
git commit -m "feat(server): add SQLite database wrapper with tests"
```

---

### Task 4: Flusher (Buffer → SQLite + TTL cleanup)

**Files:**
- Create: `packages/server/src/flusher.js`
- Create: `packages/server/src/flusher.test.js`

**Step 1: Write the failing test**

```js
// packages/server/src/flusher.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CircularBuffer } from './buffer.js';
import { createDb } from './db.js';
import { createFlusher } from './flusher.js';

const TEST_DB = './test-flusher.db';

describe('Flusher', () => {
  let db, buffer, flusher;

  before(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    db = createDb(TEST_DB);
    buffer = new CircularBuffer(100);
  });

  after(() => {
    if (flusher) flusher.stop();
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it('flush() should move buffer items to DB', () => {
    buffer.push({
      id: 'r1', trace_id: 't1', parent_id: null, name: 'chain',
      run_type: 'chain', status: 'success', inputs: '{}', outputs: '{}',
      error: null, start_time: Date.now(), end_time: Date.now(),
      tokens_prompt: 10, tokens_completion: 5, extra: null,
    });

    flusher = createFlusher({ db, buffer, flushIntervalMs: 100000, flushBatchSize: 100, ttlDays: 3, maxDbSizeMb: 200, vacuumOnCleanup: false, dbPath: TEST_DB });
    const count = flusher.flush();
    assert.equal(count, 1);
    assert.equal(buffer.size, 0);

    const rows = db.getTraces({ limit: 10, offset: 0 });
    assert.equal(rows.length, 1);
  });

  it('flush() with empty buffer returns 0', () => {
    const count = flusher.flush();
    assert.equal(count, 0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/server && node --test src/flusher.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

```js
// packages/server/src/flusher.js
import fs from 'node:fs';

export function createFlusher({ db, buffer, flushIntervalMs = 5000, flushBatchSize = 100, ttlDays = 3, maxDbSizeMb = 200, vacuumOnCleanup = false, dbPath = './traces.db', onFlush = null }) {
  let timer = null;

  function normalizeRun(run) {
    return {
      id: run.id,
      trace_id: run.trace_id ?? run.id,
      parent_id: run.parent_run_id ?? run.parent_id ?? null,
      name: run.name ?? null,
      run_type: run.run_type ?? null,
      status: run.status ?? (run.error ? 'error' : (run.end_time ? 'success' : null)),
      inputs: typeof run.inputs === 'string' ? run.inputs : (run.inputs ? JSON.stringify(run.inputs) : null),
      outputs: typeof run.outputs === 'string' ? run.outputs : (run.outputs ? JSON.stringify(run.outputs) : null),
      error: typeof run.error === 'string' ? run.error : (run.error ? JSON.stringify(run.error) : null),
      start_time: run.start_time instanceof Date ? run.start_time.getTime()
        : (typeof run.start_time === 'string' ? new Date(run.start_time).getTime()
        : (run.start_time ?? Date.now())),
      end_time: run.end_time instanceof Date ? run.end_time.getTime()
        : (typeof run.end_time === 'string' ? new Date(run.end_time).getTime()
        : (run.end_time ?? null)),
      tokens_prompt: run.prompt_tokens ?? run.tokens_prompt ?? null,
      tokens_completion: run.completion_tokens ?? run.tokens_completion ?? null,
      extra: run.extra ? (typeof run.extra === 'string' ? run.extra : JSON.stringify(run.extra)) : null,
    };
  }

  function flush() {
    const items = buffer.drain();
    if (items.length === 0) return 0;
    const normalized = items.map(normalizeRun);
    db.insertRuns(normalized);
    cleanup();
    if (onFlush) onFlush(normalized);
    return normalized.length;
  }

  function cleanup() {
    // TTL-based
    const cutoff = Date.now() - ttlDays * 86400000;
    db.deleteOlderThan(cutoff);

    // Size-based
    try {
      const stat = fs.statSync(dbPath);
      const maxBytes = maxDbSizeMb * 1024 * 1024;
      if (stat.size > maxBytes) {
        for (let i = 0; i < 100; i++) {
          db.deleteOldestTraces();
          const newStat = fs.statSync(dbPath);
          if (newStat.size <= maxBytes) break;
        }
      }
    } catch { /* db file may not exist yet */ }

    if (vacuumOnCleanup) {
      db.vacuum();
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      if (buffer.size >= 1) flush();
    }, flushIntervalMs);
    timer.unref();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // Also check batch size on every push — caller hooks this
  function checkBatchSize() {
    if (buffer.size >= flushBatchSize) flush();
  }

  return { flush, start, stop, checkBatchSize, cleanup };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/server && node --test src/flusher.test.js`
Expected: all 2 tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/flusher.js packages/server/src/flusher.test.js
git commit -m "feat(server): add flusher with TTL cleanup and tests"
```

---

### Task 5: SSE Event Emitter

**Files:**
- Create: `packages/server/src/sse.js`

**Step 1: Write the SSE manager**

```js
// packages/server/src/sse.js
export function createSSE() {
  const clients = new Set();

  function addClient(reply) {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    clients.add(reply);
    reply.raw.on('close', () => clients.delete(reply));
  }

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const reply of clients) {
      try { reply.raw.write(payload); } catch { clients.delete(reply); }
    }
  }

  return { addClient, broadcast, get clientCount() { return clients.size; } };
}
```

**Step 2: Commit**

```bash
git add packages/server/src/sse.js
git commit -m "feat(server): add SSE event broadcaster"
```

---

### Task 6: Ingest Routes (LangSmith-compatible)

**Files:**
- Create: `packages/server/src/routes/ingest.js`

**Step 1: Write ingest routes**

```js
// packages/server/src/routes/ingest.js
export default function ingestRoutes(fastify, { buffer, flusher }) {
  // SDK handshake
  fastify.get('/info', async () => ({
    version: '0.1.0',
    batch_ingest_config: {
      use_multipart_endpoint: false,
      size_limit_bytes: null,
      size_limit: 20,
    },
  }));

  // Batch ingest
  fastify.post('/runs/batch', async (request, reply) => {
    const { post = [], patch = [] } = request.body || {};
    for (const run of post) {
      buffer.push(run);
      flusher.checkBatchSize();
    }
    for (const update of patch) {
      // patches go directly to DB if flushed, or we handle in buffer
      buffer.push({ ...update, _patch: true });
      flusher.checkBatchSize();
    }
    reply.status(202).send();
  });

  // Single run
  fastify.post('/runs', async (request, reply) => {
    buffer.push(request.body);
    flusher.checkBatchSize();
    reply.status(202).send();
  });

  // Update run
  fastify.patch('/runs/:id', async (request, reply) => {
    buffer.push({ id: request.params.id, ...request.body, _patch: true });
    flusher.checkBatchSize();
    reply.status(200).send();
  });

  // Catch-all for unimplemented LangSmith endpoints
  fastify.all('/runs/*', async (request, reply) => {
    reply.status(200).send();
  });

  fastify.all('/sessions', async () => ({}));
  fastify.all('/datasets/*', async () => ({}));
  fastify.all('/feedback', async () => ({}));
}
```

**Step 2: Commit**

```bash
git add packages/server/src/routes/ingest.js
git commit -m "feat(server): add LangSmith-compatible ingest routes"
```

---

### Task 7: API Routes (Viewer Backend + SSE)

**Files:**
- Create: `packages/server/src/routes/api.js`

**Step 1: Write API routes**

```js
// packages/server/src/routes/api.js
export default function apiRoutes(fastify, { db, buffer, sse, dbPath }) {
  fastify.get('/api/traces', async (request) => {
    const { limit = 50, offset = 0, status, from, to, name } = request.query;
    return db.getTraces({
      limit: Number(limit),
      offset: Number(offset),
      status: status || undefined,
      from: from || undefined,
      to: to || undefined,
      name: name || undefined,
    });
  });

  fastify.get('/api/traces/:traceId', async (request) => {
    const runs = db.getRunsByTrace(request.params.traceId);
    if (runs.length === 0) {
      return { statusCode: 404, error: 'Trace not found' };
    }
    return { trace_id: request.params.traceId, runs };
  });

  fastify.get('/api/stats', async () => {
    return db.getStats();
  });

  fastify.get('/api/health', async () => {
    let dbSizeMb = 0;
    try {
      const { statSync } = await import('node:fs');
      dbSizeMb = Math.round(statSync(dbPath).size / 1024 / 1024 * 100) / 100;
    } catch { /* file may not exist */ }
    return {
      status: 'ok',
      buffer_size: buffer.size,
      db_size_mb: dbSizeMb,
      sse_clients: sse.clientCount,
    };
  });

  // SSE endpoint
  fastify.get('/api/events', (request, reply) => {
    sse.addClient(reply);
    // Send initial heartbeat
    reply.raw.write(': heartbeat\n\n');
  });
}
```

**Step 2: Commit**

```bash
git add packages/server/src/routes/api.js
git commit -m "feat(server): add viewer API routes with SSE"
```

---

### Task 8: Server Entry Point

**Files:**
- Create: `packages/server/src/index.js`

**Step 1: Write server entry point**

```js
#!/usr/bin/env node
// packages/server/src/index.js
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import { CircularBuffer } from './buffer.js';
import { createDb } from './db.js';
import { createFlusher } from './flusher.js';
import { createSSE } from './sse.js';
import ingestRoutes from './routes/ingest.js';
import apiRoutes from './routes/api.js';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 4318);
const DB_PATH = process.env.DB_PATH || './traces.db';
const BUFFER_MAX_SIZE = Number(process.env.BUFFER_MAX_SIZE || 1000);
const FLUSH_INTERVAL_MS = Number(process.env.FLUSH_INTERVAL_MS || 5000);
const FLUSH_BATCH_SIZE = Number(process.env.FLUSH_BATCH_SIZE || 100);
const TTL_DAYS = Number(process.env.TTL_DAYS || 3);
const MAX_DB_SIZE_MB = Number(process.env.MAX_DB_SIZE_MB || 200);
const VACUUM_ON_CLEANUP = process.env.VACUUM_ON_CLEANUP === 'true';

// Core components
const buffer = new CircularBuffer(BUFFER_MAX_SIZE);
const db = createDb(DB_PATH);
const sse = createSSE();
const flusher = createFlusher({
  db, buffer,
  flushIntervalMs: FLUSH_INTERVAL_MS,
  flushBatchSize: FLUSH_BATCH_SIZE,
  ttlDays: TTL_DAYS,
  maxDbSizeMb: MAX_DB_SIZE_MB,
  vacuumOnCleanup: VACUUM_ON_CLEANUP,
  dbPath: DB_PATH,
  onFlush(runs) { sse.broadcast('trace:new', { count: runs.length, ids: [...new Set(runs.map(r => r.trace_id))] }); },
});

const app = Fastify({ logger: false });

await app.register(cors, { origin: true });

// Register routes
ingestRoutes(app, { buffer, flusher });
apiRoutes(app, { db, buffer, sse, dbPath: DB_PATH });

// Serve UI static files
const uiDist = resolve(__dirname, '../../ui/dist');
if (existsSync(uiDist)) {
  await app.register(fastifyStatic, { root: uiDist, prefix: '/ui/', wildcard: true });
  app.get('/ui', (req, reply) => reply.redirect('/ui/'));
}

// Start flusher
flusher.start();

// Graceful shutdown
async function shutdown() {
  flusher.stop();
  flusher.flush(); // flush remaining
  db.close();
  await app.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`local-lang-trace running on http://localhost:${PORT}`);
console.log(`  Viewer: http://localhost:${PORT}/ui`);
console.log(`  Set LANGSMITH_ENDPOINT=http://localhost:${PORT} in your LangChain app`);
```

**Step 2: Test server starts**

Run: `cd packages/server && timeout 3 node src/index.js || true`
Expected: see "local-lang-trace running on http://localhost:4318"

**Step 3: Commit**

```bash
git add packages/server/src/index.js
git commit -m "feat(server): add entry point with graceful shutdown"
```

---

### Task 9: Update Flusher to Handle Patches

**Files:**
- Modify: `packages/server/src/flusher.js`

**Step 1: Update normalizeRun and flush to handle _patch items**

In `flush()`, separate `_patch` items from inserts:

```js
  function flush() {
    const items = buffer.drain();
    if (items.length === 0) return 0;

    const inserts = [];
    const patches = [];
    for (const item of items) {
      if (item._patch) {
        const { _patch, ...rest } = item;
        patches.push(rest);
      } else {
        inserts.push(normalizeRun(item));
      }
    }

    if (inserts.length > 0) db.insertRuns(inserts);
    for (const patch of patches) {
      db.updateRun(patch.id, {
        end_time: patch.end_time instanceof Date ? patch.end_time.getTime()
          : (typeof patch.end_time === 'string' ? new Date(patch.end_time).getTime() : (patch.end_time ?? null)),
        outputs: patch.outputs ? (typeof patch.outputs === 'string' ? patch.outputs : JSON.stringify(patch.outputs)) : null,
        status: patch.status ?? (patch.error ? 'error' : null),
        error: patch.error ? (typeof patch.error === 'string' ? patch.error : JSON.stringify(patch.error)) : null,
        tokens_prompt: patch.prompt_tokens ?? patch.tokens_prompt ?? null,
        tokens_completion: patch.completion_tokens ?? patch.tokens_completion ?? null,
        extra: patch.extra ? (typeof patch.extra === 'string' ? patch.extra : JSON.stringify(patch.extra)) : null,
      });
    }

    cleanup();
    if (onFlush) onFlush(inserts);
    return inserts.length + patches.length;
  }
```

**Step 2: Run all server tests**

Run: `cd packages/server && node --test src/buffer.test.js src/db.test.js src/flusher.test.js`
Expected: all PASS

**Step 3: Commit**

```bash
git add packages/server/src/flusher.js
git commit -m "feat(server): handle PATCH runs in flusher"
```

---

### Task 10: UI Scaffolding (Vite + React + Tailwind)

**Files:**
- Create: `packages/ui/index.html`
- Create: `packages/ui/vite.config.js`
- Create: `packages/ui/src/main.jsx`
- Create: `packages/ui/src/index.css`
- Create: `packages/ui/src/App.jsx`
- Create: `packages/ui/src/store.js`

**Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>local-lang-trace</title>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen">
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

**Step 2: Create vite.config.js**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/ui/',
  server: {
    proxy: {
      '/api': 'http://localhost:4318',
    },
  },
});
```

**Step 3: Create src/index.css**

```css
@import "tailwindcss";
```

**Step 4: Create src/main.jsx**

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(<App />);
```

**Step 5: Create src/store.js (Zustand store)**

```js
import { create } from 'zustand';

const API_BASE = import.meta.env.DEV ? '' : '/ui/..';

export const useStore = create((set, get) => ({
  selectedTraceId: null,
  setSelectedTraceId: (id) => set({ selectedTraceId: id }),
  liveCount: 0,
  setLiveCount: (n) => set({ liveCount: n }),
}));

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
```

**Step 6: Create src/App.jsx (shell)**

```jsx
import React from 'react';
import { useStore } from './store.js';
import TraceList from './pages/TraceList.jsx';
import TraceDetail from './pages/TraceDetail.jsx';
import StatsPanel from './components/StatsPanel.jsx';

export default function App() {
  const selectedTraceId = useStore((s) => s.selectedTraceId);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">local-lang-trace</h1>
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Stats sidebar */}
        <aside className="w-56 border-r border-gray-800 p-4 overflow-y-auto bg-gray-900/50">
          <StatsPanel />
        </aside>

        {/* Main content */}
        <main className="flex-1 flex overflow-hidden">
          <div className={`${selectedTraceId ? 'w-1/2' : 'w-full'} overflow-y-auto`}>
            <TraceList />
          </div>
          {selectedTraceId && (
            <div className="w-1/2 border-l border-gray-800 overflow-y-auto">
              <TraceDetail traceId={selectedTraceId} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

**Step 7: Install UI deps and verify build**

Run: `cd packages/ui && npx vite build`
Expected: build succeeds, outputs to dist/

**Step 8: Commit**

```bash
git add packages/ui/
git commit -m "feat(ui): scaffold React SPA with Vite + Tailwind"
```

---

### Task 11: StatsPanel Component

**Files:**
- Create: `packages/ui/src/components/StatsPanel.jsx`

**Step 1: Write StatsPanel**

```jsx
import React from 'react';
import useSWR from 'swr';
import { apiUrl } from '../store.js';

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function StatsPanel() {
  const { data: stats } = useSWR(apiUrl('/api/stats'), fetcher, { refreshInterval: 5000 });
  const { data: health } = useSWR(apiUrl('/api/health'), fetcher, { refreshInterval: 5000 });

  if (!stats) return <div className="text-gray-500 text-sm">Loading...</div>;

  const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString());

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Statistics</h2>
      <div className="space-y-3">
        <Stat label="Total Traces" value={fmt(stats.total_traces)} />
        <Stat label="Total Runs" value={fmt(stats.total_runs)} />
        <Stat label="Avg Latency" value={stats.avg_latency_ms != null ? `${Math.round(stats.avg_latency_ms)}ms` : '-'} />
        <Stat label="Error Rate" value={stats.error_rate != null ? `${stats.error_rate}%` : '-'}
          className={stats.error_rate > 0 ? 'text-red-400' : ''} />
        <Stat label="Prompt Tokens" value={fmt(stats.total_prompt_tokens)} />
        <Stat label="Compl. Tokens" value={fmt(stats.total_completion_tokens)} />
      </div>
      {health && (
        <>
          <hr className="border-gray-800" />
          <div className="space-y-2">
            <Stat label="Buffer" value={health.buffer_size} />
            <Stat label="DB Size" value={`${health.db_size_mb} MB`} />
            <Stat label="SSE Clients" value={health.sse_clients} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, className = '' }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500 uppercase">{label}</div>
      <div className={`text-sm font-medium ${className}`}>{value}</div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/ui/src/components/StatsPanel.jsx
git commit -m "feat(ui): add StatsPanel component"
```

---

### Task 12: TraceList Page

**Files:**
- Create: `packages/ui/src/pages/TraceList.jsx`

**Step 1: Write TraceList**

```jsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import useSWR from 'swr';
import { useStore, apiUrl } from '../store.js';

const fetcher = (url) => fetch(url).then((r) => r.json());
const PAGE_SIZE = 50;

export default function TraceList() {
  const [filters, setFilters] = useState({ status: '', name: '', from: '', to: '' });
  const [allTraces, setAllTraces] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const setSelectedTraceId = useStore((s) => s.setSelectedTraceId);
  const selectedTraceId = useStore((s) => s.selectedTraceId);

  const params = new URLSearchParams();
  params.set('limit', PAGE_SIZE);
  params.set('offset', offset);
  if (filters.status) params.set('status', filters.status);
  if (filters.name) params.set('name', filters.name);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const { data, mutate } = useSWR(
    apiUrl(`/api/traces?${params}`),
    fetcher,
    { refreshInterval: 5000 }
  );

  // SSE live updates
  useEffect(() => {
    const base = import.meta.env.DEV ? '' : '/ui/..';
    const evtSource = new EventSource(`${base}/api/events`);
    evtSource.addEventListener('trace:new', () => mutate());
    return () => evtSource.close();
  }, [mutate]);

  useEffect(() => {
    if (data) {
      if (offset === 0) {
        setAllTraces(data);
      } else {
        setAllTraces((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === PAGE_SIZE);
    }
  }, [data, offset]);

  const observer = useRef();
  const lastRef = useCallback((node) => {
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore) {
        setOffset((prev) => prev + PAGE_SIZE);
      }
    });
    if (node) observer.current.observe(node);
  }, [hasMore]);

  function handleFilterChange(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
    setOffset(0);
    setAllTraces([]);
  }

  function formatDuration(start, end) {
    if (!end) return '-';
    const ms = end - start;
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  }

  function formatTokens(prompt, completion) {
    const total = (prompt || 0) + (completion || 0);
    return total > 0 ? `${total.toLocaleString()} t` : '-';
  }

  return (
    <div className="p-4">
      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm">
          <option value="">All Status</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
        <input type="text" placeholder="Search name..." value={filters.name}
          onChange={(e) => handleFilterChange('name', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm w-40" />
        <input type="datetime-local" value={filters.from}
          onChange={(e) => handleFilterChange('from', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm" />
        <input type="datetime-local" value={filters.to}
          onChange={(e) => handleFilterChange('to', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm" />
      </div>

      {/* Trace list */}
      <div className="space-y-1">
        {allTraces.map((trace, i) => {
          const isLast = i === allTraces.length - 1;
          const isSelected = trace.trace_id === selectedTraceId;
          return (
            <div key={trace.id} ref={isLast ? lastRef : undefined}
              onClick={() => setSelectedTraceId(trace.trace_id)}
              className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors
                ${isSelected ? 'bg-gray-700' : 'hover:bg-gray-800/50'}
                ${trace.status === 'error' ? 'border-l-2 border-red-500' : 'border-l-2 border-transparent'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs ${trace.status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {trace.status === 'error' ? '!!' : 'OK'}
                </span>
                <span className="font-mono text-sm truncate">{trace.name || trace.trace_id?.slice(0, 8)}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400 shrink-0">
                <span>{formatDuration(trace.start_time, trace.end_time)}</span>
                <span>{formatTokens(trace.tokens_prompt, trace.tokens_completion)}</span>
                <span>{new Date(trace.start_time).toLocaleTimeString()}</span>
              </div>
            </div>
          );
        })}
        {allTraces.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-8">No traces yet. Send some requests!</div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/ui/src/pages/TraceList.jsx
git commit -m "feat(ui): add TraceList page with filters and infinite scroll"
```

---

### Task 13: TraceDetail Page + RunTree + PromptViewer

**Files:**
- Create: `packages/ui/src/pages/TraceDetail.jsx`
- Create: `packages/ui/src/components/RunTree.jsx`
- Create: `packages/ui/src/components/PromptViewer.jsx`

**Step 1: Create PromptViewer**

```jsx
// packages/ui/src/components/PromptViewer.jsx
import React, { useState } from 'react';

export default function PromptViewer({ run }) {
  const [expanded, setExpanded] = useState(false);
  const inputs = tryParse(run.inputs);
  const outputs = tryParse(run.outputs);

  if (run.run_type !== 'llm' && !expanded) {
    return (
      <button onClick={() => setExpanded(true)} className="text-xs text-blue-400 hover:underline mt-1">
        Show I/O
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 text-xs">
      {inputs && (
        <div>
          <div className="text-gray-500 font-medium mb-1">Input</div>
          <pre className="bg-gray-900 rounded p-2 overflow-x-auto whitespace-pre-wrap text-gray-300 max-h-48 overflow-y-auto">
            {formatIO(inputs)}
          </pre>
        </div>
      )}
      {outputs && (
        <div>
          <div className="text-gray-500 font-medium mb-1">Output</div>
          <pre className="bg-gray-900 rounded p-2 overflow-x-auto whitespace-pre-wrap text-gray-300 max-h-48 overflow-y-auto">
            {formatIO(outputs)}
          </pre>
        </div>
      )}
      {run.tokens_prompt != null && (
        <div className="text-gray-500">
          Tokens: prompt={run.tokens_prompt} / completion={run.tokens_completion}
        </div>
      )}
    </div>
  );
}

function tryParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return str; }
}

function formatIO(obj) {
  if (typeof obj === 'string') return obj;
  return JSON.stringify(obj, null, 2);
}
```

**Step 2: Create RunTree**

```jsx
// packages/ui/src/components/RunTree.jsx
import React, { useState } from 'react';
import PromptViewer from './PromptViewer.jsx';

export default function RunTree({ runs }) {
  const tree = buildTree(runs);
  return (
    <div className="space-y-1">
      {tree.map((node) => (
        <RunNode key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}

function RunNode({ node, depth }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const duration = node.end_time ? `${node.end_time - node.start_time}ms` : '...';
  const isError = node.status === 'error';

  return (
    <div style={{ paddingLeft: depth * 20 }}>
      <div
        className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-gray-800/50
          ${isError ? 'text-red-400' : 'text-gray-200'}`}
        onClick={() => setOpen(!open)}
      >
        <span className="text-gray-600 text-xs w-4">
          {hasChildren ? (open ? '\u25BC' : '\u25B6') : '\u2500'}
        </span>
        <span className="font-mono text-sm">{node.name || node.id.slice(0, 8)}</span>
        <span className="text-xs text-gray-500">({node.run_type})</span>
        <span className="ml-auto text-xs text-gray-400">{duration}</span>
      </div>
      {isError && node.error && (
        <div className="text-xs text-red-400 bg-red-950/30 rounded px-2 py-1 ml-6 mt-1">
          {typeof tryParse(node.error) === 'object'
            ? tryParse(node.error)?.message || node.error
            : node.error}
        </div>
      )}
      {open && <PromptViewer run={node} />}
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <RunNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function tryParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return str; }
}

function buildTree(runs) {
  const map = new Map();
  const roots = [];
  for (const r of runs) {
    map.set(r.id, { ...r, children: [] });
  }
  for (const r of runs) {
    const node = map.get(r.id);
    if (r.parent_id && map.has(r.parent_id)) {
      map.get(r.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
```

**Step 3: Create TraceDetail**

```jsx
// packages/ui/src/pages/TraceDetail.jsx
import React from 'react';
import useSWR from 'swr';
import { useStore, apiUrl } from '../store.js';
import RunTree from '../components/RunTree.jsx';

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function TraceDetail({ traceId }) {
  const setSelectedTraceId = useStore((s) => s.setSelectedTraceId);
  const { data, error } = useSWR(
    traceId ? apiUrl(`/api/traces/${traceId}`) : null,
    fetcher
  );

  if (!traceId) return null;
  if (error) return <div className="p-4 text-red-400">Failed to load trace</div>;
  if (!data) return <div className="p-4 text-gray-500">Loading...</div>;
  if (!data.runs || data.runs.length === 0) return <div className="p-4 text-gray-500">Trace not found</div>;

  const root = data.runs.find((r) => !r.parent_id) || data.runs[0];
  const totalDuration = root.end_time ? `${((root.end_time - root.start_time) / 1000).toFixed(1)}s` : '...';

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold font-mono">{root.name || traceId.slice(0, 12)}</h2>
          <div className="text-xs text-gray-400">
            {new Date(root.start_time).toLocaleString()} &middot; {totalDuration}
          </div>
        </div>
        <button onClick={() => setSelectedTraceId(null)}
          className="text-gray-400 hover:text-gray-200 text-sm px-2 py-1">
          Close
        </button>
      </div>
      <RunTree runs={data.runs} />
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add packages/ui/src/pages/TraceDetail.jsx packages/ui/src/components/RunTree.jsx packages/ui/src/components/PromptViewer.jsx
git commit -m "feat(ui): add TraceDetail, RunTree, and PromptViewer components"
```

---

### Task 14: Build UI + Integration Test

**Step 1: Build the UI**

Run: `npm run build:ui`
Expected: dist/ folder created in packages/ui/

**Step 2: Start server and verify**

Run: `cd packages/server && timeout 5 node src/index.js &`
Then: `curl http://localhost:4318/info`
Expected: JSON with version field

Then: `curl -X POST http://localhost:4318/runs -H "Content-Type: application/json" -d '{"id":"test-1","trace_id":"t-1","name":"test_chain","run_type":"chain","start_time":"2026-02-19T10:00:00Z","inputs":{"q":"hello"}}'`
Expected: 202

Then: `curl http://localhost:4318/api/health`
Expected: JSON with buffer_size

Wait 6 seconds for flush, then: `curl 'http://localhost:4318/api/traces?limit=10'`
Expected: array with the test run

Then: `curl http://localhost:4318/api/stats`
Expected: stats with total_runs >= 1

**Step 3: Commit final integration**

```bash
git add -A && git commit -m "feat: complete local-lang-trace v0.1.0"
```
