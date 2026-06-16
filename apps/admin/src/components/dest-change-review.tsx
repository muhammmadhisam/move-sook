'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PreviewableImage,
} from '@movesook/ui';
import type { JobDto } from '@movesook/shared';
import { ADDR_CHANGE_STATUS_LABEL } from '@movesook/shared';
import { api } from '@/lib/api';

const baht = (n: number) => `฿${n.toLocaleString()}`;

/** Minimal job shape needed to review a destination-change request. */
type DcJob = Pick<
  JobDto,
  | 'id'
  | 'destAddress'
  | 'destProvince'
  | 'destChangeStatus'
  | 'destChangeNewAddress'
  | 'destChangeNewProvince'
  | 'destChangeReason'
  | 'destChangeFee'
  | 'destChangeExtraKm'
  | 'destChangeRequestedAt'
  | 'destChangeRejectedReason'
  | 'destChangeSlipUrl'
  | 'destChangeSlipUploadedAt'
  | 'destChangeCompletedAt'
>;

/**
 * Admin review of a customer's destination-change request. Two gates:
 * (1) approve/reject the request itself, then (2) approve/reject the fee slip —
 * approving the slip writes the new destination onto the job and notifies the driver.
 */
export function DestChangeReview({ job, onChanged }: { job: DcJob; onChanged: () => void }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectKind, setRejectKind] = useState<'request' | 'payment'>('request');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const status = job.destChangeStatus;

  const approveRequest = useMutation({
    mutationFn: async () => {
      const res = await api.admin.jobs[':id']['dest-change'].approve.$post({ param: { id: job.id } });
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

  const approvePayment = useMutation({
    mutationFn: async () => {
      const res = await api.admin.jobs[':id']['dest-change'].payment.approve.$post({
        param: { id: job.id },
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

  const reject = useMutation({
    mutationFn: async () => {
      const endpoint =
        rejectKind === 'request'
          ? api.admin.jobs[':id']['dest-change'].reject
          : api.admin.jobs[':id']['dest-change'].payment.reject;
      const res = await endpoint.$post({
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

  const openReject = (kind: 'request' | 'payment') => {
    setRejectKind(kind);
    setReason('');
    setRejectOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Badge variant="outline">{ADDR_CHANGE_STATUS_LABEL[status]}</Badge>
        {job.destChangeFee != null && (
          <span className="text-sm font-semibold">ค่าธรรมเนียม {baht(job.destChangeFee)}</span>
        )}
      </div>

      <div className="rounded-lg border p-3 text-sm">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">ปลายทางปัจจุบัน</span>
          <span className="text-right font-medium">
            {job.destAddress} ({job.destProvince})
          </span>
        </div>
        <div className="mt-1 flex justify-between gap-2">
          <span className="text-muted-foreground">ปลายทางใหม่ที่ขอ</span>
          <span className="text-right font-medium">
            {job.destChangeNewAddress}
            {job.destChangeNewProvince ? ` (${job.destChangeNewProvince})` : ''}
          </span>
        </div>
        {job.destChangeExtraKm != null && job.destChangeExtraKm > 0 && (
          <div className="mt-1 flex justify-between gap-2">
            <span className="text-muted-foreground">ระยะทางที่เพิ่ม</span>
            <span className="font-medium">{job.destChangeExtraKm.toFixed(1)} กม.</span>
          </div>
        )}
        {job.destChangeReason && (
          <div className="mt-1 flex justify-between gap-2">
            <span className="text-muted-foreground">เหตุผล</span>
            <span className="text-right">{job.destChangeReason}</span>
          </div>
        )}
        {job.destChangeRequestedAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            ขอเมื่อ {new Date(job.destChangeRequestedAt).toLocaleString('th-TH')}
          </p>
        )}
      </div>

      {job.destChangeRejectedReason && (
        <p className="text-xs text-destructive">ตีกลับครั้งล่าสุด: {job.destChangeRejectedReason}</p>
      )}

      {/* Fee slip (once uploaded) */}
      {job.destChangeSlipUrl && (
        <div className="space-y-1">
          <PreviewableImage
            src={job.destChangeSlipUrl}
            alt="สลิปค่าเปลี่ยนที่อยู่"
            className="max-h-80 w-full rounded-lg border object-contain"
          />
          {job.destChangeSlipUploadedAt && (
            <p className="text-xs text-muted-foreground">
              ลูกค้าส่งสลิปเมื่อ {new Date(job.destChangeSlipUploadedAt).toLocaleString('th-TH')}
            </p>
          )}
        </div>
      )}

      {status === 'COMPLETED' && job.destChangeCompletedAt && (
        <p className="text-xs font-medium text-emerald-600">
          ✓ เปลี่ยนที่อยู่และแจ้งคนขับแล้วเมื่อ{' '}
          {new Date(job.destChangeCompletedAt).toLocaleString('th-TH')}
        </p>
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}

      {status === 'REQUESTED' && (
        <div className="flex gap-2">
          <Button className="flex-1" disabled={approveRequest.isPending} onClick={() => approveRequest.mutate()}>
            {approveRequest.isPending ? 'กำลังอนุมัติ…' : 'อนุมัติคำขอ'}
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => openReject('request')}
          >
            ปฏิเสธคำขอ
          </Button>
        </div>
      )}

      {status === 'APPROVED_AWAITING_PAYMENT' && (
        <p className="rounded-md border border-dashed px-3 py-3 text-center text-sm text-muted-foreground">
          อนุมัติคำขอแล้ว — รอลูกค้าโอนค่าธรรมเนียมและอัปโหลดสลิป
        </p>
      )}

      {status === 'PENDING_REVIEW' && (
        <div className="flex gap-2">
          <Button className="flex-1" disabled={approvePayment.isPending} onClick={() => approvePayment.mutate()}>
            {approvePayment.isPending ? 'กำลังอนุมัติ…' : 'อนุมัติการชำระ & เปลี่ยนที่อยู่'}
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => openReject('payment')}
          >
            ตีกลับสลิป
          </Button>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {rejectKind === 'request' ? 'ปฏิเสธคำขอเปลี่ยนที่อยู่' : 'ตีกลับสลิปให้ลูกค้าอัปใหม่'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="dc-reject-reason">เหตุผล (ไม่บังคับ — ลูกค้าจะเห็น)</Label>
            <Input
              id="dc-reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={rejectKind === 'request' ? 'เช่น ปลายทางอยู่นอกพื้นที่' : 'เช่น ยอดเงินไม่ตรง / สลิปไม่ชัด'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="destructive" disabled={reject.isPending} onClick={() => reject.mutate()}>
              {reject.isPending ? 'กำลังส่ง…' : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
