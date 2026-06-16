'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Wallet } from 'lucide-react';
import { Button, PreviewableImage } from '@movesook/ui';
import type { JobDto, PublicSystemConfig } from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';

/**
 * COD commission ("ค่าธรรมเนียม") step shown to the assigned DRIVER on a COD job:
 * the driver transfers the commission to the platform, uploads the slip, then waits
 * for an admin to approve it before they may start the job (pickup is blocked until
 * then). Renders nothing once approved or for non-COD jobs / other statuses.
 */
export function CommissionSlipCard({
  job,
  onChanged,
}: {
  job: JobDto;
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const [slipUrl, setSlipUrl] = useState<string | null>(null);

  // Company receiving account + QR — where the driver transfers the fee.
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
      const res = await api.jobs[':id']['commission-slip'].$post({
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
      toast.success('ส่งสลิปค่าธรรมเนียมแล้ว รอแอดมินตรวจสอบ');
      setSlipUrl(null);
      queryClient.invalidateQueries({ queryKey: ['job', job.id] });
      onChanged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Only relevant for a COD job the driver is holding, before pickup, until approved.
  if (job.paymentMethod !== 'COD') return null;
  if (job.status !== 'ACCEPTED') return null;
  if (job.codCommissionApprovedAt) return null;

  const awaitingReview = Boolean(job.codCommissionSlipUrl);

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Wallet className="h-4 w-4 shrink-0 text-warning" />
        <p className="text-sm font-semibold">ชำระค่าธรรมเนียม (ค่าคอม) ก่อนเริ่มงาน</p>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        งานนี้เป็นแบบเก็บเงินปลายทาง คุณจะเก็บเงินค่างานเต็มจำนวนจากลูกค้าที่ปลายทาง
        แต่ต้องโอนค่าธรรมเนียมให้แพลตฟอร์มก่อน แล้วรอแอดมินอนุมัติจึงจะเริ่มรับของได้
      </p>

      <div className="mb-3 flex items-center justify-between rounded-lg bg-background px-3 py-2">
        <span className="text-sm text-muted-foreground">ค่าธรรมเนียมที่ต้องโอน</span>
        {job.codCommissionFee != null ? (
          <span className="text-base font-bold text-primary">
            ฿{job.codCommissionFee.toLocaleString()}
          </span>
        ) : (
          <span className="text-xs italic text-muted-foreground">รอแอดมินกำหนด</span>
        )}
      </div>

      {awaitingReview ? (
        <div className="space-y-2">
          {job.codCommissionSlipUrl && (
            <PreviewableImage
              src={job.codCommissionSlipUrl}
              alt="สลิปค่าธรรมเนียม"
              className="max-h-48 w-full rounded-lg border object-contain"
            />
          )}
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 shrink-0" />
            ส่งสลิปแล้ว — รอแอดมินตรวจสอบและอนุมัติก่อนเริ่มรับของ
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {job.codCommissionRejectedReason && (
            <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              สลิปก่อนหน้าไม่ผ่าน: {job.codCommissionRejectedReason} — กรุณาอัปโหลดใหม่
            </p>
          )}

          {/* Company receiving account + QR */}
          {config && (config.payAccountNumber || config.payQrUrl) && (
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

          <ImageUpload value={slipUrl} onUploaded={setSlipUrl} label="แนบสลิปค่าธรรมเนียม" />
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
