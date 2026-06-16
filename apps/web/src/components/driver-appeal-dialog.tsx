'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  Textarea,
} from '@movesook/ui';
import { DriverAppealInput } from '@movesook/shared';
import { api } from '@/lib/api';

// Lets a REJECTED / SUSPENDED driver appeal the decision with a message to admins.
// `rejected` tweaks the copy (a rejected appeal re-enters review; a suspended one
// only notifies the team).
export function DriverAppealDialog({
  rejected,
  className,
}: {
  rejected: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const appeal = useMutation({
    mutationFn: async () => {
      const parsed = DriverAppealInput.safeParse({ message });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'กรุณากรอกข้อความ');
      const res = await api.drivers.me.appeal.$post({ json: parsed.data });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ส่งคำอุทธรณ์ไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: async () => {
      toast.success('ส่งคำอุทธรณ์แล้ว — ทีมงานจะตรวจสอบอีกครั้ง');
      setOpen(false);
      setMessage('');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      await queryClient.invalidateQueries({ queryKey: ['driver-me'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={className}>ยื่นอุทธรณ์</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยื่นอุทธรณ์การพิจารณา</DialogTitle>
          <DialogDescription>
            {rejected
              ? 'อธิบายข้อมูลเพิ่มเติมหรือสิ่งที่แก้ไขแล้ว ใบสมัครของคุณจะกลับเข้าสู่การตรวจสอบอีกครั้ง'
              : 'อธิบายเหตุผลที่ขอให้ทบทวนการระงับบัญชี ทีมงานจะพิจารณาและติดต่อกลับ'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="appealMessage">ข้อความถึงทีมงาน</Label>
          <Textarea
            id="appealMessage"
            rows={4}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setError(null);
            }}
            placeholder="เช่น ได้แก้ไขรูปใบขับขี่ให้ชัดเจนแล้ว / ขอชี้แจงเพิ่มเติมว่า…"
            maxLength={1000}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <Button
          disabled={appeal.isPending || message.trim() === ''}
          onClick={() => appeal.mutate()}
        >
          {appeal.isPending ? 'กำลังส่ง…' : 'ส่งคำอุทธรณ์'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
