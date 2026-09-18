/**
 * Server-Sent Events hub: one stream per browser, broadcast to all of them.
 * This is what powers the live progress bar.
 */
export function createSseHub({ config, logger }) {
  const clients = new Set();

  function write(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false;
    }
  }

  function handler(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 3000\n\n');

    const client = { res, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), alive: true };
    clients.add(client);
    write(res, 'hello', {
      mode: config.demoMode === 'off' ? 'live' : 'demo',
      version: config.version,
      heartbeatMs: config.heartbeatMs,
      ts: Date.now(),
    });

    const heartbeat = setInterval(() => {
      if (!write(res, 'ping', { ts: Date.now() })) cleanup();
    }, config.heartbeatMs);
    heartbeat.unref?.();

    function cleanup() {
      if (!client.alive) return;
      client.alive = false;
      clearInterval(heartbeat);
      clients.delete(client);
      try { res.end(); } catch { /* ignore */ }
    }

    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('error', cleanup);
    return cleanup;
  }

  function broadcast(event, data) {
    if (!clients.size) return 0;
    let sent = 0;
    for (const client of [...clients]) {
      if (write(client.res, event, data)) sent++;
      else clients.delete(client);
    }
    if (logger.debug) logger.debug(`sse broadcast ${event} → ${sent} client(s)`);
    return sent;
  }

  function closeAll() {
    for (const client of [...clients]) {
      try { client.res.end(); } catch { /* ignore */ }
      clients.delete(client);
    }
  }

  return { handler, broadcast, closeAll, size: () => clients.size };
}
