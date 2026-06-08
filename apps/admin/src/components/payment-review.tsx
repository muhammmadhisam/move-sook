'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
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
import { api } from '@/lib/api';

const baht = (n: number) => `฿${n.toLocaleString()}`;

/** Minimal job shape needed to review a customer's up-front payment slip. */
type PayJob = Pick<
  JobDto,
  | 'id'
  | 'status'
  | 'priceQuoted'
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
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: async () => {
      const res = await api.admin.jobs[':id'].payment.approve.$post({ param: { id: job.id } });
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">ยอดที่ต้องชำระ</span>
        <span className="font-semibold">
          {job.priceQuoted != null ? baht(job.priceQuoted) : 'ยังไม่กำหนดราคา'}
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
    </div>
  );
}
