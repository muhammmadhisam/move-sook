'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChevronRight,
  CheckCircle2,
  FileText,
  Gift,
  HelpCircle,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Shield,
  Truck,
  UserCog,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@movesook/ui';
import type {
  DriverEarningsResponse,
  DriverVerifyStatus,
  JobListResponse,
  PublicSystemConfig,
} from '@movesook/shared';
import { useAuth } from '@/hooks/use-auth';
import { AvailabilityToggle } from '@/components/availability-toggle';
import { DriverAppealDialog } from '@/components/driver-appeal-dialog';
import { api } from '@/lib/api';

const baht = (n: number) => `฿${n.toLocaleString()}`;

const STATUS_BANNER: Record<
  DriverVerifyStatus,
  { variant: 'secondary' | 'success' | 'warning' | 'destructive'; label: string; note: string }
> = {
  PENDING: { variant: 'warning', label: 'รออนุมัติ', note: 'กำลังตรวจสอบเอกสารคนขับของคุณ' },
  APPROVED: { variant: 'success', label: 'อนุมัติแล้ว', note: 'เริ่มรับงานได้เลย' },
  REJECTED: { variant: 'destructive', label: 'ไม่ผ่านการอนุมัติ', note: '' },
  SUSPENDED: { variant: 'destructive', label: 'ถูกระงับชั่วคราว', note: 'ติดต่อทีมงานเพื่อปลดล็อก' },
};

