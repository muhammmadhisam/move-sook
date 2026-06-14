'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Gift,
  MapPin,
  Package,
  Plus,
  Truck,
  Upload,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, cn } from '@movesook/ui';
import type { JobDto, JobListResponse, JobStatus } from '@movesook/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { AvailabilityToggle } from '@/components/availability-toggle';
import { IncentivesCard } from '@/components/incentives-card';
import { DriverJobsMap } from '@/components/driver-jobs-map';
import { JOB_STATUS_LABEL, JOB_STATUS_VARIANT } from '@/lib/job-display';

// Authenticated home dashboard. The (app) layout's AppShell redirects
// unauthenticated visitors to /login, so `me` is present here in practice.
export default function AppHomePage() {
  const { me } = useAuth();

  if (!me) return null;

  const name = me.displayName ?? 'ผู้ใช้';
  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div>
        <p className="text-sm text-muted-foreground">สวัสดี</p>
        <h2 className="text-xl font-semibold tracking-tight">{name}</h2>
      </div>

      {me.role === 'DRIVER' ? (
        <DriverHome isAvailable={me.isAvailable} />
      ) : (
        <CustomerHome />
      )}
    </div>
  );
}

// ── Driver ──────────────────────────────────────────────────────────────────
function DriverHome({ isAvailable }: { isAvailable: boolean }) {
  return (
    <>
      <Card>
        <CardContent className="p-4">
          <AvailabilityToggle initial={isAvailable} />
        </CardContent>
      </Card>
      <IncentivesCard />
      {/* Jobs near you — tap a pin on the map to accept without opening the list. */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">งานใกล้คุณ</h3>
          <Link href="/jobs" className="text-xs text-primary hover:underline">
            ดูแบบรายการ →
          </Link>
        </div>
        <DriverJobsMap />
      </div>
      <Button asChild size="lg" variant="outline" className="w-full">
        <Link href="/active">งานที่รับไว้</Link>
      </Button>
    </>
  );
}

// ── Customer ────────────────────────────────────────────────────────────────
const IN_PROGRESS: Set<JobStatus> = new Set([
  'POSTED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'PENDING_CONFIRMATION',
]);

function CustomerHome() {
  const jobs = useQuery({
    queryKey: ['my-jobs'],
    queryFn: async (): Promise<JobListResponse> => {
      const res = await api.jobs.$get({ query: {} });
      if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
      return (await res.json()) as JobListResponse;
    },
  });

  const all = jobs.data?.items ?? [];
  // Newest first so the hero card reflects the customer's latest activity.
  const sorted = [...all].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // A job awaiting the customer's slip upload is the most urgent thing to surface.
  const needsSlip = sorted.find(
    (j) => j.status === 'PENDING_PAYMENT' && !j.paymentSlipUrl,
  );
  const activeJob = sorted.find((j) => IN_PROGRESS.has(j.status));
  const doneCount = all.filter((j) => j.status === 'DELIVERED').length;
  const inProgressCount = all.filter((j) => IN_PROGRESS.has(j.status)).length;
  const isNewUser = !jobs.isLoading && all.length === 0;

  return (
    <>
      {/* Slip-needed alert — highest priority action */}
      {needsSlip && (
        <Link
          href={`/my-jobs`}
          className="flex items-center gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-3.5"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/20 text-warning">
            <Upload className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">อัปโหลดสลิปเพื่อเริ่มงาน</p>
            <p className="truncate text-xs text-muted-foreground">
              {needsSlip.itemDescription}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {/* Active-job hero — answers "where is my job?" at a glance */}
      {activeJob && <ActiveJobCard job={activeJob} />}

      {/* Primary CTA — post a job */}
      <Link
        href="/jobs/new"
        className="block rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm transition-transform active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Plus className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">โพสต์งานขนย้าย</p>
            <p className="text-xs text-primary-foreground/80">
              ฟรี ไม่มีค่าใช้จ่าย คนขับใกล้คุณรับงานได้ทันที
            </p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0" />
        </div>
      </Link>

      {/* New customer onboarding — 3 steps */}
      {isNewUser && <HowItWorks />}

      {/* Quick stats — only once the customer has activity */}
      {!isNewUser && (inProgressCount > 0 || doneCount > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <StatChip
            icon={<Truck className="h-4 w-4" />}
            value={inProgressCount}
            label="กำลังดำเนินการ"
          />
          <StatChip
            icon={<CheckCircle2 className="h-4 w-4" />}
            value={doneCount}
            label="เสร็จสิ้น"
          />
        </div>
      )}

      {/* Secondary actions */}
      <div className="grid gap-3">
        <Button asChild size="lg" variant="outline">
          <Link href="/my-jobs">
            <Package className="h-4 w-4" />
            งานของฉัน
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/referral">
            <Gift className="h-4 w-4" />
            แนะนำเพื่อน รับส่วนลด
          </Link>
        </Button>
      </div>
    </>
  );
}

// Compact progress ribbon mirrored from /my-jobs, sized for the home hero.
const PROGRESS_STEPS: { status: JobStatus; label: string }[] = [
  { status: 'POSTED', label: 'รอคนขับ' },
  { status: 'ACCEPTED', label: 'รับงาน' },
  { status: 'PICKED_UP', label: 'รับของ' },
  { status: 'IN_TRANSIT', label: 'ขนส่ง' },
  { status: 'PENDING_CONFIRMATION', label: 'ส่งแล้ว' },
];
const STEP_ORDER = PROGRESS_STEPS.map((s) => s.status);

function ActiveJobCard({ job }: { job: JobDto }) {
  const currentStepIdx = STEP_ORDER.indexOf(job.status);

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-2xl border bg-card p-4 shadow-sm transition-transform active:scale-[0.99]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant={JOB_STATUS_VARIANT[job.status]} className="text-xs">
          {JOB_STATUS_LABEL[job.status]}
        </Badge>
        <span className="inline-flex items-center gap-1 text-xs text-primary">
          ติดตามงาน <ArrowRight className="h-3 w-3" />
        </span>
      </div>

      <p className="mb-2 line-clamp-1 text-sm font-semibold">{job.itemDescription}</p>

      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{job.originProvince}</span>
        <ArrowRight className="h-3 w-3 shrink-0" />
        <span className="truncate">{job.destProvince}</span>
      </div>

      {currentStepIdx >= 0 && (
        <div className="flex items-center gap-0">
          {PROGRESS_STEPS.map((step, i) => {
            const done = i < currentStepIdx;
            const active = i === currentStepIdx;
            return (
              <div key={step.status} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <div
                    className={cn(
                      'h-0.5 flex-1',
                      i === 0 ? 'invisible' : done || active ? 'bg-primary' : 'bg-muted',
                    )}
                  />
                  <div
                    className={cn(
                      'h-2.5 w-2.5 shrink-0 rounded-full border-2 transition-colors',
                      done
                        ? 'border-primary bg-primary'
                        : active
                          ? 'border-primary bg-background'
                          : 'border-muted bg-muted',
                    )}
                  />
                  <div
                    className={cn(
                      'h-0.5 flex-1',
                      i === PROGRESS_STEPS.length - 1
                        ? 'invisible'
                        : done
                          ? 'bg-primary'
                          : 'bg-muted',
                    )}
                  />
                </div>
                <p
                  className={cn(
                    'mt-1 text-center text-[9px] leading-tight',
                    active
                      ? 'font-semibold text-primary'
                      : done
                        ? 'text-primary/70'
                        : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}

function StatChip({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-3.5">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

const STEPS: { icon: React.ReactNode; title: string; desc: string }[] = [
  {
    icon: <Plus className="h-4 w-4" />,
    title: 'โพสต์งาน',
    desc: 'บอกของที่จะย้าย ต้นทาง–ปลายทาง',
  },
  {
    icon: <Truck className="h-4 w-4" />,
    title: 'คนขับรับงาน',
    desc: 'คนขับใกล้คุณที่ว่างจะรับงานทันที',
  },
  {
    icon: <CheckCircle2 className="h-4 w-4" />,
    title: 'ส่งถึงที่หมาย',
    desc: 'ติดตามสถานะแบบเรียลไทม์จนของถึงมือ',
  },
];

function HowItWorks() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">ใช้งานง่ายใน 3 ขั้นตอน</h3>
        </div>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                {s.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {i + 1}. {s.title}
                </p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
