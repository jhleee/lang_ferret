#!/usr/bin/env node
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

ingestRoutes(app, { buffer, flusher });
apiRoutes(app, { db, buffer, sse, dbPath: DB_PATH });

const uiDist = resolve(__dirname, '../../ui/dist');
if (existsSync(uiDist)) {
  await app.register(fastifyStatic, { root: uiDist, prefix: '/ui/', wildcard: true });
  app.get('/ui', (req, reply) => reply.redirect('/ui/'));
}

flusher.start();

async function shutdown() {
  flusher.stop();
  flusher.flush();
  db.close();
  await app.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`local-lang-trace running on http://localhost:${PORT}`);
console.log(`  Viewer: http://localhost:${PORT}/ui`);
console.log(`  Set LANGSMITH_ENDPOINT=http://localhost:${PORT} in your LangChain app`);
