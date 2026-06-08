'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
import { ADMIN_ROLE_LABEL, type AdminRole } from '@movesook/shared';
import { api } from '@/lib/api';
import { useAdminWhoami } from '@/hooks/use-admin-whoami';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: AdminRole[]; // omitted = visible to every admin tier
};

const NAV: NavItem[] = [
  { href: '/', label: 'แดชบอร์ด', icon: LayoutDashboard },
  { href: '/analytics', label: 'วิเคราะห์', icon: LineChart },
  { href: '/reports', label: 'รายงาน', icon: FileText },
  { href: '/supply-demand', label: 'Supply/Demand', icon: Scale },
  { href: '/retention', label: 'Retention', icon: Repeat },
  { href: '/drivers/queue', label: 'คิวตรวจคนขับ', icon: UserCheck, roles: ['SUPER', 'OPS'] },
  { href: '/drivers', label: 'จัดการคนขับ', icon: BadgeCheck, roles: ['SUPER', 'OPS'] },
  { href: '/jobs', label: 'ติดตามงาน', icon: Truck, roles: ['SUPER', 'OPS'] },
  { href: '/payments', label: 'อนุมัติการโอน', icon: ReceiptText, roles: ['SUPER', 'OPS', 'FINANCE'] },
  { href: '/customers', label: 'ลูกค้า', icon: Contact, roles: ['SUPER', 'OPS'] },
  { href: '/users', label: 'ผู้ใช้ (User)', icon: Users, roles: ['SUPER', 'OPS'] },
  { href: '/disputes', label: 'ข้อร้องเรียน', icon: AlertTriangle, roles: ['SUPER', 'OPS'] },
  { href: '/blacklist', label: 'บัญชีดำ', icon: Ban, roles: ['SUPER', 'OPS'] },
  { href: '/transactions', label: 'ธุรกรรมกับลูกค้า', icon: Receipt, roles: ['SUPER', 'FINANCE'] },
  { href: '/payouts', label: 'ธุรกรรมกับคนขับ', icon: Banknote, roles: ['SUPER', 'FINANCE'] },
  { href: '/promos', label: 'โค้ดส่วนลด', icon: Ticket, roles: ['SUPER', 'FINANCE'] },
  { href: '/audit', label: 'บันทึกการใช้งาน', icon: History },
  { href: '/admins', label: 'ผู้ดูแลระบบ', icon: ShieldCheck, roles: ['SUPER'] },
  { href: '/settings', label: 'ตั้งค่า', icon: Settings, roles: ['SUPER', 'FINANCE'] },
];

/** Logo + nav links + logout — shared by the desktop sidebar and the mobile drawer. */
function SidebarBody({
  items,
  pathname,
  roleLabel,
  onNavigate,
  onLogout,
}: {
  items: NavItem[];
  pathname: string;
  roleLabel?: string;
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
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
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
              {label}
            </Link>
          );
        })}
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

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const logout = async () => {
    await api.auth.logout.$post();
    router.replace('/login');
  };

  // While whoami is loading, show only the unrestricted items to avoid fl/flicker of gated links.
  const items = NAV.filter((n) => !n.roles || (me ? n.roles.includes(me.adminRole) : false));
  const roleLabel = me ? ADMIN_ROLE_LABEL[me.adminRole] : undefined;

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-navy-800 bg-navy-900 p-4 text-white lg:flex">
        <SidebarBody items={items} pathname={pathname} roleLabel={roleLabel} onLogout={logout} />
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
              items={items}
              pathname={pathname}
              roleLabel={roleLabel}
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
