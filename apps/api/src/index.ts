import { Sentry } from './instrument'; // MUST be first — initializes Sentry before app/services load
import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './config';
import { logger } from './lib/logger';
import { configureObservability, configureDocStore } from '@movesook/services/runtime';
import { startWorkers, stopWorkers } from '@movesook/services/support';
import { docStore } from './routes/uploads';

// Inject pino + Sentry into @movesook/services (queues/notify/audit/etc.) before
// workers start, so their logs are structured and permanent failures get reported.
configureObservability({
  logger,
  reportError: (err, ctx) =>
    Sentry.captureException(err, ctx ? { extra: ctx } : undefined),
});

// Back the generated-document (PDF) cache with the app's R2/disk store so the
// builders can serve a cache hit instead of re-fetching images + re-rendering.
configureDocStore(docStore);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, '🚚 MoveSook API listening');
});

// BullMQ workers: LINE-push queue + repeatable maintenance jobs (idle-driver
// nudge, expire unpaid jobs). No-op when WORKERS_ENABLED=false.
void startWorkers().catch((err) => logger.error({ err }, '[workers] failed to start'));

// Graceful shutdown: drain in-flight jobs and close Redis before exiting.
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, '[shutdown] received — draining workers');
    server.close();
    void Promise.allSettled([stopWorkers(), Sentry.close(2000)]).finally(() =>
      process.exit(0),
    );
  });
}
