import { Queue, Worker, type Job } from 'bullmq';
import {
  pushLineMessages,
  multicastLineMessages,
  textMessage,
  type LineMessage,
  type LinePushResult,
} from '@movesook/auth';
import { getEnv } from '../../runtime/env';
import { bullConnection } from '../redis';

// LINE push queue. The in-app Notification row is still written synchronously in
// notify.ts (it's the source of truth); only the LINE Messaging API call — the
// slow, flaky, rate-limited part — is offloaded here so it gets retry/backoff
// and never blocks (or fails) the request that triggered it.

export const NOTIFICATIONS_QUEUE = 'notifications';

// Jobs carry fully-built LINE message objects (text or flex) so the worker can
// hand them straight to the Messaging API without re-deciding the shape.
type PushJob = { to: string; messages: LineMessage[] };
type MulticastJob = { to: string[]; messages: LineMessage[] };

const jobOpts = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 1_000 },
};

// Producer. Lazily created so importing this module (e.g. from notify.ts) is cheap.
let queue: Queue | null = null;
function getQueue(): Queue {
  if (!queue) queue = new Queue(NOTIFICATIONS_QUEUE, { connection: bullConnection() });
  return queue;
}

// Skip enqueuing entirely when push isn't configured — matches the old no-op
// behaviour and avoids filling the queue with jobs the worker can't send.
function pushConfigured(): boolean {
  return Boolean(getEnv().LINE_CHANNEL_ACCESS_TOKEN);
}

export async function enqueuePush(to: string, text: string): Promise<void> {
  await enqueuePushMessages(to, [textMessage(text)]);
}

/** Enqueue arbitrary LINE message objects (e.g. a Flex card) to one recipient. */
export async function enqueuePushMessages(to: string, messages: LineMessage[]): Promise<void> {
  if (!pushConfigured() || !to || messages.length === 0) return;
  await getQueue().add('push', { to, messages } satisfies PushJob, jobOpts);
}

export async function enqueueMulticast(to: string[], text: string): Promise<void> {
  await enqueueMulticastMessages(to, [textMessage(text)]);
}

/** Enqueue arbitrary LINE message objects to many recipients (chunked at send). */
export async function enqueueMulticastMessages(
  to: string[],
  messages: LineMessage[],
): Promise<void> {
  const recipients = to.filter(Boolean);
  if (!pushConfigured() || recipients.length === 0 || messages.length === 0) return;
  await getQueue().add('multicast', { to: recipients, messages } satisfies MulticastJob, jobOpts);
}

// A LINE failure is worth retrying only when it's transient (network / 429 /
// 5xx). A 4xx (bad recipient, malformed) or missing config won't fix itself, so
// swallow it — throwing would burn all retry attempts for nothing.
function isTransient(result: Extract<LinePushResult, { ok: false }>): boolean {
  const r = result.reason;
  if (r === 'network_error') return true;
  if (r === 'line_status_429') return true;
  if (r.startsWith('line_status_5')) return true;
  return false;
}

async function process(job: Job<PushJob | MulticastJob>): Promise<void> {
  const result =
    job.name === 'multicast'
      ? await multicastLineMessages(
          getEnv().LINE_CHANNEL_ACCESS_TOKEN,
          (job.data as MulticastJob).to,
          job.data.messages,
        )
      : await pushLineMessages(
          getEnv().LINE_CHANNEL_ACCESS_TOKEN,
          (job.data as PushJob).to,
          job.data.messages,
        );

  if (result.ok) return;
  if (isTransient(result)) {
    // Throw → BullMQ retries with backoff.
    throw new Error(`line push transient failure: ${result.reason}`);
  }
  // Permanent failure: log once and consider the job done.
  console.warn(`[notifications] dropping ${job.name} job ${job.id}: ${result.reason}`);
}

export function startNotificationsWorker(): Worker {
  const worker = new Worker(NOTIFICATIONS_QUEUE, process, {
    connection: bullConnection(),
    concurrency: 5,
    // Respect LINE's API rate limits — cap outbound calls per second.
    limiter: { max: 100, duration: 1_000 },
  });
  worker.on('failed', (job, err) => {
    // Only the final attempt reaches here as truly failed.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      console.error(`[notifications] ${job.name} job ${job.id} failed permanently:`, err.message);
    }
  });
  return worker;
}
