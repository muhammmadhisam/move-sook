'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ensureLiff, getLineIdToken } from '@/lib/liff';
import { useAuthStore } from '@/store/auth';
import type { MeResponse } from '@movesook/shared';

// Guards the auto-exchange so it fires once per page load even when several
// components mount useAuth() (AppShell + the page both call it). Reset on a
// failed exchange so a later remount/navigation can try again rather than the
// flag wedging the user on the error screen forever.
let lineExchangeStarted = false;

// Marks a /auth/line failure as transient (LINE verify endpoint blip / our API
// 5xx) so the mutation retries with backoff. 4xx (bad/expired token, banned) is
// permanent — surface it instead of hammering.
class RetryableLoginError extends Error {}

async function fetchMe(): Promise<MeResponse | null> {
  const res = await api.me.$get();
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Failed to load profile');
  return (await res.json()) as MeResponse;
}

export function useAuth() {
  const { setMe, setStatus } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  const meQuery = useQuery({ queryKey: ['me'], queryFn: fetchMe });

  // Whether liff.init() has run — until it has, we can't tell if the user is
  // mid-login (returning from LINE with ?code/&state in the URL), so the gate
  // must wait rather than bounce to /login and drop the OAuth callback.
  const [liffChecked, setLiffChecked] = useState(false);

  useEffect(() => {
    if (meQuery.isLoading) setStatus('loading');
    else setMe(meQuery.data ?? null);
  }, [meQuery.data, meQuery.isLoading, setMe, setStatus]);

  const login = useMutation({
    mutationFn: async () => {
      const idToken = await getLineIdToken();
      const res = await api.auth.line.$post({ json: { idToken } });
      if (!res.ok) {
        // Surface the server's reason (e.g. "LINE verify failed: aud_mismatch")
        // instead of a generic message — the login page shows it so failures are
        // self-diagnosing rather than an opaque "เข้าสู่ระบบไม่สำเร็จ".
        let reason = `HTTP ${res.status}`;
        try {
          const body: unknown = await res.json();
          if (body && typeof body === 'object' && 'error' in body) {
            reason = String((body as { error: unknown }).error);
          }
        } catch {
          // non-JSON body — keep the status code
        }
        // 5xx = transient (retry); 4xx = permanent (don't).
        throw res.status >= 500 ? new RetryableLoginError(reason) : new Error(reason);
      }
      return res.json();
    },
    // Only retry the transient class; getLineIdToken's redirect throw and 4xx
    // are plain Errors and fall through immediately.
    retry: (failureCount, error) =>
      failureCount < 2 && error instanceof RetryableLoginError,
    retryDelay: (attempt) => 500 * 2 ** attempt,
    // Keep the gate set on success (we have a session now; the meQuery.data
    // guard also blocks a re-fire). Only release it on failure so the next
    // mount/navigation can retry the auto-exchange instead of wedging here.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
    onError: () => {
      lineExchangeStarted = false;
    },
  });

  // Initialize LIFF on load. liff.init() consumes the ?code/&state OAuth callback
  // after a LINE login redirect and cleans the URL; if a LINE session exists but
  // we have no app cookie yet, finalize it by exchanging the id_token for our JWT.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = await ensureLiff();
        if (
          !cancelled &&
          client.isLoggedIn() &&
          !meQuery.isLoading &&
          !meQuery.data &&
          !lineExchangeStarted
        ) {
          lineExchangeStarted = true;
          login.mutate();
        }
      } catch {
        // Not in a LIFF context / NEXT_PUBLIC_LIFF_ID unset — fall back to the
        // manual login button (and dev login).
      } finally {
        if (!cancelled) setLiffChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run once the session query resolves so we exchange the moment we know
    // there's a LINE session but no app session. (login is intentionally not a
    // dep — lineExchangeStarted guards against re-firing.)
  }, [meQuery.data, meQuery.isLoading]);

  const logout = useMutation({
    mutationFn: async () => {
      await api.auth.logout.$post();
    },
    onSuccess: () => {
      useAuthStore.getState().reset();
      queryClient.invalidateQueries({ queryKey: ['me'] });
      router.replace('/'); // back to home after signing out
    },
  });

  // DEV ONLY — bypass LINE to log in as a mock USER/DRIVER (API 403s in prod).
  const devLogin = useMutation({
    mutationFn: async (role: 'USER' | 'DRIVER') => {
      const res = await api.auth.dev.login.$post({ json: { role } });
      if (!res.ok) throw new Error('dev login failed');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  // Stay "loading" until LIFF has been checked and any in-flight LINE exchange
  // settles — otherwise the gate bounces to /login before login can complete.
  const isLoading = meQuery.isLoading || !liffChecked || login.isPending;

  return { me: meQuery.data ?? null, isLoading, login, logout, devLogin };
}
