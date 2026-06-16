'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Home, Truck, Package, Bell, User } from 'lucide-react';
import { cn } from '@movesook/ui';
import type { JobListResponse, JobStatus } from '@movesook/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useNotifications } from '@/hooks/use-notifications';
import { DriverLocationBroadcaster } from '@/components/driver-location-broadcaster';

// Statuses where the driver is en route — broadcast GPS only during these.
const EN_ROUTE: Set<JobStatus> = new Set(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);

// Top-level destinations reachable from the bottom bar (no back button on these).
const TOP_LEVEL = new Set(['/app', '/jobs', '/my-jobs', '/active', '/notifications', '/profile']);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, isLoading } = useAuth();
  const { unreadCount } = useNotifications();

  // Driver-only: track active jobs app-wide so GPS broadcasting survives page
  // navigation. Shares the ['active-jobs'] cache with the /active page (no extra
  // fetch when that page is open); polled so a freshly-accepted job turns it on.
  const activeJobs = useQuery({
    queryKey: ['active-jobs'],
    queryFn: async (): Promise<JobListResponse> => {
      const res = await api.jobs.$get({ query: { mine: 'true' } });
      if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
      return (await res.json()) as JobListResponse;
    },
    enabled: me?.role === 'DRIVER',
    refetchInterval: 30_000,
  });

  // Gate the app shell: once the session resolves with no user, bounce to /login.
  useEffect(() => {
    if (!isLoading && !me) router.replace('/login');
  }, [isLoading, me, router]);

  // First load / redirecting: render nothing chrome-less to avoid a flash.
  if (!me || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      </div>
    );
  }

  const isDriver = me.role === 'DRIVER';
  const hasEnRouteJob =
    isDriver && (activeJobs.data?.items.some((j) => EN_ROUTE.has(j.status)) ?? false);
  const showBack = !TOP_LEVEL.has(pathname);

  const tabs = [
    { href: '/app', label: 'หน้าหลัก', icon: Home, match: (p: string) => p === '/app' },
    isDriver
      ? { href: '/active', label: 'งานของฉัน', icon: Truck, match: (p: string) => p.startsWith('/active') || p.startsWith('/jobs') }
      : { href: '/my-jobs', label: 'งานของฉัน', icon: Package, match: (p: string) => p.startsWith('/my-jobs') || p.startsWith('/jobs') },
    { href: '/notifications', label: 'แจ้งเตือน', icon: Bell, match: (p: string) => p.startsWith('/notifications'), badge: unreadCount },
    { href: '/profile', label: 'โปรไฟล์', icon: User, match: (p: string) => p.startsWith('/profile') },
  ];

  return (
    <div className="min-h-screen">
      {/* App-wide GPS broadcast — only a DRIVER with an en-route job (battery-safe). */}
      <DriverLocationBroadcaster enabled={hasEnRouteJob} />

      {/* Top app bar — navy chrome (secondary brand) */}
      <header className="sticky top-0 z-30 border-b border-navy-800 bg-navy-900 text-white backdrop-blur supports-[backdrop-filter]:bg-navy-900/95">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          {showBack ? (
            <button
              type="button"
              aria-label="ย้อนกลับ"
              onClick={() => router.back()}
              className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-navy-800"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <Image
              src="/brand-mark.png"
              alt="MoveSook"
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg"
              priority
            />
          )}
          <span className="text-base font-semibold tracking-tight">MoveSook</span>
        </div>
      </header>

      {/* Page content — bottom padding clears the fixed nav */}
      <div className="pb-24">{children}</div>

      {/* Bottom tab bar — navy chrome, active tab in brand red */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-navy-800 bg-navy-900">
        <div className="mx-auto flex max-w-md">
          {tabs.map(({ href, label, icon: Icon, match, badge }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors',
                  active ? 'font-semibold text-white' : 'text-navy-300 hover:text-navy-100',
                )}
              >
                {active && (
                  <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" />
                )}
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {typeof badge === 'number' && badge > 0 && (
                    <span className="absolute -right-2 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-destructive-foreground">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
