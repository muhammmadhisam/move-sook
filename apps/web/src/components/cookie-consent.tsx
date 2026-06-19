'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, cn } from '@movesook/ui';

// MoveSook uses only strictly-necessary cookies (httpOnly session auth, no ad/cross-site
// tracking) — see /privacy §3. This banner is therefore a one-time acknowledgement, not a
// granular opt-in/opt-out manager. Acceptance is remembered in localStorage so it never
// re-prompts. Bump the version suffix if the cookie usage materially changes.
const CONSENT_KEY = 'movesook.cookie-consent.v1';

export function CookieConsent() {
  // Start hidden so SSR markup matches the pre-hydration client (no flash before we can
  // read localStorage), then reveal only if the user hasn't acknowledged yet.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
    } catch {
      // localStorage can throw in private mode / blocked storage — just show the banner.
      setVisible(true);
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(CONSENT_KEY, new Date().toISOString());
    } catch {
      // Best-effort: if persistence fails the banner reappears next visit, which is fine.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="การยอมรับคุกกี้"
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 border-t border-navy-800 bg-navy-900 text-navy-100 shadow-lg',
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-sm leading-relaxed">
          เราใช้คุกกี้ที่จำเป็นต่อการทำงานของระบบ (เช่น คุกกี้เซสชันสำหรับการเข้าสู่ระบบ)
          เพื่อให้เว็บไซต์ทำงานได้อย่างปลอดภัย เราไม่ใช้คุกกี้เพื่อการโฆษณาหรือการติดตามข้ามเว็บไซต์{' '}
          <Link href="/privacy" className="font-medium text-white underline underline-offset-4">
            อ่านนโยบายความเป็นส่วนตัว
          </Link>
        </p>
        <Button onClick={accept} className="shrink-0 sm:w-auto" size="sm">
          ยอมรับ
        </Button>
      </div>
    </div>
  );
}
