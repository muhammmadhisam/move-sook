import { prisma } from '@movesook/db';
import type {
  AdminAnalyticsQuery,
  AdminAnalyticsResponse,
  AnalyticsDayPoint,
  SupplyDemandResponse,
  SupplyDemandRow,
  SupplyDemandGap,
  RetentionResponse,
  RetentionMonthPoint,
  JobStatus,
} from '@movesook/shared';

/** Analytics (time series + funnel + leaderboard). */
export async function getAnalytics(
  q: AdminAnalyticsQuery,
): Promise<AdminAnalyticsResponse> {
  const { days } = q;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;

  const [jobs, txns, newDrivers, newCustomers, funnelGroup, topRaw] = await Promise.all([
    prisma.job.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true, status: true } }),
    prisma.transaction.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true, commissionAmount: true },
    }),
    prisma.driver.count({ where: { createdAt: { gte: start } } }),
    prisma.customer.count({ where: { createdAt: { gte: start } } }),
    prisma.job.groupBy({ by: ['status'], where: { createdAt: { gte: start } }, _count: { _all: true } }),
    prisma.transaction.groupBy({
      by: ['driverId'],
      // Exclude COD commission rows (driverId null) — the leaderboard ranks drivers.
      where: { createdAt: { gte: start }, driverId: { not: null } },
      _sum: { netToDriver: true },
      _count: { _all: true },
      orderBy: { _sum: { netToDriver: 'desc' } },
      take: 5,
    }),
  ]);

  // Seed an ordered day-by-day map.
  const points = new Map<string, AnalyticsDayPoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    points.set(fmt(d), {
      date: fmt(d),
      jobsCreated: 0,
      jobsDelivered: 0,
      jobsCancelled: 0,
      revenue: 0,
    });
  }
  for (const j of jobs) {
    const p = points.get(fmt(j.createdAt));
    if (!p) continue;
    p.jobsCreated += 1;
    if (j.status === 'DELIVERED') p.jobsDelivered += 1;
    if (j.status === 'CANCELLED') p.jobsCancelled += 1;
  }
  for (const t of txns) {
    const p = points.get(fmt(t.createdAt));
    if (p) p.revenue += t.commissionAmount;
  }

  const countOf = (statuses: JobStatus[]) =>
    funnelGroup.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count._all, 0);

  // The `driverId: { not: null }` filter above guarantees non-null, but the groupBy
  // result type stays `string | null` — narrow it once here.
  const rankedDrivers = topRaw.filter(
    (t): t is (typeof topRaw)[number] & { driverId: string } => t.driverId !== null,
  );
  const topIds = rankedDrivers.map((t) => t.driverId);
  const topInfo = await prisma.driver.findMany({
    where: { id: { in: topIds } },
    include: { user: { select: { displayName: true } } },
  });
  const infoMap = new Map(topInfo.map((d) => [d.id, d]));

  return {
    series: [...points.values()],
    funnel: {
      posted: funnelGroup.reduce((n, g) => n + g._count._all, 0),
      accepted: countOf(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']),
      delivered: countOf(['DELIVERED']),
      cancelled: countOf(['CANCELLED']),
    },
    newDrivers,
    newCustomers,
    topDrivers: rankedDrivers.map((t) => {
      const d = infoMap.get(t.driverId);
      return {
        driverId: t.driverId,
        name: d?.user?.displayName ?? null,
        delivered: t._count._all,
        earnings: t._sum.netToDriver ?? 0,
        ratingAvg: d?.ratingAvg ?? 0,
      };
    }),
  };
}

/**
 * Marketplace liquidity by province: open (POSTED, unassigned) demand vs
 * available approved-driver supply.
 */
