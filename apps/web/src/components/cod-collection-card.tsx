'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Banknote, Check, Landmark } from 'lucide-react';
import { Button, PreviewableImage, cn } from '@movesook/ui';
import type { CodCollectionMethod, JobDto } from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';

/**
 * COD-only: the driver records HOW they received the cash remainder from the
 * customer at the destination (เงินสด / โอน) before marking the delivery done.
 * TRANSFER requires a proof slip. Once recorded it renders read-only.
 */
export function CodCollectionCard({ job }: { job: JobDto }) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<CodCollectionMethod | null>(null);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);

  const record = useMutation({
    mutationFn: async (args: { method: CodCollectionMethod; slipUrl?: string }) => {
      const res = await api.jobs[':id']['cod-collection'].$post({
        param: { id: job.id },
        json: args,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'บันทึกการรับเงินไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('บันทึกการรับเงินแล้ว');
      queryClient.invalidateQueries({ queryKey: ['active-jobs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Already recorded → read-only summary.
  if (job.codCollectedAt) {
    const isTransfer = job.codCollectionMethod === 'TRANSFER';
    return (
      <div className="rounded-lg border border-successScale-200 bg-successScale-50 p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-successScale-700">
          <Check className="h-4 w-4" />
          รับเงินจากลูกค้าแล้ว · {isTransfer ? 'โอน' : 'เงินสด'}
        </p>
        {isTransfer && job.codCollectionSlipUrl && (
          <div className="mt-2 h-24 w-24 overflow-hidden rounded-lg border">
            <PreviewableImage
              src={job.codCollectionSlipUrl}
              alt="หลักฐานการโอน"
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>
    );
  }

  const canSubmit = method === 'CASH' || (method === 'TRANSFER' && !!slipUrl);

  return (
    <div className="rounded-lg border border-dashed bg-muted/40 p-3">
      <p className="text-sm font-medium">บันทึกการรับเงินจากลูกค้า (เก็บปลายทาง)</p>
      <p className="mb-2 text-xs text-muted-foreground">
        เลือกวิธีที่ลูกค้าชำระเงินก่อนกด “แจ้งส่งสำเร็จ”
      </p>

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { key: 'CASH', label: 'เงินสด', Icon: Banknote },
            { key: 'TRANSFER', label: 'โอน', Icon: Landmark },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            disabled={record.isPending}
            onClick={() => {
              setMethod(key);
              if (key === 'CASH') setSlipUrl(null);
            }}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors',
              method === key
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'hover:border-brand-300',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {method === 'TRANSFER' && (
        <div className="mt-3">
          <ImageUpload
            folder="slip"
            label="แนบรูปหลักฐานการโอน"
            value={slipUrl}
            onUploaded={(url) => setSlipUrl(url)}
          />
        </div>
      )}

      {method && (
        <Button
          className="mt-3 w-full"
          disabled={!canSubmit || record.isPending}
          onClick={() =>
            record.mutate(
              method === 'TRANSFER' ? { method, slipUrl: slipUrl ?? undefined } : { method },
            )
          }
        >
          บันทึกการรับเงิน
        </Button>
      )}
    </div>
  );
}
