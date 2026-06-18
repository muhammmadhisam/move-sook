import { Queue, Worker, type Job } from 'bullmq';
import { prisma, type Prisma } from '@movesook/db';
import type { NotificationType } from '@movesook/shared';
import { bullConnection } from '../redis';
import { runReferralRewardGrant } from '../referral';
import { notifyNewJobToArea, notifyAdmins, pushAdminLineGroup } from '../notify';
import { getLogger, reportError } from '../../runtime/env';

// Durable side-effects queue. These are post-commit side effects that used to run
// inline as best-effort (try/catch + log): a transient failure silently lost the
// write. Moving them here gives at-least-once delivery with retry/backoff.
//   - audit            → append an AuditLog row (admin action already happened)
//   - referral-reward  → idempotent two-sided referral grant (see referral.ts)
//   - job-broadcast    → fan a freshly-published job out to drivers in its area
//   - admin-alert      → fan an ops alert (in-app + LINE group) out to all admins
//
// job-broadcast / admin-alert were inline fan-outs (an unbounded driver/admin
// query + createMany + LINE enqueue) that ran in the customer/admin request path.
// Their handlers are intentionally best-effort (they never throw — see notify.ts),
// so the value here is getting the work *off the request path*, not retry.

export const SIDE_EFFECTS_QUEUE = 'side-effects';

export type AuditJobData = {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
};
type ReferralJobData = { customerId: string };
type JobBroadcastData = { jobId: string };
type AdminAlertData = {
  title: string;
  body: string;
  jobId?: string | null;
  type?: NotificationType;
  /** Also push a text alert to the configured admin LINE group. */
  lineGroup?: boolean;
};

const jobOpts = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 2_000 },
};

let queue: Queue | null = null;
function getQueue(): Queue {
  if (!queue) queue = new Queue(SIDE_EFFECTS_QUEUE, { connection: bullConnection() });
  return queue;
}

/** Enqueue an audit-log write. Throws if Redis is unreachable — callers swallow. */
export async function enqueueAudit(data: AuditJobData): Promise<void> {
  await getQueue().add('audit', data, jobOpts);
}

/**
 * Enqueue the referral-reward grant for a delivered customer. Best-effort to
 * enqueue (never throws) so it can't break delivery confirmation; the worker
 * holds the idempotent grant logic.
 */
export async function maybeIssueReferralReward(customerId: string): Promise<void> {
  try {
    await getQueue().add('referral-reward', { customerId } satisfies ReferralJobData, jobOpts);
  } catch (err) {
    getLogger().error({ err, customerId }, '[side-effects] failed to enqueue referral reward');
    reportError(err, { scope: 'side-effects.enqueueReferralReward', customerId });
  }
}

/**
 * Enqueue the new-job-in-area fan-out (driver match query + in-app rows + LINE
 * multicast). Best-effort to enqueue (never throws) so a Redis blip can't 500 the
 * publish/approve action that triggered it.
 */
export async function enqueueJobBroadcast(jobId: string): Promise<void> {
  try {
    await getQueue().add('job-broadcast', { jobId } satisfies JobBroadcastData, jobOpts);
  } catch (err) {
    getLogger().error({ err, jobId }, '[side-effects] failed to enqueue job broadcast');
    reportError(err, { scope: 'side-effects.enqueueJobBroadcast', jobId });
  }
}

/**
 * Enqueue an ops alert fanned out to every admin (in-app, and optionally the
 * admin LINE group). Best-effort to enqueue (never throws) so it can't break the
 * customer action — e.g. a payment-slip upload — that triggered it.
 */
export async function enqueueAdminAlert(data: AdminAlertData): Promise<void> {
  try {
    await getQueue().add('admin-alert', data, jobOpts);
  } catch (err) {
    getLogger().error({ err }, '[side-effects] failed to enqueue admin alert');
    reportError(err, { scope: 'side-effects.enqueueAdminAlert' });
  }
}

async function process(job: Job): Promise<void> {
  switch (job.name) {
    case 'audit': {
      const d = job.data as AuditJobData;
      await prisma.auditLog.create({
        data: {
          actorId: d.actorId,
          action: d.action,
          targetType: d.targetType,
          targetId: d.targetId,
          ...(d.metadata !== undefined ? { metadata: d.metadata } : {}),
        },
      });
      return;
    }
    case 'referral-reward': {
      await runReferralRewardGrant((job.data as ReferralJobData).customerId);
      return;
    }
    case 'job-broadcast': {
      const { jobId } = job.data as JobBroadcastData;
      // Refetch so the fan-out reflects the job's current state, not a stale
      // snapshot from enqueue time. A deleted/missing job is a no-op.
      const j = await prisma.job.findUnique({
        where: { id: jobId },
        select: { id: true, originProvince: true, destProvince: true, itemDescription: true },
      });
      if (j) await notifyNewJobToArea(j);
      return;
    }
    case 'admin-alert': {
      const d = job.data as AdminAlertData;
      await notifyAdmins({
        type: d.type ?? 'GENERIC',
        title: d.title,
        body: d.body,
        jobId: d.jobId ?? null,
      });
      if (d.lineGroup) await pushAdminLineGroup(`${d.title}\n${d.body}`);
      return;
    }
    default:
      getLogger().warn({ jobName: job.name }, '[side-effects] unknown job — skipped');
  }
}

export function startSideEffectsWorker(): Worker {
  const worker = new Worker(SIDE_EFFECTS_QUEUE, process, {
    connection: bullConnection(),
    concurrency: 5,
  });
  worker.on('failed', (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      getLogger().error(
        { err, jobName: job.name, jobId: job.id },
        '[side-effects] job failed permanently',
      );
      // Durable write lost after all retries (audit row / referral grant) — page it.
      reportError(err, { queue: SIDE_EFFECTS_QUEUE, jobName: job.name, jobId: job.id });
    }
  });
  return worker;
}
