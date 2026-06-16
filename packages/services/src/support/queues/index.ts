import type { Worker } from 'bullmq';
import { getEnv } from '../../runtime/env';
import { closeRedis } from '../redis';
import { startNotificationsWorker } from './notifications';
import { startMaintenanceWorker, registerMaintenanceSchedules } from './maintenance';
import { startSideEffectsWorker } from './side-effects';

export { enqueuePush, enqueueMulticast } from './notifications';
export { enqueueAudit, maybeIssueReferralReward } from './side-effects';

let workers: Worker[] = [];

// Boot the BullMQ workers and register the repeatable maintenance schedules.
// No-op when WORKERS_ENABLED=false (e.g. a web-only replica with workers running
// as a separate process).
export async function startWorkers(): Promise<void> {
  if (!getEnv().WORKERS_ENABLED) {
    console.info('[workers] disabled (WORKERS_ENABLED=false) — no queue processing in this process');
    return;
  }
  workers = [startNotificationsWorker(), startMaintenanceWorker(), startSideEffectsWorker()];
  await registerMaintenanceSchedules();
  console.info('[workers] notifications + maintenance + side-effects workers started');
}

// Drain in-flight jobs and release Redis connections.
export async function stopWorkers(): Promise<void> {
  await Promise.allSettled(workers.map((w) => w.close()));
  workers = [];
  await closeRedis();
}
