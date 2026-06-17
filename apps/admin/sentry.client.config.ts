// Sentry init for the browser. No-op without a DSN. PDPA: strip user IP and keep
// Session Replay off — the admin app renders customer PII (names, addresses,
// phone numbers, payment slips) that must never be recorded.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.user) delete event.user.ip_address;
      return event;
    },
  });
}
