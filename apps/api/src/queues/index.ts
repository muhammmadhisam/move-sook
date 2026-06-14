import type { Worker } from 'bullmq';
import { env } from '../config';
import { closeRedis } from '../lib/redis';
import { startNotificationsWorker } from './notifications';
import { startMaintenanceWorker, registerMaintenanceSchedules } from './maintenance';

export { enqueuePush, enqueueMulticast } from './notifications';

let workers: Worker[] = [];

// Boot the BullMQ workers and register the repeatable maintenance schedules.
// No-op when WORKERS_ENABLED=false (e.g. a web-only replica with workers running
// as a separate process).
export async function startWorkers(): Promise<void> {
  if (!env.WORKERS_ENABLED) {
    console.info('[workers] disabled (WORKERS_ENABLED=false) — no queue processing in this process');
    return;
  }
  workers = [startNotificationsWorker(), startMaintenanceWorker()];
  await registerMaintenanceSchedules();
  console.info('[workers] notifications + maintenance workers started');
}

// Drain in-flight jobs and release Redis connections.
export async function stopWorkers(): Promise<void> {
  await Promise.allSettled(workers.map((w) => w.close()));
  workers = [];
  await closeRedis();
}
