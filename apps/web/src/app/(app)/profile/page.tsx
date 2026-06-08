'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@movesook/ui';
import type { DriverEarningsResponse, DriverVerifyStatus } from '@movesook/shared';
import { useAuth } from '@/hooks/use-auth';
import { AvailabilityToggle } from '@/components/availability-toggle';
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
  const isDriver = me?.role === 'DRIVER';

  const earnings = useQuery({
    queryKey: ['earnings'],
    enabled: isDriver,
    queryFn: async (): Promise<DriverEarningsResponse> => {
      const res = await api.drivers.me.earnings.$get();
      if (!res.ok) throw new Error('โหลดรายได้ไม่สำเร็จ');
      return (await res.json()) as DriverEarningsResponse;
    },
  });

  if (isLoading || !me) {
    return <div className="mx-auto max-w-md p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;
  }

  const banner = me.verifyStatus ? STATUS_BANNER[me.verifyStatus] : null;

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

      {/* Driver: complete / edit the application admin created */}
      {isDriver && (
        <Button asChild variant="outline" className="w-full">
          <Link href="/driver/edit">แก้ไขข้อมูลคนขับ</Link>
        </Button>
      )}

      {/* Non-driver: claim an admin-issued invite code to become a driver */}
      {!me.isDriver && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium">เป็นคนขับกับเรา?</p>
            <p className="text-sm text-muted-foreground">
              หากแอดมินสร้างใบสมัครให้แล้ว กรอกโค้ดเชิญเพื่อเริ่มใช้งาน
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/driver/claim">กรอกโค้ดเชิญคนขับ</Link>
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
