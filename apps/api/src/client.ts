import { hc } from 'hono/client';
import type { AppType } from './app';

export interface ApiClientOptions {
  /** Extra RequestInit merged into every call (credentials are always included). */
  init?: RequestInit;
  /**
   * Fired once when a *previously authenticated* session starts returning 401 —
   * i.e. the cookie expired mid-use. NOT fired for a first-visit 401 (never logged
   * in) or for /auth/* endpoints (login/logout failures), so clients can show a
   * "session expired" notice + redirect only when it's genuinely an expiry.
   */
  onSessionExpired?: () => void;
}

// Auth endpoints (login/logout/dev-login) — a 401 here is a credential failure,
// not a session expiry, so it must never trigger the expiry handler.
const AUTH_ENDPOINT = /\/auth(\/|$)/;

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Factory for a type-safe RPC client. web + admin import this and pass their
 * API base URL. `fetch` is overridden so cookies are sent cross-origin and so a
 * mid-session 401 can be surfaced via `onSessionExpired`.
 */
export function createApiClient(baseUrl: string, opts?: ApiClientOptions) {
  // Per-client state (each app holds one singleton client).
  let authedOnce = false; // a protected call has succeeded → we know a session existed
  let expiredFired = false; // guard so the handler runs at most once per page load

  const wrappedFetch: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    if (!AUTH_ENDPOINT.test(urlOf(input))) {
      if (res.ok) {
        authedOnce = true;
      } else if (res.status === 401 && authedOnce && !expiredFired) {
        expiredFired = true;
        opts?.onSessionExpired?.();
      }
    }
    return res;
  };

  return hc<AppType>(baseUrl, {
    init: { credentials: 'include', ...opts?.init },
    fetch: wrappedFetch,
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { AppType };
