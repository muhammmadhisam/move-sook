'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  cn,
} from '@movesook/ui';
import { api } from '@/lib/api';

// One review per delivered job, by the job's customer (enforced by the API).
export function ReviewDialog({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [open, setOpen] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const res = await api.jobs[':id'].review.$post({
        param: { id: jobId },
        json: { rating, comment: comment || undefined },
      });
      if (!res.ok) throw new Error('ให้คะแนนไม่สำเร็จ (อาจรีวิวไปแล้ว)');
      return res.json();
    },
    onSuccess: () => {
      toast.success('ขอบคุณสำหรับคะแนน');
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Star className="mr-1.5 h-4 w-4" />
          ให้คะแนนคนขับ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ให้คะแนนการขนย้ายครั้งนี้</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center gap-2 py-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} ดาว`}
              className="transition-transform active:scale-110"
            >
              <Star
                className={cn(
                  'h-9 w-9',
                  n <= rating
                    ? 'fill-warning text-warning'
                    : 'fill-muted text-muted-foreground/30',
                )}
              />
            </button>
          ))}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="comment">ความเห็น (ไม่บังคับ)</Label>
          <Input
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="เช่น ขับดี ตรงเวลา ระวังของ"
          />
        </div>
        <Button disabled={submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending ? 'กำลังส่ง…' : 'ส่งคะแนน'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
