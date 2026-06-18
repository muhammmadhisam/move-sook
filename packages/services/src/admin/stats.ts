import { prisma } from '@movesook/db';
import {
  getSystemSettings,
  cached,
  CACHE_TTL,
} from '@movesook/services/support';
import type {
  AdminStatsResponse,
  DriverQueueResponse,
  JobStatus,
} from '@movesook/shared';

const JOB_STATUSES: JobStatus[] = [
  'DRAFT',
  'POSTED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
];

/** Dashboard numbers. Cached briefly so the dashboard load doesn't re-aggregate. */
export function getStats(): Promise<AdminStatsResponse> {
  return cached('stats', CACHE_TTL.stats, computeStats);
}

async function computeStats(): Promise<AdminStatsResponse> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    grouped,
    jobsToday,
    pendingDrivers,
    pendingPaymentReview,
    openDisputes,
    pendingDestChanges,
    slipRejectionEscalations,
    delivered,
  ] = await Promise.all([
    prisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.job.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.driver.count({ where: { verifyStatus: 'PENDING' } }),
    // Slips uploaded by customers that are sitting in the queue waiting for an admin
    // to approve/reject — the actionable subset of PENDING_PAYMENT.
    prisma.job.count({ where: { status: 'PENDING_PAYMENT', paymentSlipUrl: { not: null } } }),
    prisma.dispute.count({ where: { status: 'OPEN' } }),
    // Destination-change requests awaiting an admin: either the request itself
    // (REQUESTED) or the uploaded fee slip (PENDING_REVIEW).
    prisma.job.count({ where: { destChangeStatus: { in: ['REQUESTED', 'PENDING_REVIEW'] } } }),
    // Jobs whose payment slip has been rejected repeatedly — flagged for escalation.
    prisma.job.count({ where: { paymentRejectedCount: { gte: 3 } } }),
    prisma.job.findMany({
      where: { status: 'DELIVERED', priceQuoted: { not: null }, commissionPct: { not: null } },
      select: { priceQuoted: true, commissionPct: true },
    }),
  ]);

  const jobsByStatus = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<
    JobStatus,
    number
  >;
  let posted = 0;
  let acceptedOrBeyond = 0;
  for (const g of grouped) {
    jobsByStatus[g.status] = g._count._all;
  }
  posted = grouped
    .filter((g) => g.status === 'POSTED')
    .reduce((n, g) => n + g._count._all, 0);
  acceptedOrBeyond = grouped
    .filter((g) => ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(g.status))
    .reduce((n, g) => n + g._count._all, 0);

  const commissionRevenue = delivered.reduce(
    (sum, j) => sum + (j.priceQuoted ?? 0) * ((j.commissionPct ?? 0) / 100),
    0,
  );
  const denom = posted + acceptedOrBeyond;
  const fillRate = denom > 0 ? acceptedOrBeyond / denom : 0;

  return {
    jobsToday,
    jobsByStatus,
    commissionRevenue: Math.round(commissionRevenue),
    fillRate: Number(fillRate.toFixed(3)),
    openJobs: jobsByStatus.POSTED,
    pendingDrivers,
    pendingPaymentReview,
    openDisputes,
    pendingDestChanges,
    slipRejectionEscalations,
  };
}

/**
 * Onboarding funnel: pending applications ordered by how long they've waited,
 * so ops can clear them within the verify SLA and stop applicants dropping off.
 */
export async function getDriverQueue(): Promise<DriverQueueResponse> {
  const rows = await prisma.driver.findMany({
    where: { verifyStatus: 'PENDING' },
    include: { user: { select: { displayName: true } } },
  });
  const slaHours = (await getSystemSettings()).verifySlaHours;
  const now = Date.now();
  const slaMs = slaHours * 60 * 60 * 1000;
  const items = rows
    .map((d) => {
      // Fall back to record creation if the driver never explicitly submitted.
      const anchor = d.submittedAt ?? d.createdAt;
      const waitedMs = now - anchor.getTime();
      return {
        id: d.id,
        displayName: d.user?.displayName ?? d.name,
        phone: d.phone,
        vehicleType: d.vehicleType,
        serviceProvince: d.serviceProvince,
        submittedAt: d.submittedAt ? d.submittedAt.toISOString() : null,
        waitingHours: Math.max(0, Math.round((waitedMs / (60 * 60 * 1000)) * 10) / 10),
        slaBreached: waitedMs > slaMs,
        hasKyc: Boolean(d.nationalId && d.licenseNo),
      };
    })
    // Longest-waiting first — that's the queue an admin should drain top-down.
    .sort((a, b) => b.waitingHours - a.waitingHours);
  return {
    items,
    slaHours,
    breachedCount: items.filter((i) => i.slaBreached).length,
  };
}
