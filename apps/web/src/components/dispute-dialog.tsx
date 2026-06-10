'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@movesook/ui';
import {
  DisputeReasonSchema,
  DISPUTE_REASON_LABEL,
  type DisputeReason,
} from '@movesook/shared';
import { api } from '@/lib/api';

/** "แจ้งปัญหา" — lets the customer or assigned driver raise a dispute on a job. */
export function DisputeDialog({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason>('ITEM_DAMAGED');
  const [detail, setDetail] = useState('');

  const submit = useMutation({
    mutationFn: async () => {
      const res = await api.jobs[':id'].dispute.$post({
        param: { id: jobId },
        json: { reason, ...(detail.trim() ? { detail: detail.trim() } : {}) },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'แจ้งปัญหาไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('แจ้งปัญหาแล้ว ทีมงานจะตรวจสอบโดยเร็ว');
      setOpen(false);
      setDetail('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="outline" className="w-full text-destructive" onClick={() => setOpen(true)}>
        <AlertTriangle className="mr-1.5 h-4 w-4" />
        แจ้งปัญหา
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แจ้งปัญหางานนี้</DialogTitle>
            <DialogDescription>เลือกหัวข้อปัญหาและอธิบายเพิ่มเติม ทีมงานจะติดต่อกลับ</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>หัวข้อปัญหา</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as DisputeReason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DisputeReasonSchema.options.map((r) => (
                    <SelectItem key={r} value={r}>
                      {DISPUTE_REASON_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dispute-detail">รายละเอียด (ถ้ามี)</Label>
              <Textarea
                id="dispute-detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="เล่าสิ่งที่เกิดขึ้น…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submit.isPending}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? 'กำลังส่ง…' : 'ส่งเรื่อง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
