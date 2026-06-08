'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@movesook/ui';
import {
  VEHICLE_TYPE_LABEL,
  type ReportSummaryResponse,
  type ReportExportType,
  type VehicleType,
} from '@movesook/shared';
import { api } from '@/lib/api';

const baht = (n: number) => `฿${n.toLocaleString()}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Default range: trailing 30 days (today inclusive). */
function defaultRange() {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 29);
  return { from: fmt(from), to: fmt(to) };
}

export default function ReportsPage() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  // Applied range (drives the query); separate from the input drafts so editing
  // a date doesn't refetch until "ใช้ช่วงนี้" is clicked.
  const [range, setRange] = useState(initial);
  const [downloading, setDownloading] = useState<ReportExportType | null>(null);

  const report = useQuery({
    queryKey: ['admin', 'reports', range.from, range.to],
    queryFn: async (): Promise<ReportSummaryResponse> => {
      const res = await api.admin.reports.summary.$get({
        query: { from: range.from, to: range.to },
      });
      if (!res.ok) throw new Error('โหลดรายงานไม่สำเร็จ');
      return (await res.json()) as ReportSummaryResponse;
    },
  });

  const data = report.data;

  const exportCsv = async (type: ReportExportType) => {
    setDownloading(type);
    try {
      const res = await api.admin.reports.export.$get({
        query: { type, from: range.from, to: range.to },
      });
      if (!res.ok) throw new Error('ดาวน์โหลดไม่สำเร็จ');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `movesook-${type}-${range.from}_${range.to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  const exports: { type: ReportExportType; label: string }[] = [
    { type: 'transactions', label: 'ธุรกรรม (คอมมิชชั่น)' },
    { type: 'jobs', label: 'งานขนส่ง' },
    { type: 'drivers', label: 'คนขับ' },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">รายงาน</h1>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ตั้งแต่
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ถึง
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </label>
          <Button onClick={() => setRange({ from, to })}>ใช้ช่วงนี้</Button>
        </div>
      </div>

      {report.isError ? (
        <p className="text-sm text-destructive">โหลดรายงานไม่สำเร็จ</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            ช่วงรายงาน {data.range.from} ถึง {data.range.to}
          </p>

          {/* Financial KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="มูลค่างานรวม (GMV)" value={baht(data.financial.gmv)} />
            <Kpi label="รายได้คอมมิชชั่น" value={baht(data.financial.commissionRevenue)} />
            <Kpi label="จ่ายคนขับ" value={baht(data.financial.netToDrivers)} />
            <Kpi label="ค่าเฉลี่ยต่องาน" value={baht(data.financial.avgTicket)} />
          </div>

          {/* Operational KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="งานที่สร้าง" value={data.jobs.created.toLocaleString()} />
            <Kpi label="ส่งสำเร็จ" value={data.jobs.delivered.toLocaleString()} />
            <Kpi label="ยกเลิก" value={data.jobs.cancelled.toLocaleString()} />
            <Kpi label="อัตราสำเร็จ" value={pct(data.jobs.completionRate)} />
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="คนขับใหม่" value={data.growth.newDrivers.toLocaleString()} />
            <Kpi label="ลูกค้าใหม่" value={data.growth.newCustomers.toLocaleString()} />
            <Kpi label="จำนวนธุรกรรม" value={data.financial.transactions.toLocaleString()} />
          </div>

          {/* Export */}
          <Card>
            <CardHeader>
              <CardTitle>ดาวน์โหลด CSV</CardTitle>
              <CardDescription>ข้อมูลในช่วงรายงานที่เลือก (เปิดด้วย Excel ได้)</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {exports.map((e) => (
                <Button
                  key={e.type}
                  variant="outline"
                  disabled={downloading !== null}
                  onClick={() => exportCsv(e.type)}
                >
                  <Download className="h-4 w-4" />
                  {downloading === e.type ? 'กำลังดาวน์โหลด…' : e.label}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* Breakdowns */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <BreakdownCard
              title="แยกตามจังหวัดต้นทาง"
              keyHeader="จังหวัด"
              rows={data.byProvince}
              labelOf={(k) => k}
            />
            <BreakdownCard
              title="แยกตามประเภทรถ"
              keyHeader="ประเภทรถ"
              rows={data.byVehicleType}
              labelOf={(k) => VEHICLE_TYPE_LABEL[k as VehicleType] ?? k}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent />
    </Card>
  );
}

function BreakdownCard({
  title,
  keyHeader,
  rows,
  labelOf,
}: {
  title: string;
  keyHeader: string;
  rows: ReportSummaryResponse['byProvince'];
  labelOf: (key: string) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลในช่วงนี้</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{keyHeader}</TableHead>
                <TableHead className="text-right">งาน</TableHead>
                <TableHead className="text-right">GMV</TableHead>
                <TableHead className="text-right">คอมมิชชั่น</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{labelOf(r.key)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.jobs.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{baht(r.gmv)}</TableCell>
                  <TableCell className="text-right tabular-nums">{baht(r.commission)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
