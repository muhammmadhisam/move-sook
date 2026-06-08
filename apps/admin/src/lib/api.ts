import { createApiClient } from '@movesook/api/client';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

// Dispatched once when the admin session cookie expires mid-use; SessionExpiredGate
// listens for it to show a notice and redirect to /login.
export const SESSION_EXPIRED_EVENT = 'movesook:session-expired';

// Admin RPC client; credentials:'include' sends the admin session cookie.
export const api = createApiClient(baseUrl, {
  onSessionExpired: () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
  },
});
