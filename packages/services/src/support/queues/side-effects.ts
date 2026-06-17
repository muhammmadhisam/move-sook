import { Queue, Worker, type Job } from 'bullmq';
import { prisma, type Prisma } from '@movesook/db';
import { bullConnection } from '../redis';
import { runReferralRewardGrant } from '../referral';
import { getLogger, reportError } from '../../runtime/env';

// Durable side-effects queue. These are post-commit side effects that used to run
// inline as best-effort (try/catch + log): a transient failure silently lost the
// write. Moving them here gives at-least-once delivery with retry/backoff.
//   - audit            → append an AuditLog row (admin action already happened)
//   - referral-reward  → idempotent two-sided referral grant (see referral.ts)

export const SIDE_EFFECTS_QUEUE = 'side-effects';

export type AuditJobData = {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
};
type ReferralJobData = { customerId: string };

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
