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
    for (const reply of [...clients]) {
      try {
        if (!reply.raw.destroyed) reply.raw.write(payload);
        else clients.delete(reply);
      } catch { clients.delete(reply); }
    }
  }

  return { addClient, broadcast, get clientCount() { return clients.size; } };
}
