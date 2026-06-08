import { createApiClient } from '@movesook/api/client';

// Exported so non-hc consumers (e.g. EventSource for SSE tracking) can build URLs.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

// Dispatched once when the session cookie expires mid-use; SessionExpiredGate
// listens for it to show a notice and redirect to /login.
export const SESSION_EXPIRED_EVENT = 'movesook:session-expired';

// Single browser RPC client; credentials:'include' sends the user session cookie.
export const api = createApiClient(API_BASE_URL, {
  onSessionExpired: () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
  },
});
