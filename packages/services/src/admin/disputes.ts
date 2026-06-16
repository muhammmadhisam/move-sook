import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import {
  pageArgs,
  orderByOf,
  writeAudit,
  notify,
} from '@movesook/services/support';
import type {
  AdminListDisputesQuery,
  AdminResolveDisputeInput,
  DisputeDto,
} from '@movesook/shared';

export type DisputeListResponse = {
  items: DisputeDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** Disputes (list). */
export async function listDisputes(q: AdminListDisputesQuery): Promise<DisputeListResponse> {
  const where = q.status ? { status: q.status } : {};
  const [rows, total] = await Promise.all([
    prisma.dispute.findMany({
      where,
      orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'status', 'reason'], 'createdAt'),
      ...pageArgs(q),
    }),
    prisma.dispute.count({ where }),
  ]);
  const items: DisputeDto[] = rows.map((d) => ({
    id: d.id,
    jobId: d.jobId,
    raisedById: d.raisedById,
    reason: d.reason,
    detail: d.detail,
    status: d.status,
    resolution: d.resolution,
    resolvedById: d.resolvedById,
    resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Resolve / reject a dispute (optionally refund the job's transaction). */
export async function resolveDispute(
  sub: string,
  id: string,
  input: AdminResolveDisputeInput,
): Promise<DisputeDto> {
  const { status, resolution, refund } = input;
  const actorId = sub;
  const dispute = await prisma.dispute.findUnique({ where: { id } });
  if (!dispute) throw new HTTPException(404, { message: 'Dispute not found' });

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.dispute.update({
      where: { id },
      data: {
        status,
        resolution: resolution ?? null,
        resolvedById: actorId,
        resolvedAt: new Date(),
      },
    });
    if (refund) {
      await tx.transaction.updateMany({
        where: { jobId: dispute.jobId },
        data: { status: 'REFUNDED' },
      });
    }
    return d;
  });
  await writeAudit({
    actorId,
    action: 'dispute.resolve',
    targetType: 'job',
    targetId: dispute.jobId,
    metadata: { disputeId: id, status, refund: refund ?? false },
  });
  if (dispute.raisedById) {
    await notify({
      userId: dispute.raisedById,
      type: 'DISPUTE',
      title: 'อัปเดตข้อร้องเรียน',
      body: status === 'RESOLVED' ? 'ข้อร้องเรียนได้รับการแก้ไขแล้ว' : 'ข้อร้องเรียนถูกปฏิเสธ',
      jobId: dispute.jobId,
    });
  }
  return {
    id: updated.id,
    jobId: updated.jobId,
    raisedById: updated.raisedById,
    reason: updated.reason,
    detail: updated.detail,
    status: updated.status,
    resolution: updated.resolution,
    resolvedById: updated.resolvedById,
    resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
    createdAt: updated.createdAt.toISOString(),
  };
}
