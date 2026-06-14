'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  cn,
} from '@movesook/ui';
import type { JobDto, JobListResponse, JobStatus } from '@movesook/shared';
import { api } from '@/lib/api';
import { JobRouteMap } from '@/components/job-route-map';
import { PaymentSlipCard } from '@/components/payment-slip-card';
import { ReviewDialog } from '@/components/review-dialog';
import { JOB_STATUS_LABEL, JOB_STATUS_VARIANT, jobDest, jobOrigin } from '@/lib/job-display';

const CANCELLABLE = new Set(['DRAFT', 'PENDING_PAYMENT', 'POSTED', 'ACCEPTED']);

type TabKey = 'active' | 'done' | 'cancelled';
const TAB_GROUPS: Record<TabKey, Set<JobStatus>> = {
  active: new Set(['DRAFT', 'PENDING_PAYMENT', 'POSTED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'PENDING_CONFIRMATION']),
  done: new Set(['DELIVERED']),
  cancelled: new Set(['CANCELLED']),
};
const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'กำลังดำเนินการ' },
  { key: 'done', label: 'เสร็จสิ้น' },
  { key: 'cancelled', label: 'ยกเลิก' },
];

// Active-job progress steps shown under the card.
const PROGRESS_STEPS: { status: JobStatus; label: string }[] = [
  { status: 'POSTED', label: 'รอคนขับ' },
  { status: 'ACCEPTED', label: 'รับงานแล้ว' },
  { status: 'PICKED_UP', label: 'รับของแล้ว' },
  { status: 'IN_TRANSIT', label: 'กำลังขนส่ง' },
  { status: 'PENDING_CONFIRMATION', label: 'ส่งแล้ว' },
];
const STEP_ORDER: JobStatus[] = PROGRESS_STEPS.map((s) => s.status);

async function fetchMyJobs(): Promise<JobListResponse> {
  const res = await api.jobs.$get({ query: {} });
  if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
  return (await res.json()) as JobListResponse;
}

