export default function ingestRoutes(fastify, { buffer, flusher }) {
  // SDK handshake
  fastify.get('/info', async () => ({
    version: '0.1.0',
    batch_ingest_config: {
      use_multipart_endpoint: false,
      size_limit_bytes: null,
      size_limit: 20,
      scale_up_nthreads_limit: 16,
      scale_up_qsize_trigger: 1000,
      scale_down_nempty_trigger: 4,
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
