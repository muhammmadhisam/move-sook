import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './config';
import { startWorkers, stopWorkers } from '@movesook/services/support';

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`🚚 MoveSook API listening on http://localhost:${info.port}`);
});

// BullMQ workers: LINE-push queue + repeatable maintenance jobs (idle-driver
// nudge, expire unpaid jobs). No-op when WORKERS_ENABLED=false.
void startWorkers().catch((err) => console.error('[workers] failed to start', err));

// Graceful shutdown: drain in-flight jobs and close Redis before exiting.
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[shutdown] ${signal} received — draining workers`);
    server.close();
    void stopWorkers().finally(() => process.exit(0));
  });
}
