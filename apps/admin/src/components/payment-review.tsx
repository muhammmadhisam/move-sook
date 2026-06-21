'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PreviewableImage,
} from '@movesook/ui';
import type { DriverDto, JobDto } from '@movesook/shared';
import { api } from '@/lib/api';
import { useVehicleLabels } from '@/hooks/use-vehicle-labels';

const baht = (n: number) => `฿${n.toLocaleString()}`;

/** Minimal job shape needed to review a customer's up-front payment slip. */
type PayJob = Pick<
  JobDto,
  | 'id'
  | 'status'
  | 'priceQuoted'
  | 'paymentMethod'
  | 'codCommissionFee'
  | 'paymentSlipUrl'
  | 'paymentSlipUploadedAt'
  | 'paymentApprovedAt'
  | 'paymentRejectedReason'
>;

/**
 * Admin review of a customer's transfer slip. Approving a PENDING_PAYMENT job
 * publishes it to drivers; rejecting bounces the slip back for re-upload.
 */
export function PaymentReview({
  job,
  onChanged,
}: {
  job: PayJob;
  onChanged: () => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reason, setReason] = useState('');
  // Whether to also push a "payment confirmed" message to the customer's LINE.
  // The in-app notification is always written regardless of this toggle.
  const [notifyLine, setNotifyLine] = useState(true);
  // Whether to fan the new-job alert out to nearby drivers (in-app + LINE) on
  // publish. Defaults OFF so the admin opts in to pushing the alert; the job is
  // still POSTED and visible in the driver feed regardless. Only applies to the
  // "approve & publish" path.
  const [broadcast, setBroadcast] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { vehicleLabelOf } = useVehicleLabels();

  const approve = useMutation({
    mutationFn: async () => {
      const res = await api.admin.jobs[':id'].payment.approve.$post({
        param: { id: job.id },
        json: { notifyLine, broadcast },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'อนุมัติไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      setErr(null);
      onChanged();
    },
    onError: (e: Error) => setErr(e.message),
  });

  // Available drivers for one-step assignment — only fetched while the picker is open.
  const drivers = useQuery({
    queryKey: ['admin', 'assignable-drivers', job.id],
    enabled: assignOpen,
    queryFn: async (): Promise<DriverDto[]> => {
      const res = await api.admin.jobs[':id']['assignable-drivers'].$get({
        param: { id: job.id },
      });
      if (!res.ok) throw new Error('โหลดรายชื่อคนขับไม่สำเร็จ');
      const body = (await res.json()) as { items: DriverDto[] };
      return body.items;
    },
  });

  const approveAssign = useMutation({
    mutationFn: async (driverId: string) => {
      const res = await api.admin.jobs[':id'].payment['approve-assign'].$post({
        param: { id: job.id },
        json: { driverId, notifyLine },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'มอบหมายไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      setErr(null);
      setAssignOpen(false);
      onChanged();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const reject = useMutation({
    mutationFn: async () => {
      const res = await api.admin.jobs[':id'].payment.reject.$post({
        param: { id: job.id },
        json: { reason: reason.trim() || undefined },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ปฏิเสธไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      setErr(null);
      setRejectOpen(false);
      setReason('');
      onChanged();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const pending = job.status === 'PENDING_PAYMENT';
  const isCod = job.paymentMethod === 'COD';
  // COD: the customer only transfers the commission ("ค่าธรรมเนียม"); the rest is cash to
  // the driver at the destination. PREPAID: they transfer the full quoted amount.
  const payAmount = isCod ? job.codCommissionFee : job.priceQuoted;

  return (
    <div className="space-y-3">
      {isCod && (
        <p className="rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning">
          งานเก็บเงินปลายทาง (COD) — ลูกค้าโอนเฉพาะค่าธรรมเนียม ส่วนที่เหลือจ่ายเงินสดให้คนขับที่ปลายทาง
        </p>
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {isCod ? 'ค่าธรรมเนียม (ค่าคอม) ที่ลูกค้าโอน' : 'ยอดที่ต้องชำระ'}
        </span>
        <span className="font-semibold">
          {payAmount != null ? baht(payAmount) : 'ยังไม่กำหนดราคา'}
        </span>
      </div>

      {job.paymentSlipUrl ? (
        <PreviewableImage
          src={job.paymentSlipUrl}
          alt="สลิปการโอนของลูกค้า"
          className="max-h-80 w-full rounded-lg border object-contain"
        />
      ) : (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          {pending ? 'รอลูกค้าอัปโหลดสลิปการโอน' : 'ไม่มีสลิปการโอน'}
        </p>
      )}

      {job.paymentSlipUploadedAt && (
        <p className="text-xs text-muted-foreground">
          ลูกค้าส่งสลิปเมื่อ {new Date(job.paymentSlipUploadedAt).toLocaleString('th-TH')}
        </p>
      )}
      {job.paymentRejectedReason && pending && (
        <p className="text-xs text-destructive">ตีกลับครั้งล่าสุด: {job.paymentRejectedReason}</p>
      )}
      {job.paymentApprovedAt && (
        <p className="text-xs font-medium text-emerald-600">
          ✓ อนุมัติแล้วเมื่อ {new Date(job.paymentApprovedAt).toLocaleString('th-TH')}
        </p>
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}

      {pending && (
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2 text-sm">
            <Checkbox checked={notifyLine} onCheckedChange={setNotifyLine} />
            <span>ส่งข้อความแจ้งลูกค้าทาง LINE</span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/40 px-2.5 py-2 text-sm">
            <Checkbox checked={broadcast} onCheckedChange={setBroadcast} className="mt-0.5" />
            <span>
              บอร์ดแคสต์แจ้งคนขับในพื้นที่
              <span className="block text-xs text-muted-foreground">
                เฉพาะตอน “อนุมัติ &amp; เผยแพร่” · ถ้าไม่ติ๊ก งานยังขึ้นในฟีดคนขับแต่ไม่ยิงแจ้งเตือน
              </span>
            </span>
          </label>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!job.paymentSlipUrl || approve.isPending}
              onClick={() => approve.mutate()}
            >
              {approve.isPending ? 'กำลังอนุมัติ…' : 'อนุมัติ & เผยแพร่'}
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={!job.paymentSlipUrl || reject.isPending}
              onClick={() => setRejectOpen(true)}
            >
              ไม่อนุมัติ
            </Button>
          </div>
          <Button
            variant="secondary"
            className="w-full"
            disabled={!job.paymentSlipUrl}
            onClick={() => {
              setErr(null);
              setAssignOpen(true);
            }}
          >
            อนุมัติ & มอบหมายคนขับ
          </Button>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ตีกลับสลิปให้ลูกค้าอัปใหม่</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reject-reason">เหตุผล (ไม่บังคับ — ลูกค้าจะเห็น)</Label>
            <Input
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ยอดเงินไม่ตรง / สลิปไม่ชัด"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={reject.isPending}
              onClick={() => reject.mutate()}
            >
              {reject.isPending ? 'กำลังส่ง…' : 'ยืนยันตีกลับ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>อนุมัติ & มอบหมายคนขับ</DialogTitle>
            <DialogDescription>
              เลือกคนขับที่จะมอบหมายงานนี้ — คนขับที่อนุมัติแล้วทั้งหมด
              (คนที่ตรงประเภทรถ ว่างรับงาน และตรงจังหวัดต้นทางจะอยู่ด้านบน)
            </DialogDescription>
          </DialogHeader>

          {err && <p className="text-xs text-destructive">{err}</p>}

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {drivers.isLoading && (
              <p className="py-6 text-center text-sm text-muted-foreground">กำลังโหลดคนขับ…</p>
            )}
            {drivers.isError && (
              <p className="py-6 text-center text-sm text-destructive">โหลดรายชื่อคนขับไม่สำเร็จ</p>
            )}
            {!drivers.isLoading && !drivers.isError && (drivers.data?.length ?? 0) === 0 && (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                ยังไม่มีคนขับที่อนุมัติแล้วในระบบ
              </p>
            )}
            {drivers.data?.map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={approveAssign.isPending}
                onClick={() => approveAssign.mutate(d.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {d.displayName ||
                      [d.firstName, d.lastName].filter(Boolean).join(' ') ||
                      'ไม่ระบุชื่อ'}
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        d.isAvailable
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {d.isAvailable ? 'ว่างรับงาน' : 'ไม่ว่าง'}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.serviceProvince ?? '—'}
                    {` · ${vehicleLabelOf(d.vehicleType)}`}
                    {d.plateNumber ? ` · ${d.plateNumber}` : ''}
                    {' · ★ '}
                    {d.ratingAvg.toFixed(1)} ({d.ratingCount})
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-primary">
                  {approveAssign.isPending && approveAssign.variables === d.id
                    ? 'กำลังมอบหมาย…'
                    : 'มอบหมาย'}
                </span>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              ยกเลิก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