export default function ProfilePage() {
  const { me, isLoading, logout } = useAuth();
  // Treat anyone with a driver profile as a driver, not just role==='DRIVER':
  // a session whose JWT role lags behind (e.g. claimed via invite in a prior
  // session) still has me.isDriver set, so the driver menu/sections show.
  const isDriver = me?.role === 'DRIVER' || me?.isDriver === true;

  const earnings = useQuery({
    queryKey: ['earnings'],
    enabled: isDriver,
    queryFn: async (): Promise<DriverEarningsResponse> => {
      const res = await api.drivers.me.earnings.$get();
      if (!res.ok) throw new Error('โหลดรายได้ไม่สำเร็จ');
      return (await res.json()) as DriverEarningsResponse;
    },
  });

  // Customer job summary — surfaced on the otherwise-bare customer profile.
  const jobs = useQuery({
    queryKey: ['my-jobs'],
    enabled: me != null && !isDriver,
    queryFn: async (): Promise<JobListResponse> => {
      const res = await api.jobs.$get({ query: {} });
      if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
      return (await res.json()) as JobListResponse;
    },
  });

  // Support contact (phone / LINE / email) — public, cached app-wide.
  const config = useQuery({
    queryKey: ['system', 'public'],
    queryFn: async (): Promise<PublicSystemConfig> => {
      const res = await api.system.public.$get();
      if (!res.ok) throw new Error();
      return (await res.json()) as PublicSystemConfig;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !me) {
    return <div className="mx-auto max-w-md p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;
  }

  const banner = me.verifyStatus ? STATUS_BANNER[me.verifyStatus] : null;

  const allJobs = jobs.data?.items ?? [];
  const totalJobs = allJobs.length;
  const doneJobs = allJobs.filter((j) => j.status === 'DELIVERED').length;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      {/* Identity */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {(me.displayName ?? 'U').charAt(0)}
            </div>
            <div>
              <CardTitle className="text-lg">{me.displayName ?? 'ผู้ใช้'}</CardTitle>
              <CardDescription>
                {me.role === 'DRIVER' ? 'คนขับ' : 'ลูกค้า'}
                {me.phone ? ` · ${me.phone}` : ''}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Customer job summary */}
      {!isDriver && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border bg-card p-3.5">
            <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
              <Package className="h-4 w-4" />
              <span className="text-xs">งานทั้งหมด</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{totalJobs}</p>
          </div>
          <div className="rounded-2xl border bg-card p-3.5">
            <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs">เสร็จสิ้น</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{doneJobs}</p>
          </div>
        </div>
      )}

      {/* Driver verification status */}
      {isDriver && banner && (
        <Card>
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">สถานะคนขับ</span>
              <Badge variant={banner.variant}>{banner.label}</Badge>
            </div>
            {me.serviceProvince && (
              <p className="text-sm text-muted-foreground">พื้นที่ให้บริการ: {me.serviceProvince}</p>
            )}
            {(me.rejectionReason || banner.note) && (
              <p className="text-sm text-muted-foreground">{me.rejectionReason || banner.note}</p>
            )}
            {(me.verifyStatus === 'REJECTED' || me.verifyStatus === 'SUSPENDED') && (
              <div className="pt-2">
                <DriverAppealDialog rejected={me.verifyStatus === 'REJECTED'} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Driver availability */}
      {isDriver && me.verifyStatus === 'APPROVED' && (
        <Card>
          <CardContent className="p-4">
            <AvailabilityToggle initial={me.isAvailable} />
          </CardContent>
        </Card>
      )}

      {/* Driver earnings */}
      {isDriver && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">รายได้</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {earnings.isLoading ? (
              <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
            ) : earnings.data ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">รอโอน</p>
                    <p className="text-lg font-semibold">{baht(earnings.data.pendingNet)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">โอนแล้ว</p>
                    <p className="text-lg font-semibold">{baht(earnings.data.paidNet)}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  งานสำเร็จ {earnings.data.jobCount} งาน · รวมรายได้ {baht(earnings.data.totalNet)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">ยังไม่มีรายได้</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick navigation menu */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {!isDriver && (
            <>
              <MenuRow
                href="/app/profile/edit"
                icon={<UserCog className="h-4 w-4" />}
                label="ข้อมูลส่วนตัว"
              />
              <MenuRow href="/app/my-jobs" icon={<Package className="h-4 w-4" />} label="งานของฉัน" />
            </>
          )}
          {isDriver && (
            <>
              <MenuRow
                href="/app/active"
                icon={<FileText className="h-4 w-4" />}
                label="งานที่รับไว้ · พิมพ์ใบงาน"
              />
              <MenuRow href="/app/jobs" icon={<Truck className="h-4 w-4" />} label="หางานใหม่" />
            </>
          )}
          <MenuRow href="/app/notifications" icon={<Bell className="h-4 w-4" />} label="การแจ้งเตือน" />
          {!isDriver && (
            <MenuRow
              href="/app/referral"
              icon={<Gift className="h-4 w-4" />}
              label="แนะนำเพื่อน รับส่วนลด"
            />
          )}
        </CardContent>
      </Card>

      {/* Support contact */}
      {config.data &&
        (config.data.supportPhone || config.data.supportLineId || config.data.supportEmail) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">ติดต่อทีมงาน</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {config.data.supportPhone && (
                <a
                  href={`tel:${config.data.supportPhone}`}
                  className="flex items-center gap-3 text-sm"
                >
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{config.data.supportPhone}</span>
                </a>
              )}
              {config.data.supportLineId && (
                <div className="flex items-center gap-3 text-sm">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{config.data.supportLineId}</span>
                </div>
              )}
              {config.data.supportEmail && (
                <a
                  href={`mailto:${config.data.supportEmail}`}
                  className="flex items-center gap-3 text-sm"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{config.data.supportEmail}</span>
                </a>
              )}
            </CardContent>
          </Card>
        )}

      {/* Info & legal */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <MenuRow href="/faq" icon={<HelpCircle className="h-4 w-4" />} label="คำถามที่พบบ่อย" />
          <MenuRow href="/terms" icon={<FileText className="h-4 w-4" />} label="ข้อกำหนดการใช้งาน" />
          <MenuRow
            href="/privacy"
            icon={<Shield className="h-4 w-4" />}
            label="นโยบายความเป็นส่วนตัว"
          />
        </CardContent>
      </Card>

      {/* Driver: complete / edit the application admin created */}
      {isDriver && (
        <Button asChild variant="outline" className="w-full">
          <Link href="/app/driver/edit">แก้ไขข้อมูลคนขับ</Link>
        </Button>
      )}

      {/* Non-driver: apply to become a driver (self-signup), or claim an invite code */}
      {!me.isDriver && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium">เป็นคนขับกับเรา?</p>
            <p className="text-sm text-muted-foreground">
              สมัครเป็นคนขับเพื่อเริ่มรับงานขนย้ายในพื้นที่ของคุณ
            </p>
            <Button asChild className="w-full">
              <Link href="/app/driver/apply">สมัครเป็นคนขับ</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/app/driver/claim">มีโค้ดเชิญจากแอดมิน?</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Button variant="ghost" className="w-full text-destructive" onClick={() => logout.mutate()}>
        ออกจากระบบ
      </Button>
    </div>
  );
}

// A tappable settings-style row; stacks with a divider between siblings.
function MenuRow({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0 hover:bg-muted/40"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
