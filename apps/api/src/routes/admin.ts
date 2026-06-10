import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { prisma, type Prisma } from '@movesook/db';
import {
  AdminBanUserInput,
  AdminListDriversQuery,
  AdminListJobsQuery,
  AdminListUsersQuery,
  AdminListAuditLogsQuery,
  AdminListAdminsQuery,
  AdminListCustomersQuery,
  AdminCreateCustomerInput,
  AdminCreateDriverInput,
  AdminConnectDriverInput,
  AdminCreateJobInput,
  AdminPatchJobInput,
  AdminRejectPaymentInput,
  AdminVerifyDriverInput,
  AdminListTransactionsQuery,
  AdminUpdateTransactionInput,
  AdminListDisputesQuery,
  AdminResolveDisputeInput,
  AdminListPayoutsQuery,
  AdminCreatePayoutInput,
  AdminMarkPayoutPaidInput,
  AdminUpdateDriverBankInput,
  AdminAnalyticsQuery,
  AdminReportQuery,
  AdminReportExportQuery,
  AdminInviteInput,
  RecordConsentInput,
  AdminSetServiceAreaInput,
  AdminUpsertVehiclePricingInput,
  UpdateSystemSettingsInput,
  UpdateCommissionInput,
  UpdatePricingInput,
  AdminUpdateDriverKycInput,
  AdminListBlacklistQuery,
  AdminCreateBlacklistInput,
  AdminListPromosQuery,
  AdminCreatePromoInput,
  AdminUpdatePromoInput,
  AddCustomerNoteInput,
  AdminUpdateCustomerInput,
  computeDiscount,
  canTransition,
  type AdminStatsResponse,
  type DriverQueueResponse,
  type SupplyDemandResponse,
  type SupplyDemandRow,
  type SupplyDemandGap,
  type RetentionResponse,
  type RetentionMonthPoint,
  type AdminUserDetailResponse,
  type AdminDriverDetailResponse,
  type AdminUserListItem,
  type AdminJobListItem,
  type AdminJobDetailResponse,
  type AdminCustomerDetailResponse,
  type AdminWhoamiResponse,
  type AdminListItem,
  type AdminAnalyticsResponse,
  type AnalyticsDayPoint,
  type ReportSummaryResponse,
  type ReportBreakdownRow,
  type AuditLogDto,
  type CommissionSettingResponse,
  type PricingSettingResponse,
  type ConsentDto,
  type UserDataExport,
  type ServiceAreaDto,
  type VehiclePricingDto,
  type SystemSettingsResponse,
  type CustomerDto,
  type CustomerNoteDto,
  type BlacklistDto,
  type PromoCodeDto,
  type DisputeDto,
  type DriverDto,
  type DriverVerifyStatus,
  type JobStatus,
  type PayoutDto,
  type ReviewDto,
  type TransactionDto,
} from '@movesook/shared';
import { hashPassword } from '@movesook/auth';
import type { AppEnv } from '../lib/context';
import { authenticate, requireRole, requireAdminRole } from '../middleware/auth';
import { toJobDto, toDriverDto, toCustomerDto } from '../lib/serialize';
import { pageArgs, orderByOf } from '../lib/paginate';
import {
  getCommissionPct,
  setCommissionPct,
  getPricePerKm,
  setPricePerKm,
  getFloorSurcharge,
  setFloorSurcharge,
  getHelperSurcharge,
  setHelperSurcharge,
  getSurgeEnabled,
  setSurgeEnabled,
  getSurgeMultiplier,
  setSurgeMultiplier,
  getSystemSettings,
  updateSystemSettings,
  isVehicleTypeActive,
} from '../lib/settings';
import { writeAudit } from '../lib/audit';
import { notify, notifyAdmins, notifyNewJobToArea } from '../lib/notify';
import { createDeliveryTransaction } from '../lib/transactions';
import { buildJobDocument, type DocType } from '../lib/pdf';
import { maybeIssueReferralReward } from '../lib/referral';

const JOB_STATUSES: JobStatus[] = [
  'DRAFT',
  'POSTED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
];

const VERIFY_STATUS: Record<'APPROVE' | 'REJECT' | 'SUSPEND', DriverVerifyStatus> = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  SUSPEND: 'SUSPENDED',
};

