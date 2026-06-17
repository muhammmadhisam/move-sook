'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@movesook/ui';
import { type DriverQueueResponse, type DriverQueueItem } from '@movesook/shared';
import { api } from '@/lib/api';
import { useVehicleLabels } from '@/hooks/use-vehicle-labels';

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

/** Human-friendly wait time: hours up to a day, then days. */
function waitLabel(hours: number): string {
  if (hours < 24) return `${hours} ชม.`;
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours - days * 24);
  return rem > 0 ? `${days} วัน ${rem} ชม.` : `${days} วัน`;
}

export default function DriverQueuePage() {
  const queryClient = useQueryClient();
  const { vehicleLabelOf } = useVehicleLabels();
  const [rejecting, setRejecting] = useState<DriverQueueItem | null>(null);
  const [reason, setReason] = useState('');

  const queue = useQuery({
    queryKey: ['admin', 'drivers', 'queue'],
    queryFn: async (): Promise<DriverQueueResponse> => {
      const res = await api.admin.drivers.queue.$get();
      if (!res.ok) throw new Error('โหลดคิวรอตรวจสอบไม่สำเร็จ');
      return (await res.json()) as DriverQueueResponse;
    },
    // The wait times age in real time — refresh periodically.
    refetchInterval: 60 * 1000,
  });

  const verify = useMutation({
    mutationFn: async (args: { id: string; decision: 'APPROVE' | 'REJECT'; reason?: string }) => {
      const res = await api.admin.drivers[':id'].verify.$post({
        param: { id: args.id },
        json: { decision: args.decision, ...(args.reason ? { reason: args.reason } : {}) },
      });
      if (!res.ok) throw new Error('อัปเดตสถานะไม่สำเร็จ');
      return res.json();
    },
    onSuccess: (_d, args) => {
      toast.success(args.decision === 'APPROVE' ? 'อนุมัติคนขับแล้ว' : 'ปฏิเสธใบสมัครแล้ว');
      setRejecting(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = queue.data;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">คิวรอตรวจสอบคนขับ</h1>
        <Link href="/drivers" className="text-sm text-primary hover:underline">
          ดูคนขับทั้งหมด →
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="รออนุมัติทั้งหมด" value={data?.items.length ?? '—'} />
        <Stat label="เกิน SLA" value={data?.breachedCount ?? '—'} />
        <Stat label="SLA (ชั่วโมง)" value={data?.slaHours ?? '—'} />
      </div>

      {data && data.items.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          ไม่มีใบสมัครที่รอตรวจสอบ 🎉
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ</TableHead>
              <TableHead>เบอร์โทร</TableHead>
              <TableHead>ประเภทรถ</TableHead>
              <TableHead>จังหวัด</TableHead>
              <TableHead>รอมานาน</TableHead>
              <TableHead>KYC</TableHead>
              <TableHead className="text-right">การดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((d) => (
              <TableRow key={d.id} className={d.slaBreached ? 'bg-destructive/5' : undefined}>
                <TableCell>
                  <Link
                    href={`/drivers/${d.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {d.displayName ?? '—'}
                  </Link>
                </TableCell>
                <TableCell>{d.phone ?? '—'}</TableCell>
                <TableCell>{vehicleLabelOf(d.vehicleType)}</TableCell>
                <TableCell>{d.serviceProvince ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={d.slaBreached ? 'destructive' : 'secondary'}>
                    {waitLabel(d.waitingHours)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {d.hasKyc ? (
                    <Badge variant="default">ครบ</Badge>
                  ) : (
                    <Badge variant="warning">ไม่ครบ</Badge>
                  )}
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button
                    size="sm"
                    disabled={verify.isPending}
                    onClick={() => verify.mutate({ id: d.id, decision: 'APPROVE' })}
                  >
                    อนุมัติ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={verify.isPending}
                    onClick={() => {
                      setReason('');
                      setRejecting(d);
                    }}
                  >
                    ปฏิเสธ
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ปฏิเสธใบสมัคร</DialogTitle>
            <DialogDescription>
              {rejecting?.displayName ?? 'คนขับ'} — ระบุเหตุผล (จะแจ้งให้คนขับทราบ)
            </DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น เอกสารไม่ชัดเจน / ข้อมูลรถไม่ครบ"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={verify.isPending || reason.trim().length === 0}
              onClick={() =>
                rejecting &&
                verify.mutate({ id: rejecting.id, decision: 'REJECT', reason: reason.trim() })
              }
            >
              ปฏิเสธ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
