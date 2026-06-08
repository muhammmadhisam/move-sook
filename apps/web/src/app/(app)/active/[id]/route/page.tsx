'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Navigation } from 'lucide-react';
import { Button } from '@movesook/ui';
import type { JobDetailResponse, JobStatus } from '@movesook/shared';
import { api } from '@/lib/api';
import { JobNavigation } from '@/components/job-navigation';
import { jobDest, jobOrigin } from '@/lib/job-display';

// While ACCEPTED the driver is heading to the pickup; once the items are aboard, to the dropoff.
const HEADING_TO_PICKUP = new Set<JobStatus>(['ACCEPTED']);
const NAVIGABLE = new Set<JobStatus>(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);

export default function DriverRoutePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const job = useQuery({
    queryKey: ['job', id],
    queryFn: async (): Promise<JobDetailResponse> => {
      const res = await api.jobs[':id'].$get({ param: { id } });
      if (res.status === 404) throw new Error('ไม่พบงานนี้');
      if (res.status === 403) throw new Error('คุณไม่มีสิทธิ์ดูงานนี้');
      if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
      return (await res.json()) as JobDetailResponse;
    },
  });

  // Memoise so the coordinate objects keep a stable identity across the frequent
  // re-renders the live nav state triggers — otherwise the map effect keeps tearing
  // down and rebuilding the route/marker, which looks glitchy.
  const origin = useMemo(() => (job.data ? jobOrigin(job.data) : null), [job.data]);
  const dest = useMemo(() => (job.data ? jobDest(job.data) : null), [job.data]);
  const status = job.data?.status;
  const toPickup = status ? HEADING_TO_PICKUP.has(status) : false;
  const target = useMemo(() => (toPickup ? origin : dest), [toPickup, origin, dest]);
  const targetLabel = toPickup ? 'จุดรับของ' : 'ปลายทาง';
  const navigable = status ? NAVIGABLE.has(status) : false;

  // Native maps fallback for full turn-by-turn with voice.
  const navHref =
    target
      ? `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`
      : null;

  return (
    <main className="flex h-[100dvh] flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-2 border-b bg-background px-4 py-3">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href="/active" aria-label="ย้อนกลับ">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-tight">
            {job.data?.itemDescription ?? 'นำทาง'}
          </h1>
          {job.data && (
            <p className="truncate text-xs text-muted-foreground">
              {job.data.originProvince} → {job.data.destProvince}
            </p>
          )}
        </div>
      </header>

      {/* Full-bleed navigation */}
      <div className="relative flex-1">
        {job.isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            กำลังโหลด…
          </div>
        )}
        {job.isError && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
            {(job.error as Error).message}
          </div>
        )}
        {job.data &&
          (navigable && target ? (
            <JobNavigation
              origin={origin}
              dest={dest}
              target={target}
              targetLabel={targetLabel}
              broadcast
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {target ? 'งานนี้ปิดการนำทางแล้ว' : 'งานนี้ยังไม่มีพิกัดแผนที่'}
            </div>
          ))}
      </div>

      {/* Bottom sheet: addresses + native-maps fallback */}
      {job.data && (
        <div className="space-y-3 border-t bg-background px-4 py-4">
          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-successScale-500" />
              <div className="min-w-0">
                <p className="font-medium">จุดรับของ</p>
                <p className="text-muted-foreground">{job.data.originAddress}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-error-500" />
              <div className="min-w-0">
                <p className="font-medium">ปลายทาง</p>
                <p className="text-muted-foreground">{job.data.destAddress}</p>
              </div>
            </div>
          </div>
          {navHref && (
            <Button asChild variant="outline" className="w-full">
              <a href={navHref} target="_blank" rel="noopener noreferrer">
                <Navigation className="mr-1.5 h-4 w-4" />
                เปิดด้วย Google Maps (มีเสียงนำทาง)
              </a>
            </Button>
          )}
        </div>
      )}
    </main>
  );
}
