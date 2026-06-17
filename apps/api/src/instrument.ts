// Sentry initialization. MUST be imported before the app/services modules so
// Sentry's auto-instrumentation (http, etc.) can patch them. `index.ts` imports
// this on its very first line. When SENTRY_DSN is unset this is a no-op, so dev
// and tests run untouched and `Sentry.captureException()` elsewhere is safe.
import * as Sentry from '@sentry/node';
import { env } from './config';

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // PDPA: never ship request bodies/IPs by default, and strip auth material +
    // LINE identifiers from anything that does get sent.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        const headers = event.request.headers;
        if (headers) {
          for (const h of [
            'authorization',
            'cookie',
            'x-system-key',
            'x-line-signature',
          ]) {
            delete headers[h];
          }
        }
      }
      return event;
    },
  });
}

export { Sentry };
