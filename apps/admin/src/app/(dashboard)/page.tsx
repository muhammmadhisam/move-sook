'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@movesook/ui';
import type { AdminAnalyticsResponse, JobStatus } from '@movesook/shared';
import { useAdminSession } from '@/hooks/use-admin-session';
import { api } from '@/lib/api';
import { BarChart, LineChart } from '@/components/charts';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent />
    </Card>
  );
}

const STATUS_LABEL: Record<JobStatus, string> = {
  DRAFT: 'ร่าง',
  PENDING_PAYMENT: 'รอชำระเงิน',
  POSTED: 'เปิดรับ',
  ACCEPTED: 'รับแล้ว',
  PICKED_UP: 'รับของ',
  IN_TRANSIT: 'ขนส่ง',
  PENDING_CONFIRMATION: 'รอยืนยัน',
  DELIVERED: 'สำเร็จ',
  CANCELLED: 'ยกเลิก',
};
const STATUS_ORDER: JobStatus[] = [
  'PENDING_PAYMENT',
  'POSTED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'PENDING_CONFIRMATION',
  'DELIVERED',
  'CANCELLED',
];

export default function DashboardPage() {
  const { data, isLoading } = useAdminSession();

  const analytics = useQuery({
    queryKey: ['admin', 'analytics', '14'],
    queryFn: async (): Promise<AdminAnalyticsResponse> => {
      const res = await api.admin.analytics.$get({ query: { days: '14' } });
      if (!res.ok) throw new Error('โหลดข้อมูลกราฟไม่สำเร็จ');
      return (await res.json()) as AdminAnalyticsResponse;
    },
  });

  const series = analytics.data?.series ?? [];
  const labels = series.map((p) => p.date.slice(5)); // MM-DD

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">แดชบอร์ด</h1>
      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="งานวันนี้" value={data.jobsToday} />
            <Stat label="งานเปิดรับ" value={data.openJobs} />
            <Stat label="คนขับรออนุมัติ" value={data.pendingDrivers} />
            <Stat label="Fill rate" value={`${Math.round(data.fillRate * 100)}%`} />
            <Stat label="รายได้คอมมิชชั่น (บาท)" value={data.commissionRevenue.toLocaleString()} />
            <Stat label="กำลังขนส่ง" value={data.jobsByStatus.IN_TRANSIT ?? 0} />
            <Stat label="ส่งสำเร็จ" value={data.jobsByStatus.DELIVERED ?? 0} />
            <Stat label="ยกเลิก" value={data.jobsByStatus.CANCELLED ?? 0} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>แนวโน้มงาน (14 วัน)</CardTitle>
                <CardDescription>งานที่สร้าง เทียบกับ ส่งสำเร็จ ต่อวัน</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.data ? (
                  <LineChart
                    labels={labels}
                    lines={[
                      {
                        name: 'สร้าง',
                        color: 'hsl(var(--primary))',
                        points: series.map((p) => p.jobsCreated),
                      },
                      {
                        name: 'ส่งสำเร็จ',
                        color: '#16a34a',
                        points: series.map((p) => p.jobsDelivered),
                      },
                    ]}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>รายได้คอมมิชชั่น (14 วัน)</CardTitle>
                <CardDescription>บาทต่อวัน</CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.data ? (
                  <LineChart
                    labels={labels}
                    lines={[
                      {
                        name: 'รายได้',
                        color: '#7c3aed',
                        points: series.map((p) => p.revenue),
                      },
                    ]}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>งานแยกตามสถานะ</CardTitle>
              <CardDescription>จำนวนงานสะสมในแต่ละสถานะ</CardDescription>
            </CardHeader>
            <CardContent>
              <BarChart
                data={STATUS_ORDER.map((s) => ({
                  label: STATUS_LABEL[s],
                  value: data.jobsByStatus[s] ?? 0,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
