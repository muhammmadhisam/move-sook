import { z } from 'zod';

// GET /admin/analytics?days=30
export const AdminAnalyticsQuery = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});
export type AdminAnalyticsQuery = z.infer<typeof AdminAnalyticsQuery>;

export const AnalyticsDayPoint = z.object({
  date: z.string(), // YYYY-MM-DD
  jobsCreated: z.number().int(),
  jobsDelivered: z.number().int(),
  jobsCancelled: z.number().int(),
  revenue: z.number().int(), // commission revenue from jobs delivered that day (THB)
});
export type AnalyticsDayPoint = z.infer<typeof AnalyticsDayPoint>;

export const AnalyticsTopDriver = z.object({
  driverId: z.string(),
  name: z.string().nullable(),
  delivered: z.number().int(),
  earnings: z.number().int(), // net to driver (THB)
  ratingAvg: z.number(),
});
export type AnalyticsTopDriver = z.infer<typeof AnalyticsTopDriver>;

export const AdminAnalyticsResponse = z.object({
  series: z.array(AnalyticsDayPoint),
  funnel: z.object({
    posted: z.number().int(),
    accepted: z.number().int(),
    delivered: z.number().int(),
    cancelled: z.number().int(),
  }),
  newDrivers: z.number().int(),
  newCustomers: z.number().int(),
  topDrivers: z.array(AnalyticsTopDriver),
});
export type AdminAnalyticsResponse = z.infer<typeof AdminAnalyticsResponse>;

// GET /admin/analytics/supply-demand — per-province marketplace liquidity.
// Compares open (POSTED, unassigned) demand against available approved-driver
// supply so ops can target acquisition where the gap is worst.
export const SupplyDemandGap = z.enum(['UNDERSERVED', 'BALANCED', 'OVERSUPPLIED']);
export type SupplyDemandGap = z.infer<typeof SupplyDemandGap>;

export const SupplyDemandRow = z.object({
  province: z.string(),
  openJobs: z.number().int(), // POSTED & unassigned right now
  availableDrivers: z.number().int(), // APPROVED & isAvailable in this service province
  approvedDrivers: z.number().int(), // APPROVED total (capacity ceiling)
  ratio: z.number().nullable(), // openJobs / availableDrivers (null when no available drivers)
  gap: SupplyDemandGap,
});
export type SupplyDemandRow = z.infer<typeof SupplyDemandRow>;

export const SupplyDemandResponse = z.object({
  rows: z.array(SupplyDemandRow),
  totals: z.object({
    openJobs: z.number().int(),
    availableDrivers: z.number().int(),
    underserved: z.number().int(), // count of provinces flagged UNDERSERVED
  }),
});
export type SupplyDemandResponse = z.infer<typeof SupplyDemandResponse>;

// GET /admin/analytics/retention — marketplace health: do customers come back,
// and do drivers stay active month over month?
export const RetentionMonthPoint = z.object({
  month: z.string(), // YYYY-MM
  activeCustomers: z.number().int(), // distinct customers with a delivered job that month
  repeatCustomers: z.number().int(), // of those, who had a delivered job in a prior month too
});
export type RetentionMonthPoint = z.infer<typeof RetentionMonthPoint>;

export const RetentionResponse = z.object({
  customers: z.object({
    withDelivered: z.number().int(), // customers with >=1 delivered job
    repeat: z.number().int(), // customers with >=2 delivered jobs
    repeatRate: z.number(), // repeat / withDelivered (0..1)
  }),
  drivers: z.object({
    activeThisMonth: z.number().int(), // delivered >=1 this calendar month
    activeLastMonth: z.number().int(),
    retained: z.number().int(), // active both last and this month
    retentionRate: z.number(), // retained / activeLastMonth (0..1)
  }),
  monthly: z.array(RetentionMonthPoint), // trailing months, oldest first
});
export type RetentionResponse = z.infer<typeof RetentionResponse>;

// GET /admin/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD — period business
// report. Financials come from the Transaction ledger (one row per delivered
// job); job counts/growth come from createdAt within the range. `from`/`to` are
// inclusive calendar days; omit for a trailing-30-day default.
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ต้องเป็นรูปแบบ YYYY-MM-DD');

export const AdminReportQuery = z.object({
  from: isoDay.optional(),
  to: isoDay.optional(),
});
export type AdminReportQuery = z.infer<typeof AdminReportQuery>;

// One aggregated row keyed by province or vehicle type.
export const ReportBreakdownRow = z.object({
  key: z.string(), // province name or vehicle-type enum value
  jobs: z.number().int(), // delivered jobs in range
  gmv: z.number().int(), // sum of grossAmount (THB)
  commission: z.number().int(), // platform commission (THB)
});
export type ReportBreakdownRow = z.infer<typeof ReportBreakdownRow>;

export const ReportSummaryResponse = z.object({
  range: z.object({ from: z.string(), to: z.string() }), // resolved YYYY-MM-DD bounds
  financial: z.object({
    gmv: z.number().int(), // total delivered job value (THB)
    commissionRevenue: z.number().int(), // platform cut (THB)
    netToDrivers: z.number().int(), // paid out to drivers (THB)
    transactions: z.number().int(), // delivered jobs / ledger rows
    avgTicket: z.number().int(), // gmv / transactions (THB)
  }),
  jobs: z.object({
    created: z.number().int(),
    delivered: z.number().int(),
    cancelled: z.number().int(),
    completionRate: z.number(), // delivered / created (0..1)
  }),
  growth: z.object({
    newDrivers: z.number().int(),
    newCustomers: z.number().int(),
  }),
  byProvince: z.array(ReportBreakdownRow), // top origin provinces by GMV
  byVehicleType: z.array(ReportBreakdownRow),
});
export type ReportSummaryResponse = z.infer<typeof ReportSummaryResponse>;

// GET /admin/reports/export — streams a CSV of one dataset within the range.
export const ReportExportType = z.enum(['transactions', 'jobs', 'drivers']);
export type ReportExportType = z.infer<typeof ReportExportType>;

export const AdminReportExportQuery = z.object({
  type: ReportExportType,
  from: isoDay.optional(),
  to: isoDay.optional(),
});
export type AdminReportExportQuery = z.infer<typeof AdminReportExportQuery>;
