import { prisma } from '@movesook/db';
import { cached, CACHE_TTL } from '@movesook/services/support';
import type {
  AdminReportQuery,
  AdminReportExportQuery,
  ReportSummaryResponse,
  ReportBreakdownRow,
  JobStatus,
} from '@movesook/shared';

/**
 * Resolve a report's `{ from?, to? }` query into inclusive day bounds. Missing
 * values default to a trailing 30-day window ending today.
 */
function resolveReportRange(q: { from?: string; to?: string }) {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const toDay = q.to ? new Date(`${q.to}T00:00:00`) : new Date();
  const fromDay = q.from ? new Date(`${q.from}T00:00:00`) : new Date(toDay);
  if (!q.from) fromDay.setDate(toDay.getDate() - 29);

  const start = new Date(fromDay);
  start.setHours(0, 0, 0, 0);
  const end = new Date(toDay);
  end.setHours(23, 59, 59, 999);

  return {
    from: { start, label: fmt(start) },
    to: { end, label: fmt(end) },
  };
}

/** Render a 2-D string matrix as RFC-4180 CSV (quote fields with , " or \n). */
function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/**
 * Period business report. Financials come from the Transaction ledger; job counts
 * and growth come from createdAt within the range. Defaults to a trailing 30 days.
 */
export function getReportSummary(q: AdminReportQuery): Promise<ReportSummaryResponse> {
  // Key by the resolved day bounds so each distinct range caches independently.
  const { from, to } = resolveReportRange(q);
  return cached(`report:${from.label}:${to.label}`, CACHE_TTL.reports, () =>
    computeReportSummary(q),
  );
}

async function computeReportSummary(q: AdminReportQuery): Promise<ReportSummaryResponse> {
  const { from, to } = resolveReportRange(q);

  const txnWhere = { createdAt: { gte: from.start, lte: to.end } };
  const jobWhere = { createdAt: { gte: from.start, lte: to.end } };

  const [txns, jobGroup, newDrivers, newCustomers] = await Promise.all([
    prisma.transaction.findMany({
      where: txnWhere,
      select: {
        grossAmount: true,
        commissionAmount: true,
        netToDriver: true,
        job: { select: { originProvince: true, vehicleType: true } },
      },
    }),
    prisma.job.groupBy({ by: ['status'], where: jobWhere, _count: { _all: true } }),
    prisma.driver.count({ where: { createdAt: { gte: from.start, lte: to.end } } }),
    prisma.customer.count({ where: { createdAt: { gte: from.start, lte: to.end } } }),
  ]);

  let gmv = 0;
  let commissionRevenue = 0;
  let netToDrivers = 0;
  const byProvince = new Map<string, ReportBreakdownRow>();
  const byVehicle = new Map<string, ReportBreakdownRow>();
  const bump = (map: Map<string, ReportBreakdownRow>, key: string, t: (typeof txns)[number]) => {
    const row = map.get(key) ?? { key, jobs: 0, gmv: 0, commission: 0 };
    row.jobs += 1;
    row.gmv += t.grossAmount;
    row.commission += t.commissionAmount;
    map.set(key, row);
  };
  for (const t of txns) {
    gmv += t.grossAmount;
    commissionRevenue += t.commissionAmount;
    netToDrivers += t.netToDriver;
    bump(byProvince, t.job.originProvince, t);
    bump(byVehicle, t.job.vehicleType, t);
  }

  const countOf = (statuses: JobStatus[]) =>
    jobGroup.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  const created = jobGroup.reduce((n, g) => n + g._count._all, 0);
  const delivered = countOf(['DELIVERED']);
  const cancelled = countOf(['CANCELLED']);
  const transactions = txns.length;

  return {
    range: { from: from.label, to: to.label },
    financial: {
      gmv,
      commissionRevenue,
      netToDrivers,
      transactions,
      avgTicket: transactions > 0 ? Math.round(gmv / transactions) : 0,
    },
    jobs: {
      created,
      delivered,
      cancelled,
      completionRate: created > 0 ? Number((delivered / created).toFixed(3)) : 0,
    },
    growth: { newDrivers, newCustomers },
    byProvince: [...byProvince.values()].sort((a, b) => b.gmv - a.gmv),
    byVehicleType: [...byVehicle.values()].sort((a, b) => b.gmv - a.gmv),
  };
}

/**
 * CSV export of a single dataset within the range. Returns the CSV text (no BOM)
 * plus the download filename; the route sets headers + prepends the BOM.
 */
export async function exportReport(
  q: AdminReportExportQuery,
): Promise<{ csv: string; filename: string }> {
  const { type } = q;
  const { from, to } = resolveReportRange(q);
  const range = { gte: from.start, lte: to.end };

  let rows: string[][];
  let header: string[];
  if (type === 'transactions') {
    header = ['date', 'jobId', 'driver', 'province', 'gross', 'commissionPct', 'commission', 'netToDriver', 'status'];
    const txns = await prisma.transaction.findMany({
      where: { createdAt: range },
      orderBy: { createdAt: 'desc' },
      include: {
        driver: { include: { user: { select: { displayName: true } } } },
        job: { select: { originProvince: true } },
      },
    });
    rows = txns.map((t) => [
      t.createdAt.toISOString(),
      t.jobId,
      t.driver?.user?.displayName ?? '',
      t.job.originProvince,
      String(t.grossAmount),
      String(t.commissionPct),
      String(t.commissionAmount),
      String(t.netToDriver),
      t.status,
    ]);
  } else if (type === 'jobs') {
    header = ['date', 'jobId', 'status', 'vehicleType', 'originProvince', 'destProvince', 'priceQuoted', 'commissionPct', 'driverId'];
    const jobs = await prisma.job.findMany({
      where: { createdAt: range },
      orderBy: { createdAt: 'desc' },
    });
    rows = jobs.map((j) => [
      j.createdAt.toISOString(),
      j.id,
      j.status,
      j.vehicleType,
      j.originProvince,
      j.destProvince,
      String(j.priceQuoted ?? ''),
      String(j.commissionPct ?? ''),
      j.driverId ?? '',
    ]);
  } else {
    header = ['joinedAt', 'driverId', 'name', 'serviceProvince', 'verifyStatus', 'ratingAvg', 'ratingCount', 'isAvailable'];
    const drivers = await prisma.driver.findMany({
      where: { createdAt: range },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true } } },
    });
    rows = drivers.map((d) => [
      d.createdAt.toISOString(),
      d.id,
      d.user?.displayName ?? '',
      d.serviceProvince ?? '',
      d.verifyStatus,
      String(d.ratingAvg),
      String(d.ratingCount),
      String(d.isAvailable),
    ]);
  }

  const csv = toCsv([header, ...rows]);
  const filename = `movesook-${type}-${from.label}_${to.label}.csv`;
  return { csv, filename };
}
