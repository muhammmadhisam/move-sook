'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  LineChart,
  FileText,
  Repeat,
  Scale,
  BadgeCheck,
  UserCheck,
  Truck,
  Contact,
  Users,
  AlertTriangle,
  Receipt,
  Banknote,
  ReceiptText,
  Ticket,
  Ban,
  History,
  ShieldCheck,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { Button, cn } from '@movesook/ui';
import { ADMIN_ROLE_LABEL, type AdminRole, type AdminStatsResponse } from '@movesook/shared';
import { api } from '@/lib/api';
import { useAdminWhoami } from '@/hooks/use-admin-whoami';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: AdminRole[]; // omitted = visible to every admin tier
  badgeKey?: NumericStatKey; // numeric stat to show as a notification badge
};

// Scalar (number-valued) keys of the stats response — eligible for a nav badge.
type NumericStatKey = {
  [K in keyof AdminStatsResponse]: AdminStatsResponse[K] extends number ? K : never;
}[keyof AdminStatsResponse];

type NavGroup = {
  title: string; // section header shown above the group's links
  items: NavItem[];
};

const NAV: NavGroup[] = [
  {
    title: 'ภาพรวม',
    items: [
      { href: '/', label: 'แดชบอร์ด', icon: LayoutDashboard },
      { href: '/analytics', label: 'วิเคราะห์', icon: LineChart },
      { href: '/reports', label: 'รายงาน', icon: FileText },
      { href: '/supply-demand', label: 'Supply/Demand', icon: Scale },
      { href: '/retention', label: 'Retention', icon: Repeat },
    ],
  },
  {
    title: 'ปฏิบัติการ',
    items: [
      { href: '/jobs', label: 'ติดตามงาน', icon: Truck, roles: ['SUPER', 'OPS'] },
      { href: '/drivers/queue', label: 'คิวตรวจคนขับ', icon: UserCheck, roles: ['SUPER', 'OPS'] },
      { href: '/drivers', label: 'จัดการคนขับ', icon: BadgeCheck, roles: ['SUPER', 'OPS'] },
      { href: '/customers', label: 'ลูกค้า', icon: Contact, roles: ['SUPER', 'OPS'] },
      { href: '/users', label: 'ผู้ใช้ (User)', icon: Users, roles: ['SUPER', 'OPS'] },
      { href: '/disputes', label: 'ข้อร้องเรียน', icon: AlertTriangle, roles: ['SUPER', 'OPS'] },
      { href: '/blacklist', label: 'บัญชีดำ', icon: Ban, roles: ['SUPER', 'OPS'] },
    ],
  },
  {
    title: 'การเงิน',
    items: [
      {
        href: '/payments',
        label: 'อนุมัติการโอน',
        icon: ReceiptText,
        roles: ['SUPER', 'OPS', 'FINANCE'],
        badgeKey: 'pendingPaymentReview',
      },
      { href: '/transactions', label: 'ธุรกรรมกับลูกค้า', icon: Receipt, roles: ['SUPER', 'FINANCE'] },
      { href: '/payouts', label: 'ธุรกรรมกับคนขับ', icon: Banknote, roles: ['SUPER', 'FINANCE'] },
      { href: '/promos', label: 'โค้ดส่วนลด', icon: Ticket, roles: ['SUPER', 'FINANCE'] },
    ],
  },
  {
    title: 'ระบบ',
    items: [
      { href: '/audit', label: 'บันทึกการใช้งาน', icon: History },
      { href: '/admins', label: 'ผู้ดูแลระบบ', icon: ShieldCheck, roles: ['SUPER'] },
      { href: '/settings', label: 'ตั้งค่า', icon: Settings, roles: ['SUPER', 'FINANCE'] },
    ],
  },
];

/** Logo + nav links + logout — shared by the desktop sidebar and the mobile drawer. */
function SidebarBody({
  groups,
  pathname,
  roleLabel,
  stats,
  onNavigate,
  onLogout,
}: {
  groups: NavGroup[];
  pathname: string;
  roleLabel?: string;
  stats?: AdminStatsResponse;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
          MS
        </div>
        <div>
          <span className="block text-base font-semibold leading-tight tracking-tight">
            MoveSook
          </span>
          {roleLabel && <span className="text-xs text-navy-300">{roleLabel}</span>}
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-1">
            <span className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-navy-400">
              {group.title}
            </span>
            {group.items.map(({ href, label, icon: Icon, badgeKey }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              const count = badgeKey ? (stats?.[badgeKey] ?? 0) : 0;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-navy-200 hover:bg-navy-800 hover:text-white',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums',
                        active
                          ? 'bg-primary-foreground text-primary'
                          : 'bg-red-500 text-white',
                      )}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <Button
        variant="ghost"
        className="mt-2 justify-start text-navy-200 hover:bg-navy-800 hover:text-white"
        onClick={onLogout}
      >
        <LogOut className="h-4 w-4" />
        ออกจากระบบ
      </Button>
    </>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useAdminWhoami();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Lightweight poll for notification badges (e.g. slips awaiting approval). Shares
  // the ['admin', 'stats'] cache with the dashboard/session probe.
  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async (): Promise<AdminStatsResponse> => {
      const res = await api.admin.stats.$get();
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      return (await res.json()) as AdminStatsResponse;
    },
    refetchInterval: 30_000,
    retry: false,
  });

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const logout = async () => {
    await api.auth.logout.$post();
    router.replace('/login');
  };

  // While whoami is loading, show only the unrestricted items to avoid flicker of gated
  // links. Filter each group's items by role, then drop any group left empty.
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((n) => !n.roles || (me ? n.roles.includes(me.adminRole) : false)),
  })).filter((g) => g.items.length > 0);
  const roleLabel = me ? ADMIN_ROLE_LABEL[me.adminRole] : undefined;

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-navy-800 bg-navy-900 p-4 text-white lg:flex">
        <SidebarBody
          groups={groups}
          pathname={pathname}
          roleLabel={roleLabel}
          stats={stats}
          onLogout={logout}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col border-r border-navy-800 bg-navy-900 p-4 text-white shadow-xl">
            <button
              type="button"
              aria-label="ปิดเมนู"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-md p-1 text-navy-300 hover:bg-navy-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarBody
              groups={groups}
              pathname={pathname}
              roleLabel={roleLabel}
              stats={stats}
              onNavigate={() => setMobileOpen(false)}
              onLogout={logout}
            />
          </aside>
        </div>
      )}

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-navy-800 bg-navy-900 px-4 py-3 text-white lg:hidden">
          <button
            type="button"
            aria-label="เปิดเมนู"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1 hover:bg-navy-800"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              MS
            </div>
            <span className="text-base font-semibold tracking-tight">MoveSook</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