// ── Job card ──────────────────────────────────────────────────────────────────
function JobCard({
  job,
  onCancel,
  cancelPending,
  onReviewDone,
}: {
  job: JobDto;
  onCancel: (id: string) => void;
  cancelPending: boolean;
  onReviewDone: () => void;
}) {
  const isActive = TAB_GROUPS.active.has(job.status);
  const currentStepIdx = STEP_ORDER.indexOf(job.status);

  const createdAt = new Date(job.createdAt).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <Badge variant={JOB_STATUS_VARIANT[job.status]} className="text-xs">
          {JOB_STATUS_LABEL[job.status]}
        </Badge>
        <span className="text-xs text-muted-foreground">{createdAt}</span>
      </div>

      {/* Items */}
      <div className="px-4 pb-1">
        <p className="font-semibold text-sm leading-snug line-clamp-2">
          {job.itemDescription}
        </p>
      </div>

      {/* Route */}
      <div className="mx-4 my-2 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">ต้นทาง</p>
          <p className="text-sm font-medium truncate">{job.originProvince}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0 text-right">
          <p className="text-xs text-muted-foreground mb-0.5">ปลายทาง</p>
          <p className="text-sm font-medium truncate">{job.destProvince}</p>
        </div>
      </div>

      {/* Price + scheduled */}
      <div className="flex items-center justify-between gap-2 px-4 pb-2">
        {job.priceQuoted ? (
          <p className="text-lg font-bold text-primary">
            ฿{job.priceQuoted.toLocaleString()}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">รอกำหนดราคา</p>
        )}
        {job.scheduledAt && (
          <p className="text-xs text-muted-foreground">
            {new Date(job.scheduledAt).toLocaleDateString('th-TH', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Bangkok',
            })}
          </p>
        )}
      </div>

      {/* Up-front payment: upload transfer slip while awaiting admin approval */}
      <PaymentSlipCard job={job} />

      {/* Progress steps for active jobs */}
      {isActive && currentStepIdx >= 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-0">
            {PROGRESS_STEPS.map((step, i) => {
              const done = i < currentStepIdx;
              const active = i === currentStepIdx;
              return (
                <div key={step.status} className="flex flex-1 flex-col items-center">
                  {/* connector + dot row */}
                  <div className="flex w-full items-center">
                    <div className={cn('h-0.5 flex-1', i === 0 ? 'invisible' : done || active ? 'bg-primary' : 'bg-muted')} />
                    <div
                      className={cn(
                        'h-2.5 w-2.5 rounded-full border-2 shrink-0 transition-colors',
                        done ? 'border-primary bg-primary' : active ? 'border-primary bg-background' : 'border-muted bg-muted',
                      )}
                    />
                    <div className={cn('h-0.5 flex-1', i === PROGRESS_STEPS.length - 1 ? 'invisible' : done ? 'bg-primary' : 'bg-muted')} />
                  </div>
                  <p className={cn('mt-1 text-center text-[9px] leading-tight', active ? 'font-semibold text-primary' : done ? 'text-primary/70' : 'text-muted-foreground')}>
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="mx-4 border-t" />

      {/* Actions */}
      <div className="flex gap-2 p-3">
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link href={`/jobs/${job.id}`}>ดูรายละเอียด</Link>
        </Button>

        {(jobOrigin(job) ?? jobDest(job)) && (
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="px-3" aria-label="ดูแผนที่">
                แผนที่
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{job.itemDescription}</DialogTitle>
              </DialogHeader>
              <JobRouteMap
                origin={jobOrigin(job)}
                dest={jobDest(job)}
                className="h-64 w-full overflow-hidden rounded-xl border"
              />
              <div className="grid gap-1.5 text-sm">
                <div>
                  <p className="font-medium text-xs text-muted-foreground mb-0.5">ต้นทาง</p>
                  <p>{job.originAddress}</p>
                </div>
                <div>
                  <p className="font-medium text-xs text-muted-foreground mb-0.5">ปลายทาง</p>
                  <p>{job.destAddress}</p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {job.status === 'DELIVERED' && (
          <ReviewDialog jobId={job.id} onDone={onReviewDone} />
        )}

        {(job.status === 'DELIVERED' || job.status === 'CANCELLED') && (
          <Button asChild size="sm" variant="outline" className="flex-1">
            <Link href={`/jobs/new?from=${job.id}`}>สั่งซ้ำ</Link>
          </Button>
        )}

        {CANCELLABLE.has(job.status) && (
          <Button
            size="sm"
            variant="ghost"
            className="px-3 text-destructive hover:text-destructive"
            disabled={cancelPending}
            onClick={() => {
              // After a driver has accepted, cancelling affects them too — confirm first.
              const msg =
                job.status === 'ACCEPTED'
                  ? 'มีคนขับรับงานนี้แล้วและอาจกำลังเดินทาง — ยืนยันยกเลิกงาน? (อาจมีค่าธรรมเนียมหากเกินช่วงยกเลิกฟรี)'
                  : 'ยืนยันยกเลิกงานนี้?';
              if (window.confirm(msg)) onCancel(job.id);
            }}
          >
            ยกเลิก
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MyJobsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('active');
  const jobs = useQuery({ queryKey: ['my-jobs'], queryFn: fetchMyJobs });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.jobs[':id'].cancel.$post({ param: { id } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ยกเลิกงานไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('ยกเลิกงานแล้ว');
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = jobs.data?.items ?? [];
  const counts = {
    active: all.filter((j) => TAB_GROUPS.active.has(j.status)).length,
    done: all.filter((j) => TAB_GROUPS.done.has(j.status)).length,
    cancelled: all.filter((j) => TAB_GROUPS.cancelled.has(j.status)).length,
  };
  const filtered = all.filter((j) => TAB_GROUPS[tab].has(j.status));

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">งานของฉัน</h1>
        <Button asChild size="sm">
          <Link href="/jobs/new">+ โพสต์งาน</Link>
        </Button>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex rounded-xl border bg-muted/40 p-1 gap-0.5">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'relative flex-1 rounded-lg py-2 text-xs font-medium transition-all',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {counts[t.key] > 0 && (
                <span
                  className={cn(
                    'ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground',
                  )}
                >
                  {counts[t.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {jobs.isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty: no jobs at all */}
      {!jobs.isLoading && all.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-14 text-center">
          <div>
            <p className="font-medium">ยังไม่มีงานขนย้าย</p>
            <p className="text-sm text-muted-foreground mt-1">โพสต์งานแรกของคุณได้เลย</p>
          </div>
          <Button asChild className="mt-1">
            <Link href="/jobs/new">โพสต์งานขนย้าย</Link>
          </Button>
        </div>
      )}

      {/* Empty tab */}
      {!jobs.isLoading && all.length > 0 && filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          ไม่มีงานในหมวดนี้
        </p>
      )}

      {/* Job list */}
      <div className="flex flex-col gap-3">
        {filtered.map((job: JobDto) => (
          <JobCard
            key={job.id}
            job={job}
            onCancel={(id) => cancel.mutate(id)}
            cancelPending={cancel.isPending}
            onReviewDone={() => queryClient.invalidateQueries({ queryKey: ['my-jobs'] })}
          />
        ))}
      </div>
    </main>
  );
}
