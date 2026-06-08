'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@movesook/ui';
import type { RetentionResponse } from '@movesook/shared';
import { api } from '@/lib/api';
import { LineChart } from '@/components/charts';

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</CardContent>
    </Card>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function RetentionPage() {
  const ret = useQuery({
    queryKey: ['admin', 'analytics', 'retention'],
    queryFn: async (): Promise<RetentionResponse> => {
      const res = await api.admin.analytics.retention.$get();
      if (!res.ok) throw new Error('โหลดข้อมูล retention ไม่สำเร็จ');
      return (await res.json()) as RetentionResponse;
    },
  });

  const data = ret.data;
  const labels = data?.monthly.map((m) => m.month) ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">การกลับมาใช้ซ้ำ (Retention)</h1>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="อัตราลูกค้าใช้ซ้ำ"
          value={data ? pct(data.customers.repeatRate) : '—'}
          hint={data ? `${data.customers.repeat}/${data.customers.withDelivered} คน มีงาน ≥2` : undefined}
        />
        <Stat label="ลูกค้าที่จบงานแล้ว" value={data?.customers.withDelivered ?? '—'} />
        <Stat
          label="คนขับคงอยู่ (MoM)"
          value={data ? pct(data.drivers.retentionRate) : '—'}
          hint={data ? `${data.drivers.retained}/${data.drivers.activeLastMonth} คน` : undefined}
        />
        <Stat
          label="คนขับ active เดือนนี้"
          value={data?.drivers.activeThisMonth ?? '—'}
          hint={data ? `เดือนก่อน ${data.drivers.activeLastMonth} คน` : undefined}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ลูกค้า active vs ลูกค้าที่กลับมาใช้ซ้ำ (ราย เดือน)</CardTitle>
        </CardHeader>
        <CardContent>
          {labels.length > 0 ? (
            <LineChart
              labels={labels}
              lines={[
                {
                  name: 'ลูกค้า active',
                  color: 'hsl(var(--primary))',
                  points: data!.monthly.map((m) => m.activeCustomers),
                },
                {
                  name: 'กลับมาใช้ซ้ำ',
                  color: '#16a34a',
                  points: data!.monthly.map((m) => m.repeatCustomers),
                },
              ]}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลเพียงพอ</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
