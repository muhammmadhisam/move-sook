'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movesook/ui';
import type { AdminAnalyticsResponse } from '@movesook/shared';
import { api } from '@/lib/api';
import { BarChart, LineChart } from '@/components/charts';

const baht = (n: number) => `฿${n.toLocaleString()}`;

export default function AnalyticsPage() {
  const [days, setDays] = useState('30');

  const analytics = useQuery({
    queryKey: ['admin', 'analytics', days],
    queryFn: async (): Promise<AdminAnalyticsResponse> => {
      const res = await api.admin.analytics.$get({ query: { days } });
      if (!res.ok) throw new Error('โหลดข้อมูลวิเคราะห์ไม่สำเร็จ');
      return (await res.json()) as AdminAnalyticsResponse;
    },
  });

  const data = analytics.data;
  const labels = data ? data.series.map((p) => p.date.slice(5)) : [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">วิเคราะห์</h1>
        <div className="w-40">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 วัน</SelectItem>
              <SelectItem value="30">30 วัน</SelectItem>
              <SelectItem value="90">90 วัน</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {!data ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>คนขับใหม่</CardDescription>
                <CardTitle className="text-3xl">{data.newDrivers}</CardTitle>
              </CardHeader>
              <CardContent />
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>ลูกค้าใหม่</CardDescription>
                <CardTitle className="text-3xl">{data.newCustomers}</CardTitle>
              </CardHeader>
              <CardContent />
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>งานส่งสำเร็จ</CardDescription>
                <CardTitle className="text-3xl">{data.funnel.delivered}</CardTitle>
              </CardHeader>
              <CardContent />
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>รายได้คอมรวม</CardDescription>
                <CardTitle className="text-2xl">
                  {baht(data.series.reduce((n, p) => n + p.revenue, 0))}
                </CardTitle>
              </CardHeader>
              <CardContent />
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>แนวโน้มงานต่อวัน</CardTitle>
              <CardDescription>สร้าง / ส่งสำเร็จ / ยกเลิก</CardDescription>
            </CardHeader>
            <CardContent>
              <LineChart
                labels={labels}
                height={260}
                lines={[
                  { name: 'สร้าง', color: 'hsl(var(--primary))', points: data.series.map((p) => p.jobsCreated) },
                  { name: 'ส่งสำเร็จ', color: '#16a34a', points: data.series.map((p) => p.jobsDelivered) },
                  { name: 'ยกเลิก', color: '#dc2626', points: data.series.map((p) => p.jobsCancelled) },
                ]}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>รายได้คอมต่อวัน (บาท)</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart
                  labels={labels}
                  lines={[
                    { name: 'รายได้', color: '#7c3aed', points: data.series.map((p) => p.revenue) },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Funnel</CardTitle>
                <CardDescription>โพสต์ → รับงาน → ส่งสำเร็จ</CardDescription>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={[
                    { label: 'โพสต์', value: data.funnel.posted },
                    { label: 'รับงาน', value: data.funnel.accepted },
                    { label: 'สำเร็จ', value: data.funnel.delivered },
                    { label: 'ยกเลิก', value: data.funnel.cancelled },
                  ]}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>คนขับทำรายได้สูงสุด</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.topDrivers.map((d, i) => (
                <div key={d.driverId} className="flex items-center justify-between">
                  <span>
                    {i + 1}. {d.name ?? '—'}{' '}
                    <span className="text-muted-foreground">
                      ({d.delivered} งาน · ★{d.ratingAvg.toFixed(1)})
                    </span>
                  </span>
                  <span className="tabular-nums">{baht(d.earnings)}</span>
                </div>
              ))}
              {data.topDrivers.length === 0 && <p className="text-muted-foreground">ยังไม่มีข้อมูล</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