export async function getSupplyDemand(): Promise<SupplyDemandResponse> {
  const [openByProvince, availByProvince, approvedByProvince] = await Promise.all([
    prisma.job.groupBy({
      by: ['originProvince'],
      where: { status: 'POSTED', driverId: null },
      _count: { _all: true },
    }),
    prisma.driver.groupBy({
      by: ['serviceProvince'],
      where: { verifyStatus: 'APPROVED', isAvailable: true, serviceProvince: { not: null } },
      _count: { _all: true },
    }),
    prisma.driver.groupBy({
      by: ['serviceProvince'],
      where: { verifyStatus: 'APPROVED', serviceProvince: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const open = new Map(openByProvince.map((r) => [r.originProvince, r._count._all]));
  const avail = new Map(
    availByProvince.map((r) => [r.serviceProvince as string, r._count._all]),
  );
  const approved = new Map(
    approvedByProvince.map((r) => [r.serviceProvince as string, r._count._all]),
  );
  const provinces = new Set<string>([...open.keys(), ...avail.keys(), ...approved.keys()]);

  const classify = (openJobs: number, availableDrivers: number): SupplyDemandGap => {
    if (openJobs === 0) return availableDrivers > 0 ? 'OVERSUPPLIED' : 'BALANCED';
    if (availableDrivers === 0) return 'UNDERSERVED'; // demand with zero supply
    const ratio = openJobs / availableDrivers;
    if (ratio >= 2) return 'UNDERSERVED';
    if (ratio <= 0.5) return 'OVERSUPPLIED';
    return 'BALANCED';
  };

  const rows: SupplyDemandRow[] = [...provinces]
    .map((province) => {
      const openJobs = open.get(province) ?? 0;
      const availableDrivers = avail.get(province) ?? 0;
      return {
        province,
        openJobs,
        availableDrivers,
        approvedDrivers: approved.get(province) ?? 0,
        ratio: availableDrivers > 0 ? Number((openJobs / availableDrivers).toFixed(2)) : null,
        gap: classify(openJobs, availableDrivers),
      };
    })
    // Worst gaps first: most unmet demand at the top.
    .sort((a, b) => b.openJobs - a.openJobs - (b.availableDrivers - a.availableDrivers));

  return {
    rows,
    totals: {
      openJobs: rows.reduce((n, r) => n + r.openJobs, 0),
      availableDrivers: rows.reduce((n, r) => n + r.availableDrivers, 0),
      underserved: rows.filter((r) => r.gap === 'UNDERSERVED').length,
    },
  };
}

/**
 * Marketplace health: do customers come back, and do drivers stay active
 * month over month? Delivery time = Transaction.createdAt (commission ledger).
 */
export async function getRetention(): Promise<RetentionResponse> {
  const now = new Date();
  const startOfMonth = (monthsAgo: number) =>
    new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const monthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthStart = startOfMonth(0);
  const lastMonthStart = startOfMonth(1);
  const windowStart = startOfMonth(5); // trailing 6 months

  const [deliveredByCustomer, windowTxns] = await Promise.all([
    // All-time delivered jobs per customer → repeat-customer rate.
    prisma.job.groupBy({
      by: ['customerId'],
      where: { status: 'DELIVERED' },
      _count: { _all: true },
    }),
    // Trailing-window deliveries with their customer → monthly cohort + driver retention.
    prisma.transaction.findMany({
      where: { createdAt: { gte: windowStart } },
      select: { createdAt: true, driverId: true, job: { select: { customerId: true } } },
    }),
  ]);

  const withDelivered = deliveredByCustomer.length;
  const repeat = deliveredByCustomer.filter((g) => g._count._all >= 2).length;

  // Driver month-over-month retention from delivery timestamps.
  const driversThis = new Set<string>();
  const driversLast = new Set<string>();
  for (const t of windowTxns) {
    if (!t.driverId) continue; // COD commission rows have no driver
    if (t.createdAt >= thisMonthStart) driversThis.add(t.driverId);
    else if (t.createdAt >= lastMonthStart) driversLast.add(t.driverId);
  }
  const retained = [...driversLast].filter((id) => driversThis.has(id)).length;

  // Monthly cohort: per month, active customers and how many had delivered before.
  const firstSeen = new Map<string, Date>(); // customer → earliest delivery in window
  for (const t of windowTxns) {
    const cid = t.job.customerId;
    const prev = firstSeen.get(cid);
    if (!prev || t.createdAt < prev) firstSeen.set(cid, t.createdAt);
  }
  const monthlyMap = new Map<string, { active: Set<string>; repeat: Set<string> }>();
  for (let i = 5; i >= 0; i--) {
    monthlyMap.set(monthKey(startOfMonth(i)), { active: new Set(), repeat: new Set() });
  }
  for (const t of windowTxns) {
    const key = monthKey(t.createdAt);
    const bucket = monthlyMap.get(key);
    if (!bucket) continue;
    const cid = t.job.customerId;
    bucket.active.add(cid);
    const first = firstSeen.get(cid);
    if (first && first < new Date(t.createdAt.getFullYear(), t.createdAt.getMonth(), 1)) {
      bucket.repeat.add(cid);
    }
  }
  const monthly: RetentionMonthPoint[] = [...monthlyMap.entries()].map(([month, v]) => ({
    month,
    activeCustomers: v.active.size,
    repeatCustomers: v.repeat.size,
  }));

  return {
    customers: {
      withDelivered,
      repeat,
      repeatRate: withDelivered > 0 ? Number((repeat / withDelivered).toFixed(3)) : 0,
    },
    drivers: {
      activeThisMonth: driversThis.size,
      activeLastMonth: driversLast.size,
      retained,
      retentionRate: driversLast.size > 0 ? Number((retained / driversLast.size).toFixed(3)) : 0,
    },
    monthly,
  };
}
