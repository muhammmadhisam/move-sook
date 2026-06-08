'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, cn } from '@movesook/ui';
import { isInHand, type JobListResponse } from '@movesook/shared';
import { api } from '@/lib/api';

/** Driver online/offline switch. Seeded from /me's `isAvailable`. */
export function AvailabilityToggle({ initial }: { initial: boolean }) {
  const [online, setOnline] = useState(initial);
  const queryClient = useQueryClient();

  // Whether the driver still has a job in hand — they can't go off-duty until it's done.
  const activeJobs = useQuery({
    queryKey: ['active-jobs'],
    queryFn: async (): Promise<JobListResponse> => {
      const res = await api.jobs.$get({ query: { mine: 'true' } });
      if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
      return (await res.json()) as JobListResponse;
    },
  });
  const hasInHand = activeJobs.data?.items.some((j) => isInHand(j.status)) ?? false;

  const update = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await api.drivers.me.availability.$patch({ json: { isAvailable: next } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'อัปเดตสถานะไม่สำเร็จ');
      }
      return next;
    },
    onSuccess: (next) => {
      setOnline(next);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Can't rest while holding a job (client guard; the API enforces it regardless).
  const blockRest = online && hasInHand;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              online ? 'bg-successScale-500' : 'bg-gray-300',
            )}
          />
          <span className="text-sm font-medium">
            {online ? 'ออนไลน์ — รับงานอยู่' : 'พักรับงาน'}
          </span>
        </div>
        <Button
          size="sm"
          variant={online ? 'outline' : 'default'}
          disabled={update.isPending || blockRest}
          onClick={() => update.mutate(!online)}
        >
          {online ? 'พักงาน' : 'เปิดรับงาน'}
        </Button>
      </div>
      {blockRest && (
        <p className="text-xs text-muted-foreground">
          มีงานค้างอยู่ • ส่งงานให้เสร็จก่อนจึงจะพักรับงานได้
        </p>
      )}
    </div>
  );
}
