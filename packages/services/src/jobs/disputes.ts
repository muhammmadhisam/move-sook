import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import type { CreateDisputeInput, DisputeDto } from '@movesook/shared';

// A party to the job (customer or assigned driver) raises a dispute.
// HTTP routing lives in apps/api/src/routes/jobs.ts.

/** A party to the job (customer or assigned driver) raises a dispute. */
export async function createDispute(
  sub: string,
  jobId: string,
  input: CreateDisputeInput,
): Promise<DisputeDto> {
  const { reason, detail } = input;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { customer: { select: { userId: true } }, driver: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  const isParty = job.customer.userId === sub || job.driver?.userId === sub;
  if (!isParty) throw new HTTPException(403, { message: 'Not your job' });
  // Disputes only make sense once a driver is involved — matches the UI's
  // DISPUTABLE set (ACCEPTED → DELIVERED).
  if (!job.driverId) {
    throw new HTTPException(422, { message: 'งานนี้ยังไม่มีคนขับ จึงยังแจ้งปัญหาไม่ได้' });
  }

  const dispute = await prisma.dispute.create({
    data: { jobId, raisedById: sub, reason, detail: detail ?? null },
  });
  return {
    id: dispute.id,
    jobId: dispute.jobId,
    raisedById: dispute.raisedById,
    reason: dispute.reason,
    detail: dispute.detail,
    status: dispute.status,
    resolution: dispute.resolution,
    resolvedById: dispute.resolvedById,
    resolvedAt: dispute.resolvedAt ? dispute.resolvedAt.toISOString() : null,
    createdAt: dispute.createdAt.toISOString(),
  };
}
