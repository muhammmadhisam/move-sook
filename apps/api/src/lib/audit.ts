import { prisma, type Prisma } from '@movesook/db';

export type AuditTargetType = 'user' | 'driver' | 'job' | 'transaction' | 'setting';

type AuditInput = {
  actorId: string; // the admin User.id performing the action
  action: string; // e.g. "driver.verify", "user.ban"
  targetType: AuditTargetType;
  targetId: string;
  metadata?: Prisma.InputJsonValue; // decision details / before-after snapshot
};

/**
 * Append an immutable audit-trail row. Best-effort: a logging failure must never
 * roll back or 500 the admin action that already succeeded.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });
  } catch (err) {
    console.error('[audit] failed to write log', input.action, err);
  }
}
