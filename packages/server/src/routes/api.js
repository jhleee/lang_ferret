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
    reply.raw.write(': heartbeat\n\n');
  });
}
