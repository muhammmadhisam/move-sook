// Domain-support + infrastructure modules shared by the service layer.
// (Moved out of apps/api/src/lib + apps/api/src/queues so the service functions
//  that call them can live in this package without importing from the app.)

export * from './transactions';
export * from './settings';
export * from './promo';
export * from './surge';
export * from './referral';
export * from './serialize';
export * from './paginate';
export * from './doc-links';
export * from './pdf';
export * from './notify';
export * from './audit';
export * from './cron-tasks';
export * from './rate-limit';
export * from './turnstile';
export * from './redis';
export * from './cache';

// Async layer (BullMQ): worker lifecycle + producer entrypoints.
export {
  startWorkers,
  stopWorkers,
  enqueuePush,
  enqueueMulticast,
  enqueueAudit,
  maybeIssueReferralReward,
  enqueueJobBroadcast,
  enqueueAdminAlert,
} from './queues';