/**
 * Resolve a report's `{ from?, to? }` query into inclusive day bounds. Missing
 * values default to a trailing 30-day window ending today. `start` is 00:00 of
 * the from-day, `end` is 23:59:59.999 of the to-day, and `label` is the
 * YYYY-MM-DD echoed back to the client.
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
  const cell = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

// Every route in this group requires a valid ADMIN session (admin cookie).
export const adminRoutes = new Hono<AppEnv>()
  .use('*', authenticate('admin'), requireRole('ADMIN'))

  // Dashboard numbers.
  .get('/stats', async (c) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [grouped, jobsToday, pendingDrivers, delivered] = await Promise.all([
      prisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.job.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.driver.count({ where: { verifyStatus: 'PENDING' } }),
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

    const body: AdminStatsResponse = {
      jobsToday,
      jobsByStatus,
      commissionRevenue: Math.round(commissionRevenue),
      fillRate: Number(fillRate.toFixed(3)),
      openJobs: jobsByStatus.POSTED,
      pendingDrivers,
    };
    return c.json(body);
  })

  // Driver verification queue.
  .get('/drivers', zValidator('query', AdminListDriversQuery), async (c) => {
    const q = c.req.valid('query');
    const where = q.status ? { verifyStatus: q.status } : {};
    const [rows, total] = await Promise.all([
      prisma.driver.findMany({
        where,
        include: { user: { select: { displayName: true } } },
        orderBy: orderByOf(
          q.sortBy,
          q.sortDir,
          ['createdAt', 'ratingAvg', 'verifyStatus', 'serviceProvince'],
          'createdAt',
        ),
        ...pageArgs(q),
      }),
      prisma.driver.count({ where }),
    ]);
    const items: DriverDto[] = rows.map((d) => toDriverDto(d, d.user?.displayName ?? null));
    return c.json({ items, total, page: q.page, pageSize: q.pageSize });
  })

  // Onboarding funnel: pending applications ordered by how long they've waited,
  // so ops can clear them within the verify SLA and stop applicants dropping off.
  .get('/drivers/queue', async (c) => {
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
    const body: DriverQueueResponse = {
      items,
      slaHours,
      breachedCount: items.filter((i) => i.slaBreached).length,
    };
    return c.json(body);
  })

  // Full driver profile: jobs accepted, reviews received, earnings.
  .get('/drivers/:id', async (c) => {
    const id = c.req.param('id');
    const driver = await prisma.driver.findUnique({
      where: { id },
      include: { user: { select: { displayName: true } } },
    });
    if (!driver) throw new HTTPException(404, { message: 'Driver not found' });
    await writeAudit({
      actorId: c.get('claims').sub,
      action: 'pii.view',
      targetType: 'driver',
      targetId: id,
    });

    const [recentJobs, reviews, txns] = await Promise.all([
      prisma.job.findMany({ where: { driverId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.review.findMany({
        where: { driverId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { customer: { select: { displayName: true } } },
      }),
      prisma.transaction.findMany({ where: { driverId: id } }),
    ]);

    const earnings = txns.reduce(
      (acc, t) => {
        acc.totalGross += t.grossAmount;
        acc.totalCommission += t.commissionAmount;
        acc.totalNet += t.netToDriver;
        if (t.status === 'PAID') acc.paidCount += 1;
        if (t.status === 'PENDING') acc.pendingCount += 1;
        return acc;
      },
      { totalGross: 0, totalCommission: 0, totalNet: 0, paidCount: 0, pendingCount: 0 },
    );

    const body: AdminDriverDetailResponse = {
      driver: toDriverDto(driver, driver.user?.displayName ?? null),
      recentJobs: recentJobs.map(toJobDto),
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        customerName: r.customer.displayName,
      })),
      earnings,
    };
    return c.json(body);
  })

  // Approve / reject / suspend a driver.
  .post(
    '/drivers/:id/verify',
    requireAdminRole('SUPER', 'OPS'),
    zValidator('json', AdminVerifyDriverInput),
    async (c) => {
      const id = c.req.param('id');
      const { decision, reason } = c.req.valid('json');
      const actorId = c.get('claims').sub;
      const driver = await prisma.driver.findUnique({ where: { id } });
      if (!driver) throw new HTTPException(404, { message: 'Driver not found' });

      const verifyStatus = VERIFY_STATUS[decision];
      const updated = await prisma.driver.update({
        where: { id },
        data: {
          verifyStatus,
          // Clear the reason on approval; store it when rejecting / suspending.
          rejectionReason: decision === 'APPROVE' ? null : (reason ?? null),
          // A suspended / rejected driver must drop out of the online feed.
          ...(decision === 'APPROVE' ? {} : { isAvailable: false }),
        },
      });
      await writeAudit({
        actorId,
        action: 'driver.verify',
        targetType: 'driver',
        targetId: id,
        metadata: { decision, from: driver.verifyStatus, to: verifyStatus, reason: reason ?? null },
      });
      const msg =
        decision === 'APPROVE'
          ? 'บัญชีคนขับของคุณได้รับการอนุมัติแล้ว เริ่มรับงานได้เลย'
          : decision === 'SUSPEND'
            ? `บัญชีคนขับถูกระงับชั่วคราว${reason ? `: ${reason}` : ''}`
            : `การสมัครคนขับไม่ผ่าน${reason ? `: ${reason}` : ''}`;
      // Only notify if the driver is linked to an app account.
      if (driver.userId) {
        await notify({
          userId: driver.userId,
          type: 'DRIVER_VERIFY',
          title: 'อัปเดตสถานะคนขับ',
          body: msg,
        });
      }
      return c.json({ id: updated.id, verifyStatus: updated.verifyStatus });
    },
  )

  // Admin pre-registers a driver (no app account yet — link later via /connect).
  .post(
    '/drivers',
    requireAdminRole('SUPER', 'OPS'),
    zValidator('json', AdminCreateDriverInput),
    async (c) => {
      const input = c.req.valid('json');
      const actorId = c.get('claims').sub;
      if (!(await isVehicleTypeActive(input.vehicleType))) {
        throw new HTTPException(422, { message: 'ประเภทรถนี้ยังไม่เปิดรับ' });
      }
      // Invite code the driver enters in the app to claim + complete this application.
      const claimCode = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
      const driver = await prisma.driver.create({
        data: {
          name: input.name,
          phone: input.phone ?? null,
          vehicleType: input.vehicleType,
          plateNumber: input.plateNumber ?? null,
          licenseTw2: input.licenseTw2 ?? null,
          serviceProvince: input.serviceProvince ?? null,
          verifyStatus: input.verifyStatus,
          bankName: input.bankName ?? null,
          bankAccountName: input.bankAccountName ?? null,
          bankAccountNo: input.bankAccountNo ?? null,
          claimCode,
        },
      });
      await writeAudit({
        actorId,
        action: 'driver.create',
        targetType: 'driver',
        targetId: driver.id,
        metadata: { name: input.name, verifyStatus: input.verifyStatus },
      });
      // Return the code so the admin can hand it to the driver.
      return c.json({ ...toDriverDto(driver, null), claimCode }, 201);
    },
  )

  // Link a pre-registered driver to a user who has since signed up.
  .post(
    '/drivers/:id/connect',
    requireAdminRole('SUPER', 'OPS'),
    zValidator('json', AdminConnectDriverInput),
    async (c) => {
      const id = c.req.param('id');
      const { userId } = c.req.valid('json');
      const actorId = c.get('claims').sub;

      const driver = await prisma.driver.findUnique({ where: { id } });
      if (!driver) throw new HTTPException(404, { message: 'Driver not found' });
      if (driver.userId) {
        throw new HTTPException(409, { message: 'Driver is already linked to a user' });
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { driver: { select: { id: true } } },
      });
      if (!user) throw new HTTPException(404, { message: 'User not found' });
      if (user.driver) {
        throw new HTTPException(409, { message: 'User already has a driver record' });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const d = await tx.driver.update({ where: { id }, data: { userId } });
        await tx.user.update({ where: { id: userId }, data: { role: 'DRIVER' } });
        return d;
      });
      await writeAudit({
        actorId,
        action: 'driver.connect',
        targetType: 'driver',
        targetId: id,
        metadata: { userId },
      });
      await notify({
        userId,
        type: 'DRIVER_VERIFY',
        title: 'เชื่อมบัญชีคนขับแล้ว',
        body: 'แอดมินได้เชื่อมบัญชีคนขับของคุณเรียบร้อยแล้ว',
      });
      return c.json(toDriverDto(updated, user.displayName));
    },
  )

  // List users (optional text search over displayName / phone).
  .get('/users', zValidator('query', AdminListUsersQuery), async (c) => {
    const q = c.req.valid('query');
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.isBanned !== undefined ? { isBanned: q.isBanned } : {}),
      ...(q.search
        ? {
            OR: [
              { displayName: { contains: q.search, mode: 'insensitive' } },
              { phone: { contains: q.search } },
            ],
          }
        : {}),
    };
    const select = {
      id: true,
      displayName: true,
      role: true,
      isBanned: true,
      phone: true,
      createdAt: true,
    } as const;
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'displayName', 'role'], 'createdAt'),
        ...pageArgs(q),
        select,
      }),
      prisma.user.count({ where }),
    ]);
    const items: AdminUserListItem[] = rows.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    }));
    return c.json({ items, total, page: q.page, pageSize: q.pageSize });
  })

  // Full user profile: driver record (if any), posted jobs, authored reviews.
  .get('/users/:id', async (c) => {
    const id = c.req.param('id');
    const user = await prisma.user.findUnique({
      where: { id },
      include: { driver: { include: { user: { select: { displayName: true } } } } },
    });
    if (!user) throw new HTTPException(404, { message: 'User not found' });
    await writeAudit({
      actorId: c.get('claims').sub,
      action: 'pii.view',
      targetType: 'user',
      targetId: id,
    });

    const [jobsAsCustomer, reviewsAuthored, grouped] = await Promise.all([
      // Jobs this user owns (via their linked Customer record).
      prisma.job.findMany({
        where: { customer: { userId: id } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      // Reviews the user authored (Review.customerId references the User/reviewer).
      prisma.review.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.job.groupBy({
        by: ['status'],
        where: { customer: { userId: id } },
        _count: { _all: true },
      }),
    ]);

    const countFor = (s: JobStatus) =>
      grouped.filter((g) => g.status === s).reduce((n, g) => n + g._count._all, 0);

    const reviews: ReviewDto[] = reviewsAuthored.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      customerId: r.customerId,
      driverId: r.driverId,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    }));

    const body: AdminUserDetailResponse = {
      user: {
        id: user.id,
        displayName: user.displayName,
        pictureUrl: user.pictureUrl,
        phone: user.phone,
        role: user.role,
        isBanned: user.isBanned,
        anonymizedAt: user.anonymizedAt ? user.anonymizedAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      },
      driver: user.driver ? toDriverDto(user.driver, user.driver.user?.displayName ?? null) : null,
      jobsAsCustomer: jobsAsCustomer.map(toJobDto),
      reviewsAuthored: reviews,
      counts: {
        jobsTotal: grouped.reduce((n, g) => n + g._count._all, 0),
        jobsDelivered: countFor('DELIVERED'),
        jobsCancelled: countFor('CANCELLED'),
      },
    };
    return c.json(body);
  })

  // List jobs (province matches origin OR dest).
  .get('/jobs', zValidator('query', AdminListJobsQuery), async (c) => {
    const q = c.req.valid('query');
    const where: Prisma.JobWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.province
        ? { OR: [{ originProvince: q.province }, { destProvince: q.province }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: orderByOf(
          q.sortBy,
          q.sortDir,
          ['createdAt', 'status', 'priceQuoted', 'originProvince'],
          'createdAt',
        ),
        ...pageArgs(q),
        include: {
          customer: { include: { user: { select: { displayName: true, phone: true } } } },
        },
      }),
      prisma.job.count({ where }),
    ]);
    const items: AdminJobListItem[] = rows.map((j) => ({
      ...toJobDto(j),
      customerName: j.customer.name ?? j.customer.user?.displayName ?? null,
      customerPhone: j.customer.phone ?? j.customer.user?.phone ?? null,
    }));
    return c.json({ items, total, page: q.page, pageSize: q.pageSize });
  })

  // Single job detail (admin).
  .get('/jobs/:id', async (c) => {
    const id = c.req.param('id');
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        customer: { include: { user: { select: { displayName: true, phone: true } } } },
        driver: { include: { user: { select: { displayName: true } } } },
      },
    });
    if (!job) throw new HTTPException(404, { message: 'Job not found' });
    const body: AdminJobDetailResponse = {
      ...toJobDto(job),
      customerName: job.customer.name ?? job.customer.user?.displayName ?? null,
      customerPhone: job.customer.phone ?? job.customer.user?.phone ?? null,
      driverName: job.driver ? (job.driver.user?.displayName ?? job.driver.name) : null,
    };
    return c.json(body);
  })

  // Admin creates a job on behalf of a customer (assign a driver now, or post open).
  .post('/jobs', requireAdminRole('SUPER', 'OPS'), zValidator('json', AdminCreateJobInput), async (c) => {
    const input = c.req.valid('json');
    const actorId = c.get('claims').sub;

    // Enforce: vehicle type must be open for joining.
    if (!(await isVehicleTypeActive(input.vehicleType))) {
      throw new HTTPException(422, { message: 'ประเภทรถนี้ยังไม่เปิดรับ' });
    }
    // Enforce active service area (if any configured) + price guards.
    const areaCount = await prisma.serviceArea.count();
    if (areaCount > 0) {
      const area = await prisma.serviceArea.findUnique({ where: { province: input.originProvince } });
      if (!area || !area.isActive) {
        throw new HTTPException(422, { message: 'จังหวัดต้นทางไม่ได้เปิดให้บริการ' });
      }
    }
    if (input.priceQuoted !== undefined) {
      const sys = await getSystemSettings();
      if (input.priceQuoted < sys.minJobPrice || input.priceQuoted > sys.maxJobPrice) {
        throw new HTTPException(422, {
          message: `ราคาต้องอยู่ระหว่าง ${sys.minJobPrice}–${sys.maxJobPrice} บาท`,
        });
      }
    }

    // Apply a promo code (if any) against the quoted price.
    let priceQuoted = input.priceQuoted ?? null;
    let discountAmount: number | null = null;
    let promoCode: string | null = null;
    if (input.promoCode && priceQuoted !== null) {
      const code = input.promoCode.trim().toUpperCase();
      const promo = await prisma.promoCode.findUnique({ where: { code } });
      const now = new Date();
      if (
        !promo ||
        !promo.isActive ||
        (promo.expiresAt && promo.expiresAt <= now) ||
        (promo.maxUses !== null && promo.usedCount >= promo.maxUses) ||
        (promo.minOrder !== null && priceQuoted < promo.minOrder)
      ) {
        throw new HTTPException(422, { message: 'โค้ดส่วนลดใช้ไม่ได้' });
      }
      discountAmount = computeDiscount(priceQuoted, promo.type, promo.value);
      priceQuoted = priceQuoted - discountAmount;
      promoCode = code;
    }

    // Resolve the customer: reuse an existing one, or record a new offline customer.
    let customerId = input.customerId;
    if (customerId) {
      const exists = await prisma.customer.findUnique({ where: { id: customerId } });
      if (!exists) throw new HTTPException(404, { message: 'Customer not found' });
    } else {
      const created = await prisma.customer.create({
        data: {
          name: input.customerName ?? null,
          phone: input.customerPhone ?? null,
          note: input.customerNote ?? null,
          createdById: actorId,
        },
      });
      customerId = created.id;
    }

    // Disposition: assign now (-> ACCEPTED, snapshot commission) or post open (-> POSTED).
    let status: JobStatus = 'POSTED';
    let driverId: string | null = null;
    let driverUserId: string | null = null;
    let commissionPct: number | null = null;
    if (input.assignDriverId) {
      const driver = await prisma.driver.findUnique({ where: { id: input.assignDriverId } });
      if (!driver) throw new HTTPException(404, { message: 'Driver not found' });
      if (driver.verifyStatus !== 'APPROVED') {
        throw new HTTPException(422, { message: 'Driver is not approved' });
      }
      status = 'ACCEPTED';
      driverId = driver.id;
      driverUserId = driver.userId;
      commissionPct = await getCommissionPct();
    }

    const job = await prisma.job.create({
      data: {
        customerId,
        createdByAdminId: actorId,
        status,
        driverId,
        commissionPct,
        itemDescription: input.itemDescription,
        vehicleType: input.vehicleType,
        originAddress: input.originAddress,
        originProvince: input.originProvince,
        destAddress: input.destAddress,
        destProvince: input.destProvince,
        scheduledAt: input.scheduledAt ?? null,
        priceQuoted,
        promoCode,
        discountAmount,
        // Admin-created jobs post directly; if the admin attaches the customer's
        // slip, record it and mark payment approved (admin vouches for it).
        paymentSlipUrl: input.paymentSlipUrl ?? null,
        paymentSlipUploadedAt: input.paymentSlipUrl ? new Date() : null,
        paymentApprovedAt: input.paymentSlipUrl ? new Date() : null,
        paymentApprovedById: input.paymentSlipUrl ? actorId : null,
      },
    });
    if (promoCode) {
      await prisma.promoCode.update({
        where: { code: promoCode },
        data: { usedCount: { increment: 1 } },
      });
    }
    await writeAudit({
      actorId,
      action: 'job.create',
      targetType: 'job',
      targetId: job.id,
      metadata: { customerId, status, assignedDriverId: driverId, promoCode, discountAmount },
    });
    // Tell the assigned driver they have a new job from dispatch; otherwise fan out to the area.
    if (driverUserId) {
      await notify({
        userId: driverUserId,
        type: 'JOB_ASSIGNED',
        title: 'คุณได้รับมอบหมายงานใหม่',
        body: `${job.originProvince} → ${job.destProvince} · ${job.itemDescription}`,
        jobId: job.id,
      });
    } else {
      await notifyNewJobToArea(job);
    }
    return c.json(toJobDto(job), 201);
  })

  // List / search customers.
  .get('/customers', zValidator('query', AdminListCustomersQuery), async (c) => {
    const q = c.req.valid('query');
    const where: Prisma.CustomerWhereInput = q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { phone: { contains: q.search } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'name'], 'createdAt'),
        ...pageArgs(q),
      }),
      prisma.customer.count({ where }),
    ]);
    const items: CustomerDto[] = rows.map(toCustomerDto);
    return c.json({ items, total, page: q.page, pageSize: q.pageSize });
  })

  // Record an offline customer.
  .post('/customers', zValidator('json', AdminCreateCustomerInput), async (c) => {
    const input = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const created = await prisma.customer.create({
      data: {
        name: input.name,
        phone: input.phone ?? null,
        note: input.note ?? null,
        createdById: actorId,
      },
    });
    await writeAudit({
      actorId,
      action: 'customer.create',
      targetType: 'user',
      targetId: created.id,
      metadata: { name: input.name, phone: input.phone ?? null },
    });
    return c.json(toCustomerDto(created), 201);
  })

  // Customer profile with job history.
  .get('/customers/:id', async (c) => {
    const id = c.req.param('id');
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new HTTPException(404, { message: 'Customer not found' });
    await writeAudit({
      actorId: c.get('claims').sub,
      action: 'pii.view',
      targetType: 'user',
      targetId: id,
    });
    const [jobs, notes] = await Promise.all([
      prisma.job.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.customerNote.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { author: { select: { displayName: true } } },
      }),
    ]);
    const body: AdminCustomerDetailResponse = {
      customer: toCustomerDto(customer),
      jobs: jobs.map(toJobDto),
      notes: notes.map((n) => ({
        id: n.id,
        body: n.body,
        authorName: n.author?.displayName ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
    return c.json(body);
  })

  // CRM: add a contact-history note to a customer.
  .post('/customers/:id/notes', zValidator('json', AddCustomerNoteInput), async (c) => {
    const id = c.req.param('id');
    const { body } = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new HTTPException(404, { message: 'Customer not found' });
    const note = await prisma.customerNote.create({
      data: { customerId: id, authorId: actorId, body },
      include: { author: { select: { displayName: true } } },
    });
    const dto: CustomerNoteDto = {
      id: note.id,
      body: note.body,
      authorName: note.author?.displayName ?? null,
      createdAt: note.createdAt.toISOString(),
    };
    return c.json(dto, 201);
  })

  // CRM: edit a customer's segmentation tags.
  .patch('/customers/:id', zValidator('json', AdminUpdateCustomerInput), async (c) => {
    const id = c.req.param('id');
    const { tags } = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new HTTPException(404, { message: 'Customer not found' });
    const updated = await prisma.customer.update({ where: { id }, data: { tags } });
    await writeAudit({
      actorId,
      action: 'customer.update',
      targetType: 'user',
      targetId: id,
      metadata: { tags },
    });
    return c.json(toCustomerDto(updated));
  })

  // Ban / unban a user.
  .patch('/users/:id/ban', requireAdminRole('SUPER', 'OPS'), zValidator('json', AdminBanUserInput), async (c) => {
    const id = c.req.param('id');
    const { isBanned } = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HTTPException(404, { message: 'User not found' });
    if (user.role === 'ADMIN') throw new HTTPException(403, { message: 'Cannot ban an admin' });
    const updated = await prisma.user.update({ where: { id }, data: { isBanned } });
    await writeAudit({
      actorId,
      action: isBanned ? 'user.ban' : 'user.unban',
      targetType: 'user',
      targetId: id,
      metadata: { isBanned },
    });
    return c.json({ id: updated.id, isBanned: updated.isBanned });
  })

  // Intervene on a problem job (admin may set any status, but still legal-only).
  .patch('/jobs/:id', requireAdminRole('SUPER', 'OPS'), zValidator('json', AdminPatchJobInput), async (c) => {
    const id = c.req.param('id');
    const patch = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) throw new HTTPException(404, { message: 'Job not found' });

    if (patch.status && patch.status !== job.status && !canTransition(job.status, patch.status)) {
      throw new HTTPException(422, {
        message: `Illegal transition ${job.status} -> ${patch.status}`,
      });
    }

    const data: Prisma.JobUncheckedUpdateInput = {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.driverId !== undefined ? { driverId: patch.driverId } : {}),
      ...(patch.priceQuoted !== undefined ? { priceQuoted: patch.priceQuoted } : {}),
    };

    // Admin-confirmed delivery: write the commission ledger + credit the driver atomically.
    const confirmingDelivery = patch.status === 'DELIVERED' && job.status !== 'DELIVERED';

    // Guard: a delivery confirmation MUST be able to produce the driver's commission
    // transaction. Block (don't silently skip) if the effective job has no driver or
    // no price — the admin sets a price in the same patch / the จัดการ dialog first.
    if (confirmingDelivery) {
      const effectiveDriverId = patch.driverId !== undefined ? patch.driverId : job.driverId;
      const effectivePrice = patch.priceQuoted !== undefined ? patch.priceQuoted : job.priceQuoted;
      if (!effectiveDriverId) {
        throw new HTTPException(422, {
          message: 'งานนี้ยังไม่มีคนขับ — มอบหมายคนขับก่อนยืนยันส่งสำเร็จ',
        });
      }
      if (effectivePrice == null || effectivePrice <= 0) {
        throw new HTTPException(422, {
          message: 'กรุณาระบุราคางานก่อนยืนยันส่งสำเร็จ เพื่อสร้างธุรกรรมกับคนขับ',
        });
      }
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.job.update({ where: { id }, data });
      if (confirmingDelivery) {
        // Per-job payment: the commission ledger row IS the payable unit shown on
        // "ธุรกรรมกับคนขับ" (1 job = 1 row), marked paid individually.
        await createDeliveryTransaction(tx, u);
        if (u.driverId) {
          await tx.driver.update({
            where: { id: u.driverId },
            data: { completedCount: { increment: 1 } },
          });
        }
      }
      return u;
    });

    // Notify the assigned driver that their delivery was confirmed.
    if (confirmingDelivery && updated.driverId) {
      const drv = await prisma.driver.findUnique({
        where: { id: updated.driverId },
        select: { userId: true },
      });
      if (drv?.userId) {
        await notify({
          userId: drv.userId,
          type: 'JOB_STATUS',
          title: 'ยืนยันการส่งสำเร็จแล้ว',
          body: `${updated.originProvince} → ${updated.destProvince} ได้รับการยืนยันจากแอดมิน`,
          jobId: updated.id,
        });
      }
      // Two-sided referral reward (best-effort, idempotent) on the customer's
      // first confirmed delivery — runs post-commit so it never blocks delivery.
      await maybeIssueReferralReward(updated.customerId);
    }

    await writeAudit({
      actorId,
      action: 'job.patch',
      targetType: 'job',
      targetId: id,
      metadata: {
        before: { status: job.status, driverId: job.driverId, priceQuoted: job.priceQuoted },
        patch,
      },
    });
    return c.json(toJobDto(updated));
  })

  // Generate a printable PDF document for a job (receipt / payout / worksheet /
  // delivery note) — opened in a new tab to print or save as evidence.
  .get('/jobs/:id/doc/:type', async (c) => {
    const id = c.req.param('id');
    const type = c.req.param('type');
    if (!['receipt', 'payout', 'worksheet', 'delivery'].includes(type)) {
      throw new HTTPException(404, { message: 'Unknown document type' });
    }
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        customer: { include: { user: { select: { displayName: true, phone: true } } } },
        driver: { include: { user: { select: { displayName: true, phone: true } } } },
        transaction: true,
      },
    });
    if (!job) throw new HTTPException(404, { message: 'Job not found' });

    const settings = await getSystemSettings();
    const pdf = await buildJobDocument(type as DocType, {
      job,
      customer: job.customer,
      driver: job.driver,
      transaction: job.transaction,
      settings,
    });
    await writeAudit({
      actorId: c.get('claims').sub,
      action: 'job.document',
      targetType: 'job',
      targetId: id,
      metadata: { type },
    });
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${type}-${id}.pdf"`,
      },
    });
  })

  // Approve a customer's transfer slip: publishes a PENDING_PAYMENT job (-> POSTED)
  // and fans it out to drivers in the area. Requires a slip to have been uploaded.
  .post('/jobs/:id/payment/approve', requireAdminRole('SUPER', 'OPS', 'FINANCE'), async (c) => {
    const id = c.req.param('id');
    const actorId = c.get('claims').sub;
    const job = await prisma.job.findUnique({
      where: { id },
      include: { customer: { select: { userId: true } } },
    });
    if (!job) throw new HTTPException(404, { message: 'Job not found' });
    if (job.status !== 'PENDING_PAYMENT') {
      throw new HTTPException(422, { message: 'งานนี้ไม่ได้อยู่ในขั้นรอชำระเงิน' });
    }
    if (!job.paymentSlipUrl) {
      throw new HTTPException(422, { message: 'ยังไม่มีสลิปการโอนให้อนุมัติ' });
    }
    const updated = await prisma.job.update({
      where: { id },
      data: {
        status: 'POSTED',
        paymentApprovedAt: new Date(),
        paymentApprovedById: actorId,
        paymentRejectedReason: null,
      },
    });
    await writeAudit({
      actorId,
      action: 'job.payment.approve',
      targetType: 'job',
      targetId: id,
      metadata: { priceQuoted: updated.priceQuoted, slipUrl: updated.paymentSlipUrl },
    });
    // Now public — alert approved, available drivers in the origin province.
    await notifyNewJobToArea(updated);
    if (job.customer.userId) {
      await notify({
        userId: job.customer.userId,
        type: 'JOB_STATUS',
        title: 'ยืนยันการชำระเงินแล้ว',
        body: `งาน ${updated.originProvince} → ${updated.destProvince} ถูกเผยแพร่ให้คนขับแล้ว`,
        jobId: updated.id,
      });
    }
    return c.json(toJobDto(updated));
  })

  // Reject a customer's transfer slip: bounce it back so the customer can re-upload.
  // The job stays PENDING_PAYMENT (hidden from drivers).
  .post('/jobs/:id/payment/reject', requireAdminRole('SUPER', 'OPS', 'FINANCE'), zValidator('json', AdminRejectPaymentInput), async (c) => {
    const id = c.req.param('id');
    const actorId = c.get('claims').sub;
    const { reason } = c.req.valid('json');
    const job = await prisma.job.findUnique({
      where: { id },
      include: { customer: { select: { userId: true } } },
    });
    if (!job) throw new HTTPException(404, { message: 'Job not found' });
    if (job.status !== 'PENDING_PAYMENT') {
      throw new HTTPException(422, { message: 'งานนี้ไม่ได้อยู่ในขั้นรอชำระเงิน' });
    }
    const updated = await prisma.job.update({
      where: { id },
      data: {
        paymentSlipUrl: null,
        paymentSlipUploadedAt: null,
        paymentRejectedReason: reason ?? 'สลิปไม่ถูกต้อง กรุณาอัปโหลดใหม่',
        paymentRejectedCount: { increment: 1 },
      },
    });
    await writeAudit({
      actorId,
      action: 'job.payment.reject',
      targetType: 'job',
      targetId: id,
      metadata: { reason: updated.paymentRejectedReason, rejectedCount: updated.paymentRejectedCount },
    });
    // Repeated rejections usually mean a stuck customer or a problem job —
    // surface it to ops instead of looping silently.
    if (updated.paymentRejectedCount >= 3) {
      await notifyAdmins({
        type: 'GENERIC',
        title: 'สลิปถูกปฏิเสธซ้ำหลายครั้ง',
        body: `งาน ${updated.originProvince} → ${updated.destProvince} ถูกปฏิเสธสลิปครั้งที่ ${updated.paymentRejectedCount} — ควรติดต่อลูกค้าโดยตรง`,
        jobId: updated.id,
      });
    }
    if (job.customer.userId) {
      await notify({
        userId: job.customer.userId,
        type: 'JOB_STATUS',
        title: 'สลิปการโอนไม่ผ่าน',
        body: updated.paymentRejectedReason ?? 'กรุณาอัปโหลดสลิปใหม่อีกครั้ง',
        jobId: updated.id,
      });
    }
    return c.json(toJobDto(updated));
  })

  // Commission ledger (transactions).
  .get('/transactions', zValidator('query', AdminListTransactionsQuery), async (c) => {
    const q = c.req.valid('query');
    const where = q.status ? { status: q.status } : {};
    const [rows, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          job: { select: { paymentApprovedAt: true, paymentSlipUrl: true } },
          driver: { select: { name: true, completedCount: true, user: { select: { displayName: true } } } },
        },
        orderBy: orderByOf(
          q.sortBy,
          q.sortDir,
          ['createdAt', 'grossAmount', 'netToDriver', 'status'],
          'createdAt',
        ),
        ...pageArgs(q),
      }),
      prisma.transaction.count({ where }),
    ]);
    const items: TransactionDto[] = rows.map((t) => ({
      id: t.id,
      jobId: t.jobId,
      driverId: t.driverId,
      driverName: t.driver.user?.displayName ?? t.driver.name,
      driverCompletedCount: t.driver.completedCount,
      grossAmount: t.grossAmount,
      commissionPct: t.commissionPct,
      commissionAmount: t.commissionAmount,
      netToDriver: t.netToDriver,
      status: t.status,
      slipUrl: t.slipUrl,
      customerPaidAt: t.job.paymentApprovedAt ? t.job.paymentApprovedAt.toISOString() : null,
      customerSlipUrl: t.job.paymentSlipUrl,
      createdAt: t.createdAt.toISOString(),
    }));
    return c.json({ items, total, page: q.page, pageSize: q.pageSize });
  })

  // Mark a transaction paid / refunded (optionally attach a payment slip).
  .patch('/transactions/:id', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminUpdateTransactionInput), async (c) => {
    const id = c.req.param('id');
    const { status, slipUrl } = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const txn = await prisma.transaction.findUnique({
      where: { id },
      include: { driver: { select: { userId: true } } },
    });
    if (!txn) throw new HTTPException(404, { message: 'Transaction not found' });
    const updated = await prisma.transaction.update({
      where: { id },
      data: { status, ...(slipUrl !== undefined ? { slipUrl } : {}) },
    });
    await writeAudit({
      actorId,
      action: 'transaction.update',
      targetType: 'transaction',
      targetId: id,
      metadata: { from: txn.status, to: status },
    });
    // Tell the driver when their job payment is marked paid.
    if (status === 'PAID' && txn.status !== 'PAID' && txn.driver.userId) {
      await notify({
        userId: txn.driver.userId,
        type: 'GENERIC',
        title: 'โอนค่างานแล้ว',
        body: `โอนค่างานจำนวน ${updated.netToDriver.toLocaleString()} บาท เรียบร้อยแล้ว`,
        jobId: updated.jobId,
      });
    }
    return c.json({ id: updated.id, status: updated.status, slipUrl: updated.slipUrl });
  })

  // Read commission %.
  .get('/settings/commission', async (c) => {
    const body: CommissionSettingResponse = { commissionPct: await getCommissionPct() };
    return c.json(body);
  })

  // Update commission %.
  .put('/settings/commission', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', UpdateCommissionInput), async (c) => {
    const { commissionPct } = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const previous = await getCommissionPct();
    await setCommissionPct(commissionPct);
    await writeAudit({
      actorId,
      action: 'settings.commission',
      targetType: 'setting',
      targetId: 'commission_pct',
      metadata: { from: previous, to: commissionPct },
    });
    const body: CommissionSettingResponse = { commissionPct };
    return c.json(body);
  })

  // Read delivery price per km.
  .get('/settings/pricing', async (c) => {
    const [pricePerKm, floorSurcharge, helperSurcharge, surgeEnabled, surgeMultiplier] =
      await Promise.all([
        getPricePerKm(),
        getFloorSurcharge(),
        getHelperSurcharge(),
        getSurgeEnabled(),
        getSurgeMultiplier(),
      ]);
    const body: PricingSettingResponse = {
      pricePerKm,
      floorSurcharge,
      helperSurcharge,
      surgeEnabled,
      surgeMultiplier,
    };
    return c.json(body);
  })

  // Update delivery rate / surcharges / surge (each field optional — partial patch).
  .put('/settings/pricing', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', UpdatePricingInput), async (c) => {
    const input = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const [prevPrice, prevFloor, prevHelper, prevSurgeOn, prevSurgeMult] = await Promise.all([
      getPricePerKm(),
      getFloorSurcharge(),
      getHelperSurcharge(),
      getSurgeEnabled(),
      getSurgeMultiplier(),
    ]);

    const changes: Record<string, { from: number | boolean; to: number | boolean }> = {};
    if (input.pricePerKm !== undefined) {
      await setPricePerKm(input.pricePerKm);
      changes.price_per_km = { from: prevPrice, to: input.pricePerKm };
    }
    if (input.floorSurcharge !== undefined) {
      await setFloorSurcharge(input.floorSurcharge);
      changes.floor_surcharge = { from: prevFloor, to: input.floorSurcharge };
    }
    if (input.helperSurcharge !== undefined) {
      await setHelperSurcharge(input.helperSurcharge);
      changes.helper_surcharge = { from: prevHelper, to: input.helperSurcharge };
    }
    if (input.surgeEnabled !== undefined) {
      await setSurgeEnabled(input.surgeEnabled);
      changes.surge_enabled = { from: prevSurgeOn, to: input.surgeEnabled };
    }
    if (input.surgeMultiplier !== undefined) {
      await setSurgeMultiplier(input.surgeMultiplier);
      changes.surge_multiplier = { from: prevSurgeMult, to: input.surgeMultiplier };
    }
    await writeAudit({
      actorId,
      action: 'settings.pricing',
      targetType: 'setting',
      targetId: 'pricing',
      metadata: changes,
    });

    const body: PricingSettingResponse = {
      pricePerKm: input.pricePerKm ?? prevPrice,
      floorSurcharge: input.floorSurcharge ?? prevFloor,
      helperSurcharge: input.helperSurcharge ?? prevHelper,
      surgeEnabled: input.surgeEnabled ?? prevSurgeOn,
      surgeMultiplier: input.surgeMultiplier ?? prevSurgeMult,
    };
    return c.json(body);
  })

  // Audit trail of admin actions.
  .get('/audit-logs', zValidator('query', AdminListAuditLogsQuery), async (c) => {
    const q = c.req.valid('query');
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: q.action } : {}),
      ...(q.targetType ? { targetType: q.targetType } : {}),
      ...(q.targetId ? { targetId: q.targetId } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'action', 'targetType'], 'createdAt'),
        ...pageArgs(q),
        include: { actor: { select: { displayName: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    const items: AuditLogDto[] = rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actorName: r.actor.displayName,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    return c.json({ items, total, page: q.page, pageSize: q.pageSize });
  })

  // ── Admin identity & management (RBAC) ─────────────────────────────────────

  // The signed-in admin's identity + tier (drives UI nav gating).
  .get('/whoami', async (c) => {
    const claims = c.get('claims');
    const cred = await prisma.adminCredential.findUnique({
      where: { userId: claims.sub },
      include: { user: { select: { displayName: true } } },
    });
    if (!cred) throw new HTTPException(403, { message: 'Not an admin' });
    const body: AdminWhoamiResponse = {
      userId: claims.sub,
      displayName: cred.user.displayName,
      email: cred.email,
      adminRole: cred.adminRole,
    };
    return c.json(body);
  })

  // List admin accounts (SUPER only).
  .get('/admins', requireAdminRole('SUPER'), zValidator('query', AdminListAdminsQuery), async (c) => {
    const q = c.req.valid('query');
    const [rows, total] = await Promise.all([
      prisma.adminCredential.findMany({
        orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'email', 'adminRole'], 'createdAt'),
        ...pageArgs(q),
        include: { user: { select: { displayName: true } } },
      }),
      prisma.adminCredential.count(),
    ]);
    const items: AdminListItem[] = rows.map((r) => ({
      userId: r.userId,
      displayName: r.user.displayName,
      email: r.email,
      adminRole: r.adminRole,
      createdAt: r.createdAt.toISOString(),
    }));
    return c.json({ items, total, page: q.page, pageSize: q.pageSize });
  })

  // Invite (create) a new admin (SUPER only).
  .post('/admins', requireAdminRole('SUPER'), zValidator('json', AdminInviteInput), async (c) => {
    const input = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const email = input.email.toLowerCase();
    const existing = await prisma.adminCredential.findUnique({ where: { email } });
    if (existing) throw new HTTPException(409, { message: 'Email already in use' });
    const passwordHash = await hashPassword(input.password);
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { displayName: input.displayName, role: 'ADMIN' },
      });
      const cred = await tx.adminCredential.create({
        data: { userId: user.id, email, passwordHash, adminRole: input.adminRole },
      });
      return { user, cred };
    });
    await writeAudit({
      actorId,
      action: 'admin.invite',
      targetType: 'user',
      targetId: created.user.id,
      metadata: { email, adminRole: input.adminRole },
    });
    const body: AdminListItem = {
      userId: created.user.id,
      displayName: created.user.displayName,
      email,
      adminRole: created.cred.adminRole,
      createdAt: created.cred.createdAt.toISOString(),
    };
    return c.json(body, 201);
  })

  // ── Analytics (time series + funnel + leaderboard) ─────────────────────────
  .get('/analytics', zValidator('query', AdminAnalyticsQuery), async (c) => {
    const { days } = c.req.valid('query');
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
        where: { createdAt: { gte: start } },
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

    const topIds = topRaw.map((t) => t.driverId);
    const topInfo = await prisma.driver.findMany({
      where: { id: { in: topIds } },
      include: { user: { select: { displayName: true } } },
    });
    const infoMap = new Map(topInfo.map((d) => [d.id, d]));

    const body: AdminAnalyticsResponse = {
      series: [...points.values()],
      funnel: {
        posted: funnelGroup.reduce((n, g) => n + g._count._all, 0),
        accepted: countOf(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']),
        delivered: countOf(['DELIVERED']),
        cancelled: countOf(['CANCELLED']),
      },
      newDrivers,
      newCustomers,
      topDrivers: topRaw.map((t) => {
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
    return c.json(body);
  })

  // Marketplace liquidity by province: open (POSTED, unassigned) demand vs
  // available approved-driver supply. Surfaces where to push driver acquisition
  // (UNDERSERVED) vs where drivers sit idle (OVERSUPPLIED).
  .get('/analytics/supply-demand', async (c) => {
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

    const body: SupplyDemandResponse = {
      rows,
      totals: {
        openJobs: rows.reduce((n, r) => n + r.openJobs, 0),
        availableDrivers: rows.reduce((n, r) => n + r.availableDrivers, 0),
        underserved: rows.filter((r) => r.gap === 'UNDERSERVED').length,
      },
    };
    return c.json(body);
  })

  // Marketplace health: do customers come back, and do drivers stay active
  // month over month? Delivery time = Transaction.createdAt (commission ledger).
  .get('/analytics/retention', async (c) => {
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

    const body: RetentionResponse = {
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
    return c.json(body);
  })

  // ── Reports ────────────────────────────────────────────────────────────────
  // Period business report. Financials come from the Transaction ledger (one row
  // per delivered job, with grossAmount/commission snapshots); job counts and
  // growth come from createdAt within the range. Defaults to a trailing 30 days.
  .get('/reports/summary', zValidator('query', AdminReportQuery), async (c) => {
    const { from, to } = resolveReportRange(c.req.valid('query'));

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

    const body: ReportSummaryResponse = {
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
    return c.json(body);
  })

  // CSV export of a single dataset within the range. Returns text/csv so the
  // browser downloads it; the admin UI hits this via fetch + blob.
  .get('/reports/export', zValidator('query', AdminReportExportQuery), async (c) => {
    const { type } = c.req.valid('query');
    const { from, to } = resolveReportRange(c.req.valid('query'));
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
        t.driver.user?.displayName ?? '',
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
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM so Excel renders Thai (UTF-8) correctly.
    return c.body('﻿' + csv);
  })

  // ── Driver payout bank info ────────────────────────────────────────────────
  .patch(
    '/drivers/:id/bank',
    requireAdminRole('SUPER', 'FINANCE'),
    zValidator('json', AdminUpdateDriverBankInput),
    async (c) => {
      const id = c.req.param('id');
      const input = c.req.valid('json');
      const actorId = c.get('claims').sub;
      const driver = await prisma.driver.findUnique({ where: { id } });
      if (!driver) throw new HTTPException(404, { message: 'Driver not found' });
      const updated = await prisma.driver.update({
        where: { id },
        data: {
          ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
          ...(input.bankAccountName !== undefined ? { bankAccountName: input.bankAccountName } : {}),
          ...(input.bankAccountNo !== undefined ? { bankAccountNo: input.bankAccountNo } : {}),
        },
      });
      await writeAudit({
        actorId,
        action: 'driver.bank',
        targetType: 'driver',
        targetId: id,
        metadata: { bankName: input.bankName ?? null },
      });
      const dto: DriverDto = toDriverDto(updated, null);
      return c.json(dto);
    },
  )

  // ── Disputes ───────────────────────────────────────────────────────────────
  .get('/disputes', zValidator('query', AdminListDisputesQuery), async (c) => {
    const q = c.req.valid('query');
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
    return c.json({ items, total, page: q.page, pageSize: q.pageSize });
  })

  // Resolve / reject a dispute (optionally refund the job's transaction).
  .patch(
    '/disputes/:id',
    requireAdminRole('SUPER', 'OPS'),
    zValidator('json', AdminResolveDisputeInput),
    async (c) => {
      const id = c.req.param('id');
      const { status, resolution, refund } = c.req.valid('json');
      const actorId = c.get('claims').sub;
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
      const dto: DisputeDto = {
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
      return c.json(dto);
    },
  )

  // ── Payout runs ──────────────────────────────────────────────────────────
  .get('/payouts', zValidator('query', AdminListPayoutsQuery), async (c) => {
    const q = c.req.valid('query');
    const where = {
      ...(q.driverId ? { driverId: q.driverId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.payout.findMany({
        where,
        orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'amount', 'status'], 'createdAt'),
        ...pageArgs(q),
        include: {
          driver: { include: { user: { select: { displayName: true } } } },
          transactions: { select: { jobId: true, commissionAmount: true } },
        },
      }),
      prisma.payout.count({ where }),
    ]);
    const items: PayoutDto[] = rows.map((p) => ({
      id: p.id,
      driverId: p.driverId,
      driverName: p.driver.user?.displayName ?? p.driver.name,
      driverCompletedCount: p.driver.completedCount,
      amount: p.amount,
      commissionTotal: p.transactions.reduce((n, t) => n + t.commissionAmount, 0),
      status: p.status,
      reference: p.reference,
      slipUrl: p.slipUrl,
      transactionCount: p.transactions.length,
      jobIds: p.transactions.map((t) => t.jobId),
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
    }));
    return c.json({ items, total, page: q.page, pageSize: q.pageSize });
  })

  // Bundle a driver's unpaid commission entries into a payout run.
  .post('/payouts', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminCreatePayoutInput), async (c) => {
    const { driverId } = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const pending = await prisma.transaction.findMany({
      where: { driverId, status: 'PENDING', payoutId: null },
    });
    if (pending.length === 0) {
      throw new HTTPException(422, { message: 'No pending commission to pay out' });
    }
    const amount = pending.reduce((n, t) => n + t.netToDriver, 0);
    const payout = await prisma.$transaction(async (tx) => {
      const p = await tx.payout.create({ data: { driverId, amount, createdById: actorId } });
      await tx.transaction.updateMany({
        where: { id: { in: pending.map((t) => t.id) } },
        data: { payoutId: p.id },
      });
      return p;
    });
    await writeAudit({
      actorId,
      action: 'payout.create',
      targetType: 'driver',
      targetId: driverId,
      metadata: { payoutId: payout.id, amount, count: pending.length },
    });
    return c.json({ id: payout.id, amount: payout.amount }, 201);
  })

  // Mark a payout run as paid (flips its bundled transactions to PAID).
  .patch(
    '/payouts/:id',
    requireAdminRole('SUPER', 'FINANCE'),
    zValidator('json', AdminMarkPayoutPaidInput),
    async (c) => {
      const id = c.req.param('id');
      const { reference, slipUrl } = c.req.valid('json');
      const actorId = c.get('claims').sub;
      const payout = await prisma.payout.findUnique({
        where: { id },
        include: { driver: { select: { userId: true } } },
      });
      if (!payout) throw new HTTPException(404, { message: 'Payout not found' });
      if (payout.status === 'PAID') throw new HTTPException(422, { message: 'Already paid' });
      await prisma.$transaction(async (tx) => {
        await tx.payout.update({
          where: { id },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            reference: reference ?? null,
            slipUrl: slipUrl ?? null,
          },
        });
        await tx.transaction.updateMany({ where: { payoutId: id }, data: { status: 'PAID' } });
      });
      await writeAudit({
        actorId,
        action: 'payout.paid',
        targetType: 'driver',
        targetId: payout.driverId,
        metadata: { payoutId: id, reference: reference ?? null, slipUrl: slipUrl ?? null },
      });
      if (payout.driver.userId) {
        await notify({
          userId: payout.driver.userId,
          type: 'GENERIC',
          title: 'โอนค่างานแล้ว',
          body: `โอนค่างานจำนวน ${payout.amount.toLocaleString()} บาท เรียบร้อยแล้ว`,
        });
      }
      return c.json({ id, status: 'PAID' as const });
    },
  )

  // ── PDPA: consent records ──────────────────────────────────────────────────
  .get('/users/:id/consents', async (c) => {
    const id = c.req.param('id');
    const rows = await prisma.consentRecord.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
    });
    const items: ConsentDto[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      version: r.version,
      granted: r.granted,
      createdAt: r.createdAt.toISOString(),
    }));
    return c.json({ items });
  })

  .post('/users/:id/consents', zValidator('json', RecordConsentInput), async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HTTPException(404, { message: 'User not found' });
    const row = await prisma.consentRecord.create({
      data: { userId: id, type: input.type, version: input.version, granted: input.granted },
    });
    await writeAudit({
      actorId,
      action: 'pdpa.consent',
      targetType: 'user',
      targetId: id,
      metadata: { type: input.type, version: input.version, granted: input.granted },
    });
    const dto: ConsentDto = {
      id: row.id,
      type: row.type,
      version: row.version,
      granted: row.granted,
      createdAt: row.createdAt.toISOString(),
    };
    return c.json(dto, 201);
  })

  // ── PDPA: data-subject access (export) ─────────────────────────────────────
  .get('/users/:id/export', async (c) => {
    const id = c.req.param('id');
    const user = await prisma.user.findUnique({
      where: { id },
      include: { driver: true, customerProfile: true, consents: true },
    });
    if (!user) throw new HTTPException(404, { message: 'User not found' });
    await writeAudit({
      actorId: c.get('claims').sub,
      action: 'pdpa.export',
      targetType: 'user',
      targetId: id,
    });
    const [jobs, reviews] = await Promise.all([
      prisma.job.findMany({ where: { customer: { userId: id } }, orderBy: { createdAt: 'desc' } }),
      prisma.review.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const body: UserDataExport = {
      user: {
        id: user.id,
        lineUserId: user.lineUserId,
        displayName: user.displayName,
        phone: user.phone,
        role: user.role,
        isBanned: user.isBanned,
        createdAt: user.createdAt.toISOString(),
      },
      customer: user.customerProfile
        ? {
            id: user.customerProfile.id,
            name: user.customerProfile.name,
            phone: user.customerProfile.phone,
          }
        : null,
      driver: user.driver
        ? {
            id: user.driver.id,
            vehicleType: user.driver.vehicleType,
            plateNumber: user.driver.plateNumber,
            verifyStatus: user.driver.verifyStatus,
            bankAccountNo: user.driver.bankAccountNo,
          }
        : null,
      jobs: jobs.map(toJobDto),
      reviews: reviews.map((r) => ({
        id: r.id,
        jobId: r.jobId,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
      })),
      consents: user.consents.map((r) => ({
        id: r.id,
        type: r.type,
        version: r.version,
        granted: r.granted,
        createdAt: r.createdAt.toISOString(),
      })),
      exportedAt: new Date().toISOString(),
    };
    return c.json(body);
  })

  // ── PDPA: right to erasure (anonymise; keep rows for accounting integrity) ──
  .post('/users/:id/anonymize', requireAdminRole('SUPER'), async (c) => {
    const id = c.req.param('id');
    const actorId = c.get('claims').sub;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HTTPException(404, { message: 'User not found' });
    if (user.role === 'ADMIN') throw new HTTPException(422, { message: 'Cannot anonymize an admin' });
    if (user.anonymizedAt) throw new HTTPException(422, { message: 'Already anonymized' });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          displayName: null,
          phone: null,
          pictureUrl: null,
          lineUserId: null,
          isBanned: true,
          anonymizedAt: new Date(),
        },
      });
      await tx.customer.updateMany({
        where: { userId: id },
        data: { name: null, phone: null, note: null },
      });
    });
    await writeAudit({ actorId, action: 'pdpa.anonymize', targetType: 'user', targetId: id });
    return c.json({ id, anonymized: true });
  })

  // ── System settings (misc scalars) ─────────────────────────────────────────
  .get('/settings/system', async (c) => {
    return c.json(await getSystemSettings());
  })

  .put('/settings/system', requireAdminRole('SUPER'), zValidator('json', UpdateSystemSettingsInput), async (c) => {
    const patch = c.req.valid('json');
    const actorId = c.get('claims').sub;
    await updateSystemSettings(patch);
    await writeAudit({
      actorId,
      action: 'settings.system',
      targetType: 'setting',
      targetId: 'system',
      metadata: patch,
    });
    const body: SystemSettingsResponse = await getSystemSettings();
    return c.json(body);
  })

  // ── Service areas (active provinces) ────────────────────────────────────────
  .get('/service-areas', async (c) => {
    const rows = await prisma.serviceArea.findMany({ orderBy: { province: 'asc' } });
    const items: ServiceAreaDto[] = rows.map((r) => ({ province: r.province, isActive: r.isActive }));
    return c.json({ items });
  })

  .put('/service-areas', requireAdminRole('SUPER'), zValidator('json', AdminSetServiceAreaInput), async (c) => {
    const { province, isActive } = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const row = await prisma.serviceArea.upsert({
      where: { province },
      create: { province, isActive },
      update: { isActive },
    });
    await writeAudit({
      actorId,
      action: 'settings.service_area',
      targetType: 'setting',
      targetId: province,
      metadata: { isActive },
    });
    const dto: ServiceAreaDto = { province: row.province, isActive: row.isActive };
    return c.json(dto);
  })

  // ── Per-vehicle pricing ─────────────────────────────────────────────────────
  .get('/vehicle-pricing', async (c) => {
    const rows = await prisma.vehiclePricing.findMany();
    const items: VehiclePricingDto[] = rows.map((r) => ({
      vehicleType: r.vehicleType,
      label: r.label,
      description: r.description,
      imageUrl: r.imageUrl,
      requirements: r.requirements,
      maxWeightKg: r.maxWeightKg,
      pricePerKm: r.pricePerKm,
      flatRate: r.flatRate,
      perItemRate: r.perItemRate,
      isActive: r.isActive,
    }));
    return c.json({ items });
  })

  .put('/vehicle-pricing', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminUpsertVehiclePricingInput), async (c) => {
    const { vehicleType, label, description, imageUrl, requirements, maxWeightKg, pricePerKm, flatRate, perItemRate, isActive } =
      c.req.valid('json');
    const actorId = c.get('claims').sub;
    const data = {
      ...(label !== undefined ? { label } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(requirements !== undefined ? { requirements } : {}),
      ...(maxWeightKg !== undefined ? { maxWeightKg } : {}),
      ...(pricePerKm !== undefined ? { pricePerKm } : {}),
      ...(flatRate !== undefined ? { flatRate } : {}),
      ...(perItemRate !== undefined ? { perItemRate } : {}),
      isActive,
    };
    const row = await prisma.vehiclePricing.upsert({
      where: { vehicleType },
      create: { vehicleType, ...data },
      update: data,
    });
    await writeAudit({
      actorId,
      action: 'settings.vehicle_pricing',
      targetType: 'setting',
      targetId: vehicleType,
      metadata: { isActive, pricePerKm: pricePerKm ?? null, flatRate: flatRate ?? null, perItemRate: perItemRate ?? null },
    });
    const dto: VehiclePricingDto = {
      vehicleType: row.vehicleType,
      label: row.label,
      description: row.description,
      imageUrl: row.imageUrl,
      requirements: row.requirements,
      maxWeightKg: row.maxWeightKg,
      pricePerKm: row.pricePerKm,
      flatRate: row.flatRate,
      perItemRate: row.perItemRate,
      isActive: row.isActive,
    };
    return c.json(dto);
  })

  // ── Driver KYC ──────────────────────────────────────────────────────────
  .patch(
    '/drivers/:id/kyc',
    requireAdminRole('SUPER', 'OPS'),
    zValidator('json', AdminUpdateDriverKycInput),
    async (c) => {
      const id = c.req.param('id');
      const input = c.req.valid('json');
      const actorId = c.get('claims').sub;
      const driver = await prisma.driver.findUnique({ where: { id } });
      if (!driver) throw new HTTPException(404, { message: 'Driver not found' });
      const updated = await prisma.driver.update({
        where: { id },
        data: {
          ...(input.nationalId !== undefined ? { nationalId: input.nationalId } : {}),
          ...(input.nationalIdUrl !== undefined ? { nationalIdUrl: input.nationalIdUrl } : {}),
          ...(input.licenseNo !== undefined ? { licenseNo: input.licenseNo } : {}),
          ...(input.licenseExpiry !== undefined ? { licenseExpiry: input.licenseExpiry } : {}),
          ...(input.vehicleRegUrl !== undefined ? { vehicleRegUrl: input.vehicleRegUrl } : {}),
          ...(input.vehicleRegExpiry !== undefined
            ? { vehicleRegExpiry: input.vehicleRegExpiry }
            : {}),
          ...(input.insuranceExpiry !== undefined
            ? { insuranceExpiry: input.insuranceExpiry }
            : {}),
        },
      });
      await writeAudit({
        actorId,
        action: 'driver.kyc',
        targetType: 'driver',
        targetId: id,
        metadata: { nationalId: input.nationalId ?? null },
      });
      const dto: DriverDto = toDriverDto(updated, null);
      return c.json(dto);
    },
  )

  // ── Blacklist (block re-registration by national ID / plate) ───────────────
  .get('/blacklist', zValidator('query', AdminListBlacklistQuery), async (c) => {
    const q = c.req.valid('query');
    const where: Prisma.BlacklistWhereInput = q.search
      ? { OR: [{ nationalId: { contains: q.search } }, { plateNumber: { contains: q.search } }] }
      : {};
    const [rows, total] = await Promise.all([
      prisma.blacklist.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      prisma.blacklist.count({ where }),
    ]);
    const items: BlacklistDto[] = rows.map((b) => ({
      id: b.id,
      nationalId: b.nationalId,
      plateNumber: b.plateNumber,
      reason: b.reason,
      createdAt: b.createdAt.toISOString(),
    }));
    return c.json({ items, total, page: q.page, pageSize: q.pageSize });
  })

  .post('/blacklist', requireAdminRole('SUPER', 'OPS'), zValidator('json', AdminCreateBlacklistInput), async (c) => {
    const input = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const row = await prisma.blacklist.create({
      data: {
        nationalId: input.nationalId ?? null,
        plateNumber: input.plateNumber ?? null,
        reason: input.reason ?? null,
        createdById: actorId,
      },
    });
    await writeAudit({
      actorId,
      action: 'blacklist.add',
      targetType: 'driver',
      targetId: row.id,
      metadata: { nationalId: input.nationalId ?? null, plateNumber: input.plateNumber ?? null },
    });
    const dto: BlacklistDto = {
      id: row.id,
      nationalId: row.nationalId,
      plateNumber: row.plateNumber,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
    return c.json(dto, 201);
  })

  .delete('/blacklist/:id', requireAdminRole('SUPER', 'OPS'), async (c) => {
    const id = c.req.param('id');
    const actorId = c.get('claims').sub;
    await prisma.blacklist.deleteMany({ where: { id } });
    await writeAudit({ actorId, action: 'blacklist.remove', targetType: 'driver', targetId: id });
    return c.json({ id, removed: true });
  })

  // ── Promo codes ─────────────────────────────────────────────────────────
  .get('/promos', zValidator('query', AdminListPromosQuery), async (c) => {
    const q = c.req.valid('query');
    const [rows, total] = await Promise.all([
      prisma.promoCode.findMany({
        orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'code', 'usedCount'], 'createdAt'),
        ...pageArgs(q),
      }),
      prisma.promoCode.count(),
    ]);
    const items: PromoCodeDto[] = rows.map((p) => ({
      code: p.code,
      type: p.type,
      value: p.value,
      minOrder: p.minOrder,
      maxUses: p.maxUses,
      usedCount: p.usedCount,
      expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      isActive: p.isActive,
      createdAt: p.createdAt.toISOString(),
    }));
    return c.json({ items, total, page: q.page, pageSize: q.pageSize });
  })

  .post('/promos', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminCreatePromoInput), async (c) => {
    const input = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const code = input.code.trim().toUpperCase();
    const existing = await prisma.promoCode.findUnique({ where: { code } });
    if (existing) throw new HTTPException(409, { message: 'Promo code already exists' });
    const row = await prisma.promoCode.create({
      data: {
        code,
        type: input.type,
        value: input.value,
        minOrder: input.minOrder ?? null,
        maxUses: input.maxUses ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
    await writeAudit({ actorId, action: 'promo.create', targetType: 'setting', targetId: code });
    const dto: PromoCodeDto = {
      code: row.code,
      type: row.type,
      value: row.value,
      minOrder: row.minOrder,
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
    return c.json(dto, 201);
  })

  .patch('/promos/:code', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminUpdatePromoInput), async (c) => {
    const code = c.req.param('code').toUpperCase();
    const input = c.req.valid('json');
    const actorId = c.get('claims').sub;
    const existing = await prisma.promoCode.findUnique({ where: { code } });
    if (!existing) throw new HTTPException(404, { message: 'Promo not found' });
    const row = await prisma.promoCode.update({
      where: { code },
      data: {
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.minOrder !== undefined ? { minOrder: input.minOrder } : {}),
        ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      },
    });
    await writeAudit({ actorId, action: 'promo.update', targetType: 'setting', targetId: code });
    const dto: PromoCodeDto = {
      code: row.code,
      type: row.type,
      value: row.value,
      minOrder: row.minOrder,
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    };
    return c.json(dto);
  });
