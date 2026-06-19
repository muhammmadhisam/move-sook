'use client';

import Link from 'next/link';
import { useNotifications } from '@/hooks/use-notifications';

/** Bell with unread badge, links to the notifications screen. */
export function NotificationBell() {
  const { unreadCount } = useNotifications();

  return (
    <Link
      href="/app/notifications"
      aria-label="การแจ้งเตือน"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-input bg-background text-foreground shadow-xs transition-colors hover:bg-accent"
    >
      {/* bell glyph (inline SVG — no emoji, no extra dep) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.268 21a2 2 0 0 0 3.464 0" />
        <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-5 text-destructive-foreground">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
