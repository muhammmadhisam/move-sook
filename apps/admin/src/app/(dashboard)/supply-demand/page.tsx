'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@movesook/ui';
import type { SupplyDemandResponse, SupplyDemandGap } from '@movesook/shared';
import { api } from '@/lib/api';
import { BarChart } from '@/components/charts';

const GAP_LABEL: Record<SupplyDemandGap, string> = {
  UNDERSERVED: 'ขาดคนขับ',
  BALANCED: 'สมดุล',
  OVERSUPPLIED: 'คนขับเกิน',
};

const GAP_VARIANT: Record<SupplyDemandGap, 'destructive' | 'secondary' | 'warning'> = {
  UNDERSERVED: 'destructive',
  BALANCED: 'secondary',
  OVERSUPPLIED: 'warning',
};

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

export default function SupplyDemandPage() {
  const sd = useQuery({
    queryKey: ['admin', 'analytics', 'supply-demand'],
    queryFn: async (): Promise<SupplyDemandResponse> => {
      const res = await api.admin.analytics['supply-demand'].$get();
      if (!res.ok) throw new Error('โหลดข้อมูล supply/demand ไม่สำเร็จ');
      return (await res.json()) as SupplyDemandResponse;
    },
    refetchInterval: 60 * 1000,
  });

  const data = sd.data;
  // Top provinces by unmet demand (open jobs) for the at-a-glance bar chart.
  const chartData =
    data?.rows
      .filter((r) => r.openJobs > 0)
      .slice(0, 8)
      .map((r) => ({ label: r.province, value: r.openJobs })) ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Supply / Demand ราย จังหวัด</h1>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="งานเปิดรับทั้งหมด" value={data?.totals.openJobs ?? '—'} />
        <Stat label="คนขับพร้อมรับงาน" value={data?.totals.availableDrivers ?? '—'} />
        <Stat label="จังหวัดที่ขาดคนขับ" value={data?.totals.underserved ?? '—'} />
      </div>

      {chartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">งานเปิดรับสูงสุด (ตาม จังหวัด)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart data={chartData} />
          </CardContent>
        </Card>
      )}

      {data && data.rows.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          ยังไม่มีงานเปิดรับหรือคนขับในระบบ
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>จังหวัด</TableHead>
              <TableHead className="text-right">งานเปิดรับ</TableHead>
              <TableHead className="text-right">คนขับพร้อมรับ</TableHead>
              <TableHead className="text-right">คนขับอนุมัติแล้ว</TableHead>
              <TableHead className="text-right">อัตราส่วน</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.rows.map((r) => (
              <TableRow key={r.province}>
                <TableCell className="font-medium">{r.province}</TableCell>
                <TableCell className="text-right tabular-nums">{r.openJobs}</TableCell>
                <TableCell className="text-right tabular-nums">{r.availableDrivers}</TableCell>
                <TableCell className="text-right tabular-nums">{r.approvedDrivers}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.ratio === null ? '—' : `${r.ratio.toFixed(2)}×`}
                </TableCell>
                <TableCell>
                  <Badge variant={GAP_VARIANT[r.gap]}>{GAP_LABEL[r.gap]}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
