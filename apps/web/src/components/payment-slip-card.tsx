'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, PreviewableImage } from '@movesook/ui';
import type { JobDto, PublicSystemConfig } from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';

/**
 * Up-front payment step shown for a PENDING_PAYMENT job: the customer transfers
 * the quoted amount, uploads the bank slip, then waits for an admin to approve
 * before the job is published to drivers. Renders nothing for other statuses.
 */
export function PaymentSlipCard({
  job,
  onChanged,
}: {
  job: JobDto;
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const [slipUrl, setSlipUrl] = useState<string | null>(null);

  // Company receiving account + QR to show the customer where to transfer.
  const { data: config } = useQuery({
    queryKey: ['system', 'public'],
    queryFn: async (): Promise<PublicSystemConfig> => {
      const res = await api.system.public.$get();
      if (!res.ok) throw new Error();
      return (await res.json()) as PublicSystemConfig;
    },
    staleTime: 5 * 60 * 1000,
  });

  const submit = useMutation({
    mutationFn: async (url: string) => {
      const res = await api.jobs[':id']['payment-slip'].$post({
        param: { id: job.id },
        json: { slipUrl: url },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ส่งสลิปไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('ส่งสลิปแล้ว รอแอดมินตรวจสอบ');
      setSlipUrl(null);
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
      onChanged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (job.status !== 'PENDING_PAYMENT') return null;

  // Slip already submitted, waiting for admin review.
  const awaitingReview = Boolean(job.paymentSlipUrl);

  return (
    <div className="mx-4 mb-3 rounded-xl border border-warning/40 bg-warning/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">การชำระเงิน</p>
        {job.priceQuoted ? (
          <p className="text-base font-bold text-primary">฿{job.priceQuoted.toLocaleString()}</p>
        ) : (
          <p className="text-xs italic text-muted-foreground">รอแอดมินกำหนดราคา</p>
        )}
      </div>

      {awaitingReview ? (
        <div className="space-y-2">
          {job.paymentSlipUrl && (
            <PreviewableImage
              src={job.paymentSlipUrl}
              alt="สลิปการโอน"
              className="max-h-48 w-full rounded-lg border object-contain"
            />
          )}
          <p className="text-xs text-muted-foreground">
            ✓ ส่งสลิปแล้ว — รอแอดมินตรวจสอบและอนุมัติก่อนเผยแพร่ให้คนขับ
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {job.paymentRejectedReason && (
            <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              สลิปก่อนหน้าไม่ผ่าน: {job.paymentRejectedReason} — กรุณาอัปโหลดใหม่
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            โอนเงินตามยอด แล้วอัปโหลดสลิปเพื่อยืนยันการชำระเงิน
          </p>

          {/* Company receiving account + QR */}
          {config &&
            (config.payAccountNumber || config.payQrUrl) && (
              <div className="rounded-lg border bg-background p-3">
                <p className="mb-2 text-xs font-semibold">โอนเข้าบัญชี</p>
                {config.payBankName && (
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">ธนาคาร</span>
                    <span className="font-medium">{config.payBankName}</span>
                  </div>
                )}
                {config.payAccountName && (
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">ชื่อบัญชี</span>
                    <span className="font-medium">{config.payAccountName}</span>
                  </div>
                )}
                {config.payAccountNumber && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">เลขที่บัญชี</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-medium tracking-wide">
                        {config.payAccountNumber}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => {
                          void navigator.clipboard.writeText(config.payAccountNumber);
                          toast.success('คัดลอกเลขบัญชีแล้ว');
                        }}
                      >
                        คัดลอก
                      </button>
                    </span>
                  </div>
                )}
                {config.payQrUrl && (
                  <PreviewableImage
                    src={config.payQrUrl}
                    alt="QR รับเงิน"
                    className="mx-auto mt-2 h-44 w-44 rounded-lg border object-contain"
                  />
                )}
              </div>
            )}

          <ImageUpload value={slipUrl} onUploaded={setSlipUrl} label="แนบสลิปการโอน" />
          <Button
            type="button"
            className="w-full"
            disabled={!slipUrl || submit.isPending}
            onClick={() => slipUrl && submit.mutate(slipUrl)}
          >
            {submit.isPending ? 'กำลังส่ง…' : 'ส่งสลิปให้แอดมินตรวจสอบ'}
          </Button>
        </div>
      )}
    </div>
  );
}
