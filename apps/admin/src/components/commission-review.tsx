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

/** Minimal job shape needed to review a driver's COD commission slip. */
type CodJob = Pick<
  JobDto,
  | 'id'
  | 'status'
  | 'paymentMethod'
  | 'codCommissionFee'
  | 'codCommissionSlipUrl'
  | 'codCommissionSlipUploadedAt'
  | 'codCommissionApprovedAt'
  | 'codCommissionRejectedReason'
>;

/**
 * Admin review of a driver's COD commission ("ค่าธรรมเนียม") slip. Approving records
 * the commission as collected (PAID, no payout) and unlocks pickup; rejecting bounces
 * the slip back for re-upload while the job stays at ACCEPTED.
 */
export function CommissionReview({ job, onChanged }: { job: CodJob; onChanged: () => void }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: async () => {
      const res = await api.admin.jobs[':id'].commission.approve.$post({ param: { id: job.id } });
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
      const res = await api.admin.jobs[':id'].commission.reject.$post({
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

  if (job.paymentMethod !== 'COD') return null;

  // Awaiting the driver to pay/approval: only while ACCEPTED and not yet approved.
  const reviewable = job.status === 'ACCEPTED' && !job.codCommissionApprovedAt;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">ค่าธรรมเนียม (ค่าคอม) ที่คนขับต้องโอน</span>
        <span className="font-semibold">
          {job.codCommissionFee != null ? baht(job.codCommissionFee) : 'ยังไม่กำหนด'}
        </span>
      </div>

      {job.codCommissionSlipUrl ? (
        <PreviewableImage
          src={job.codCommissionSlipUrl}
          alt="สลิปค่าธรรมเนียมของคนขับ"
          className="max-h-80 w-full rounded-lg border object-contain"
        />
      ) : (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          {reviewable ? 'รอคนขับอัปโหลดสลิปค่าธรรมเนียม' : 'ไม่มีสลิปค่าธรรมเนียม'}
        </p>
      )}

      {job.codCommissionSlipUploadedAt && (
        <p className="text-xs text-muted-foreground">
          คนขับส่งสลิปเมื่อ {new Date(job.codCommissionSlipUploadedAt).toLocaleString('th-TH')}
        </p>
      )}
      {job.codCommissionRejectedReason && reviewable && (
        <p className="text-xs text-destructive">ตีกลับครั้งล่าสุด: {job.codCommissionRejectedReason}</p>
      )}
      {job.codCommissionApprovedAt && (
        <p className="text-xs font-medium text-emerald-600">
          ✓ อนุมัติค่าธรรมเนียมแล้วเมื่อ {new Date(job.codCommissionApprovedAt).toLocaleString('th-TH')}
        </p>
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}

      {reviewable && (
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={!job.codCommissionSlipUrl || approve.isPending}
            onClick={() => approve.mutate()}
          >
            {approve.isPending ? 'กำลังอนุมัติ…' : 'อนุมัติ & ปลดล็อกเริ่มงาน'}
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={!job.codCommissionSlipUrl || reject.isPending}
            onClick={() => setRejectOpen(true)}
          >
            ไม่อนุมัติ
          </Button>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ตีกลับสลิปให้คนขับอัปใหม่</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="commission-reject-reason">เหตุผล (ไม่บังคับ — คนขับจะเห็น)</Label>
            <Input
              id="commission-reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ยอดเงินไม่ตรง / สลิปไม่ชัด"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="destructive" disabled={reject.isPending} onClick={() => reject.mutate()}>
              {reject.isPending ? 'กำลังส่ง…' : 'ยืนยันตีกลับ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
