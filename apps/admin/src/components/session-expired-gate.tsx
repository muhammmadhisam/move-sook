'use client';

import { useEffect, useState } from 'react';
import { SESSION_EXPIRED_EVENT } from '@/lib/api';

const LOGIN_PATH = '/login';
const REDIRECT_DELAY_MS = 1800;

/**
 * App-wide guard: when the admin session cookie expires mid-use, the API client
 * dispatches SESSION_EXPIRED_EVENT. We show a blocking notice, then hard-redirect
 * to /login (full reload clears the query cache + resets the API client state).
 */
export function SessionExpiredGate() {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const onExpired = () => {
      if (window.location.pathname.startsWith(LOGIN_PATH)) return;
      setExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  useEffect(() => {
    if (!expired) return;
    const t = setTimeout(() => {
      window.location.href = LOGIN_PATH;
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [expired]);

  if (!expired) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 max-w-sm rounded-2xl border bg-card p-6 text-center shadow-lg">
        <p className="text-lg font-semibold">เซสชันหมดอายุ</p>
        <p className="mt-1 text-sm text-muted-foreground">
          เพื่อความปลอดภัย ระบบจะพาคุณไปยังหน้าเข้าสู่ระบบอีกครั้ง…
        </p>
        <span className="mt-4 inline-block h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    </div>
  );
}
