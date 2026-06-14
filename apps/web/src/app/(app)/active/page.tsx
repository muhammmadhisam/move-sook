'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  PreviewableImage,
  cn,
} from '@movesook/ui';
import { isInHand, type JobDto, type JobListResponse, type JobStatus } from '@movesook/shared';

type TabKey = 'active' | 'done';
const TAB_GROUPS: Record<TabKey, Set<JobStatus>> = {
  active: new Set(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'PENDING_CONFIRMATION']),
  done: new Set(['DELIVERED', 'CANCELLED']),
};
const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'กำลังทำ' },
  { key: 'done', label: 'ประวัติ' },
];
import { FileText, Flag, MapPin, Package } from 'lucide-react';
import { api, API_BASE_URL } from '@/lib/api';
import { ImageUploadGallery } from '@/components/image-upload-gallery';
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_VARIANT,
  nextForwardStatus,
} from '@/lib/job-display';

async function fetchActiveJobs(): Promise<JobListResponse> {
  const res = await api.jobs.$get({ query: { mine: 'true' } });
  if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
  return (await res.json()) as JobListResponse;
}

export default function ActiveJobsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('active');
  const jobs = useQuery({ queryKey: ['active-jobs'], queryFn: fetchActiveJobs });

  const advance = useMutation({
    mutationFn: async (args: { id: string; status: JobStatus }) => {
      const res = await api.jobs[':id'].status.$patch({
        param: { id: args.id },
        json: { status: args.status },
      });
      if (!res.ok) throw new Error('อัปเดตสถานะไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      toast.success('อัปเดตสถานะแล้ว');
      queryClient.invalidateQueries({ queryKey: ['active-jobs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flagIllegal = useMutation({
    mutationFn: async (args: { id: string; reason: string }) => {
      const res = await api.jobs[':id']['flag-illegal'].$post({
        param: { id: args.id },
        json: { reason: args.reason },
      });
      if (!res.ok) throw new Error('แจ้งของผิดกฎหมายไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      toast.success('แจ้งของผิดกฎหมายแล้ว · ทีมงานจะตรวจสอบ');
      queryClient.invalidateQueries({ queryKey: ['active-jobs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const proof = useMutation({
    mutationFn: async (args: { id: string; kind: 'PICKUP' | 'DELIVERY'; urls: string[] }) => {
      const res = await api.jobs[':id'].proof.$post({
        param: { id: args.id },
        json: { kind: args.kind, urls: args.urls },
      });
      if (!res.ok) throw new Error('แนบรูปไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      toast.success('บันทึกรูปแล้ว');
      queryClient.invalidateQueries({ queryKey: ['active-jobs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = jobs.data?.items ?? [];
  const counts = {
    active: all.filter((j) => TAB_GROUPS.active.has(j.status)).length,
    done: all.filter((j) => TAB_GROUPS.done.has(j.status)).length,
  };
  const filtered = all.filter((j) => TAB_GROUPS[tab].has(j.status));

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">งานที่รับไว้</h1>

      <div className="mb-4 flex rounded-lg border bg-muted/40 p-1">
        {TABS.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
                isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t.label}
              {counts[t.key] > 0 ? ` (${counts[t.key]})` : ''}
            </button>
          );
        })}
      </div>

      {jobs.isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {!jobs.isLoading && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">ไม่มีงานในหมวดนี้</p>
      )}

      <div className="flex flex-col gap-3">
        {filtered.map((job: JobDto) => {
          const next = nextForwardStatus(job.status);
          const photo = job.itemPhotos[0];
          // Delivery proof becomes relevant once the items are in the driver's hands.
          const canUploadDelivery = job.status === 'PICKED_UP' || job.status === 'IN_TRANSIT';
          return (
            <Card key={job.id} className="overflow-hidden">
              {/* Header: thumbnail + title + status + price */}
              <div className="flex gap-3 p-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {photo ? (
                    <PreviewableImage
                      src={photo}
                      gallery={job.itemPhotos}
                      alt={job.itemDescription}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-base font-semibold leading-tight">
                      {job.itemDescription}
                    </h3>
                    <Badge variant={JOB_STATUS_VARIANT[job.status]} className="shrink-0">
                      {JOB_STATUS_LABEL[job.status]}
                    </Badge>
                  </div>
                  {job.priceQuoted != null && (
                    <p className="mt-1 text-lg font-bold text-brand-600">
                      ฿{job.priceQuoted.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Route timeline */}
              <div className="border-t px-4 py-3">
                <div className="relative space-y-3 pl-5">
                  <span className="absolute left-[3px] top-2 h-[calc(100%-1rem)] w-px bg-border" />
                  <div className="relative">
                    <span className="absolute -left-5 top-0.5 h-2.5 w-2.5 rounded-full bg-successScale-500 ring-2 ring-successScale-100" />
                    <p className="text-xs text-muted-foreground">จุดรับของ · {job.originProvince}</p>
                    <p className="truncate text-sm">{job.originAddress}</p>
                  </div>
                  <div className="relative">
                    <span className="absolute -left-5 top-0.5 h-2.5 w-2.5 rounded-full bg-error-500 ring-2 ring-error-100" />
                    <p className="text-xs text-muted-foreground">ปลายทาง · {job.destProvince}</p>
                    <p className="truncate text-sm">{job.destAddress}</p>
                  </div>
                </div>
              </div>

              <CardContent className="flex flex-col gap-3 p-4 pt-0">
                <div className="flex gap-2">
                  <Button asChild variant="outline" className="flex-1">
                    <Link href={`/active/${job.id}/route`}>
                      <MapPin className="mr-1.5 h-4 w-4" />
                      ดูเส้นทาง
                    </Link>
                  </Button>
                  {/* Printable job worksheet (ใบสรุปงาน) for the accepted job. */}
                  <Button asChild variant="outline" className="flex-1">
                    <a
                      href={`${API_BASE_URL}/jobs/${job.id}/worksheet`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText className="mr-1.5 h-4 w-4" />
                      พิมพ์ใบงาน
                    </a>
                  </Button>
                </div>

                {/* Proof photos — multiple allowed */}
                <ImageUploadGallery
                  label={`รูปตอนรับของ (${job.pickupProofUrls.length})`}
                  value={job.pickupProofUrls}
                  onChange={(urls) => proof.mutate({ id: job.id, kind: 'PICKUP', urls })}
                  disabled={proof.isPending}
                />
                {canUploadDelivery && (
                  <ImageUploadGallery
                    label={`รูปตอนส่ง (${job.deliveryProofUrls.length})`}
                    value={job.deliveryProofUrls}
                    onChange={(urls) => proof.mutate({ id: job.id, kind: 'DELIVERY', urls })}
                    disabled={proof.isPending}
                  />
                )}

                {job.status === 'PENDING_CONFIRMATION' && (
                  <p className="rounded-lg border border-dashed bg-muted p-3 text-center text-sm text-muted-foreground">
                    แจ้งส่งสำเร็จแล้ว · รอแอดมินยืนยัน
                  </p>
                )}

                {next && (
                  <Button
                    className="w-full"
                    disabled={advance.isPending}
                    onClick={() => advance.mutate({ id: job.id, status: next })}
                  >
                    {next === 'PENDING_CONFIRMATION'
                      ? 'แจ้งส่งสำเร็จ'
                      : `อัปเดตเป็น “${JOB_STATUS_LABEL[next]}”`}
                  </Button>
                )}

                {/* Trust & safety: report prohibited/illegal cargo (no penalty to the driver). */}
                {isInHand(job.status) && (
                  <Button
                    variant="ghost"
                    className="w-full gap-1.5 text-destructive hover:text-destructive"
                    disabled={flagIllegal.isPending}
                    onClick={() => {
                      const reason = window.prompt(
                        'พบสิ่งของผิดกฎหมาย/ต้องห้าม? โปรดอธิบายสั้น ๆ (งานจะถูกระงับเพื่อให้แอดมินตรวจสอบ)',
                      );
                      if (reason && reason.trim().length >= 3) {
                        flagIllegal.mutate({ id: job.id, reason: reason.trim() });
                      }
                    }}
                  >
                    <Flag className="h-4 w-4" />
                    แจ้งของผิดกฎหมาย
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {advance.isError && (
        <p className="mt-3 text-sm text-destructive">อัปเดตสถานะไม่สำเร็จ</p>
      )}

      <div className="mt-6 flex gap-2">
        <Button asChild className="flex-1">
          <Link href="/jobs">หางานใหม่</Link>
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <Link href="/app">หน้าหลัก</Link>
        </Button>
      </div>
    </main>
  );
}
