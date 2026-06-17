import { Queue, Worker, type Job } from 'bullmq';
import { getEnv, getLogger, reportError } from '../../runtime/env';
import { bullConnection } from '../redis';
import { nudgeIdleDrivers, expirePendingPayment } from '../cron-tasks';

// Repeatable maintenance jobs (former scripts/cron + node-cron). BullMQ stores
// the schedule in Redis and a single worker runs each occurrence, so registering
// the schedulers from every instance is safe — no double-run across replicas.

export const MAINTENANCE_QUEUE = 'maintenance';

const NUDGE = 'nudge-idle-drivers';
const EXPIRE = 'expire-pending-payment';

const TASKS: Record<string, () => Promise<{ [k: string]: unknown }>> = {
  [NUDGE]: nudgeIdleDrivers,
  [EXPIRE]: expirePendingPayment,
};

let queue: Queue | null = null;
function getQueue(): Queue {
  if (!queue) queue = new Queue(MAINTENANCE_QUEUE, { connection: bullConnection() });
  return queue;
}

// Idempotent: upsertJobScheduler keys on the scheduler id, so re-running on every
// boot just updates the pattern instead of stacking duplicates.
export async function registerMaintenanceSchedules(): Promise<void> {
  const q = getQueue();
  await q.upsertJobScheduler(NUDGE, { pattern: getEnv().CRON_NUDGE_SCHEDULE }, { name: NUDGE });
  await q.upsertJobScheduler(EXPIRE, { pattern: getEnv().CRON_EXPIRE_SCHEDULE }, { name: EXPIRE });
  getLogger().info(
    {
      nudge: getEnv().CRON_NUDGE_SCHEDULE,
      expire: getEnv().CRON_EXPIRE_SCHEDULE,
    },
    '[maintenance] schedules registered',
  );
}

async function process(job: Job): Promise<void> {
  const task = TASKS[job.name];
  if (!task) {
    getLogger().warn({ jobName: job.name }, '[maintenance] unknown job — skipped');
    return;
  }
  const result = await task();
  getLogger().info({ jobName: job.name, result }, '[maintenance] task completed');
}

export function startMaintenanceWorker(): Worker {
  const worker = new Worker(MAINTENANCE_QUEUE, process, {
    connection: bullConnection(),
    concurrency: 1, // maintenance tasks are cheap and don't need parallelism
  });
  worker.on('failed', (job, err) => {
    getLogger().error({ err, jobName: job?.name }, '[maintenance] job failed');
    reportError(err, { queue: MAINTENANCE_QUEUE, jobName: job?.name });
  });
  return worker;
}
