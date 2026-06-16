import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import type { CreateReviewInput, ReviewDto } from '@movesook/shared';

// Customer review of the driver after a delivered job.
// HTTP routing lives in apps/api/src/routes/jobs.ts.

/** USER reviews the driver after a job is DELIVERED (one review per job). */
export async function createReview(
  sub: string,
  jobId: string,
  input: CreateReviewInput,
): Promise<ReviewDto> {
  const { rating, comment } = input;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { customer: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  // Only the user who owns the job's customer record may review it.
  if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
  if (job.status !== 'DELIVERED') {
    throw new HTTPException(422, { message: 'Can only review delivered jobs' });
  }
  if (!job.driverId) throw new HTTPException(422, { message: 'Job has no driver' });

  const existing = await prisma.review.findUnique({ where: { jobId } });
  if (existing) throw new HTTPException(409, { message: 'Already reviewed' });

  const driverId = job.driverId;
  // Create the review and recompute the driver's denormalised rating in one tx.
  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: { jobId, customerId: sub, driverId, rating, comment: comment ?? null },
    });
    const agg = await tx.review.aggregate({
      where: { driverId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.driver.update({
      where: { id: driverId },
      data: {
        ratingAvg: Number((agg._avg.rating ?? 0).toFixed(2)),
        ratingCount: agg._count._all,
      },
    });
    return created;
  });

  return {
    id: review.id,
    jobId: review.jobId,
    customerId: review.customerId,
    driverId: review.driverId,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt.toISOString(),
  };
}
