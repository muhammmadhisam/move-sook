import type { Prisma } from '@movesook/db';
import { enqueueAudit } from './queues/side-effects';
import { getLogger, reportError } from '../runtime/env';

export type AuditTargetType = 'user' | 'driver' | 'job' | 'transaction' | 'setting';

type AuditInput = {
  actorId: string; // the admin User.id performing the action
  action: string; // e.g. "driver.verify", "user.ban"
  targetType: AuditTargetType;
  targetId: string;
  metadata?: Prisma.InputJsonValue; // decision details / before-after snapshot
};

/**
 * Append an immutable audit-trail row via the durable side-effects queue (the
 * worker does the DB write with retry, so a transient blip no longer drops the
 * entry). Best-effort to enqueue: if Redis itself is unreachable we log and move
 * on — a logging failure must never roll back or 500 the action that succeeded.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await enqueueAudit(input);
  } catch (err) {
    // Redis unreachable — the audit row never even got queued. Log + report:
    // a missing admin-action trail is a compliance gap, not just noise.
    getLogger().error({ err, action: input.action }, '[audit] failed to enqueue log');
    reportError(err, { scope: 'audit.enqueue', action: input.action });
  }
}
