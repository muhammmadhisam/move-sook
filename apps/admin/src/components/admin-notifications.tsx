'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { cn } from '@movesook/ui';
import type { AdminRole, AdminStatsResponse } from '@movesook/shared';

// One actionable notification line. `count` is read from the shared stats payload;
// `roles` gates which admin tiers the item is relevant for (mirrors the nav gating).
type NotiSource = {
  key: keyof AdminStatsResponse;
  label: string;
  href: string;
  roles?: AdminRole[]; // omitted = every admin tier
};

// Ordered most-urgent-first. Each maps to a numeric stat and the page that clears it.
const SOURCES: NotiSource[] = [
  {
    key: 'pendingPaymentReview',
    label: 'สลิปรอการอนุมัติ',
    href: '/payments',
    roles: ['SUPER', 'OPS', 'FINANCE'],
  },
  {
    key: 'slipRejectionEscalations',
    label: 'งานที่สลิปถูกปฏิเสธหลายครั้ง',
    href: '/payments',
    roles: ['SUPER', 'OPS', 'FINANCE'],
  },
  {
    key: 'pendingDrivers',
    label: 'คนขับรอตรวจสอบ',
    href: '/drivers/queue',
    roles: ['SUPER', 'OPS'],
  },
  {
    key: 'openDisputes',
    label: 'ข้อร้องเรียนที่ยังไม่ปิด',
    href: '/disputes',
    roles: ['SUPER', 'OPS'],
  },
  {
    key: 'pendingDestChanges',
    label: 'คำขอเปลี่ยนปลายทางรอดำเนินการ',
    href: '/jobs',
    roles: ['SUPER', 'OPS'],
  },
];

/**
 * Notification bell for the admin sidebar header. Aggregates the actionable counts
 * already exposed by GET /admin/stats into a single dropdown, gated by admin role.
 * Reads `stats` from the parent (same ['admin','stats'] query that drives nav badges) —
 * it does not fetch on its own.
 */
export function AdminNotifications({
  stats,
  role,
  onNavigate,
}: {
  stats?: AdminStatsResponse;
  role?: AdminRole;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = SOURCES.filter((s) => !s.roles || (role ? s.roles.includes(role) : false)).map(
    (s) => ({ ...s, count: Number(stats?.[s.key] ?? 0) }),
  );
  const total = items.reduce((n, i) => n + i.count, 0);

  const go = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="การแจ้งเตือน"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white tabular-nums">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full top-0 z-50 ml-2 w-72 overflow-hidden rounded-lg border border-navy-700 bg-navy-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-navy-800 px-3 py-2">
            <span className="text-sm font-semibold text-white">การแจ้งเตือน</span>
            <span className="text-xs text-navy-400">{total} รายการ</span>
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-navy-400">ไม่มีรายการ</li>
            ) : (
              items.map((i) => (
                <li key={i.key}>
                  <Link
                    href={i.href}
                    onClick={go}
                    className={cn(
                      'flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-navy-800',
                      i.count > 0 ? 'text-navy-100' : 'text-navy-400',
                    )}
                  >
                    <span className="flex-1">{i.label}</span>
                    <span
                      className={cn(
                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums',
                        i.count > 0 ? 'bg-red-500 text-white' : 'bg-navy-800 text-navy-400',
                      )}
                    >
                      {i.count > 99 ? '99+' : i.count}
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
