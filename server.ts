import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check API
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      service: 'parando-auction-ecosystem',
      standards: ['ADR-001', 'ADR-002', 'ADR-003', 'ADR-004'],
      timestamp: new Date().toISOString(),
    });
  });

  const server = http.createServer(app);

  // WebSocket Server on /ws
  const wss = new WebSocketServer({ server, path: '/ws' });
  const connectedClients = new Set<WebSocket>();

  function broadcastPresence() {
    const presencePayload = JSON.stringify({
      type: 'PRESENCE_SYNC',
      payload: { activeWatchers: connectedClients.size },
      timestamp: Date.now(),
    });

    for (const client of connectedClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(presencePayload);
      }
    }
  }

  wss.on('connection', (ws) => {
    connectedClients.add(ws);
    broadcastPresence();

    ws.on('message', (data) => {
      try {
        const msgStr = data.toString();
        const parsed = JSON.parse(msgStr);

        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          return;
        }

        // Broadcast to all other connected clients
        for (const client of connectedClients) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(msgStr);
          }
        }
      } catch (err) {
        console.warn('[WS] Error processing message:', err);
      }
    });

    ws.on('close', () => {
      connectedClients.delete(ws);
      broadcastPresence();
    });

    ws.on('error', () => {
      connectedClients.delete(ws);
      broadcastPresence();
    });
  });

  // Mount Vite in dev mode
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('index.html', { root: 'dist' });
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[ParandO] Server and WebSocket live on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[ParandO] Fatal error starting server:', err);
  process.exit(1);
});
