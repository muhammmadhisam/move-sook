import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { streamSSE } from 'hono/streaming';
import { isTerminalStatus } from '@movesook/shared';
import {
  AdminBanUserInput,
  AdminListDriversQuery,
  AdminListJobsQuery,
  AdminListUsersQuery,
  AdminListLineFollowersQuery,
  AdminListAuditLogsQuery,
  AdminListAdminsQuery,
  AdminListCustomersQuery,
  AdminCreateCustomerInput,
  AdminCreateDriverInput,
  AdminConnectDriverInput,
  AdminCreateJobInput,
  AdminPatchJobInput,
  AdminRejectPaymentInput,
  AdminApproveAssignInput,
  AdminRejectDestChangeInput,
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
  AdminListPromoRedemptionsQuery,
  AdminCreatePromoInput,
  AdminUpdatePromoInput,
  AdminListBlogQuery,
  AdminCreateBlogInput,
  AdminUpdateBlogInput,
  AdminListLedgerQuery,
  AdminCreateLedgerInput,
  AdminUpdateLedgerInput,
  AddCustomerNoteInput,
  AdminUpdateCustomerInput,
} from '@movesook/shared';
import type { AppEnv } from '../lib/context';
import { authenticate, requireRole, requireAdminRole } from '../middleware/auth';
import {
  // stats
  getStats,
  getDriverQueue,
  // drivers
  listDrivers,
  getDriverDetail,
  verifyDriver,
  createDriver,
  connectDriver,
  updateDriverBank,
  updateDriverKyc,
  // users
  listUsers,
  listLineFollowers,
  getUserDetail,
  banUser,
  // customers
  listCustomers,
  createCustomer,
  getCustomerDetail,
  addCustomerNote,
  updateCustomer,
  // jobs
  listJobs,
  getJobDetail,
  createJob,
  patchJob,
  buildJobDoc,
  approvePayment,
  listAssignableDrivers,
  approveAssign,
  rejectPayment,
  approveDestChange,
  rejectDestChange,
  approveDestChangePayment,
  rejectDestChangePayment,
  // transactions
  listTransactions,
  updateTransaction,
  // settings
  getCommission,
  updateCommission,
  getPricing,
  updatePricing,
  getSystem,
  updateSystem,
  listAuditLogs,
  // invites
  whoami,
  listAdmins,
  inviteAdmin,
  // analytics
  getAnalytics,
  getSupplyDemand,
  getRetention,
  // reports
  getReportSummary,
  exportReport,
  // disputes
  listDisputes,
  resolveDispute,
  // payouts
  listPayouts,
  createPayout,
  markPayoutPaid,
  // pdpa
  listConsents,
  recordConsent,
  exportUserData,
  anonymizeUser,
  // service areas
  listServiceAreas,
  setServiceArea,
  // vehicle pricing
  listVehiclePricing,
  upsertVehiclePricing,
  deleteVehiclePricing,
  // blacklist
  listBlacklist,
  createBlacklist,
  removeBlacklist,
  // promos
  listPromos,
  listPromoRedemptions,
  createPromo,
  updatePromo,
  // blog
  listBlog,
  getBlogPost,
  createBlog,
  updateBlog,
  deleteBlog,
  // ledger
  listLedger,
  getLedgerSummary,
  getLedgerEntry,
  createLedger,
  updateLedger,
  deleteLedger,
} from '@movesook/services/admin';
// Reuse the customer/driver tracking snapshot for the admin live-tracking SSE stream.
import { getTrackSnapshot } from '@movesook/services/jobs';

// Every route in this group requires a valid ADMIN session (admin cookie).
// Handlers are thin wrappers over @movesook/services/admin.
export const adminRoutes = new Hono<AppEnv>()
  .use('*', authenticate('admin'), requireRole('ADMIN'))

  // Dashboard numbers.
  .get('/stats', async (c) => c.json(await getStats()))

  // Driver verification queue.
  .get('/drivers', zValidator('query', AdminListDriversQuery), async (c) =>
    c.json(await listDrivers(c.req.valid('query'))),
  )

  // Onboarding funnel: pending applications ordered by how long they've waited.
  .get('/drivers/queue', async (c) => c.json(await getDriverQueue()))

  // Full driver profile: jobs accepted, reviews received, earnings.
  .get('/drivers/:id', async (c) =>
    c.json(await getDriverDetail(c.get('claims').sub, c.req.param('id'))),
  )

  // Approve / reject / suspend a driver.
  .post(
    '/drivers/:id/verify',
    requireAdminRole('SUPER', 'OPS'),
    zValidator('json', AdminVerifyDriverInput),
    async (c) =>
      c.json(await verifyDriver(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // Admin pre-registers a driver (no app account yet — link later via /connect).
  .post(
    '/drivers',
    requireAdminRole('SUPER', 'OPS'),
    zValidator('json', AdminCreateDriverInput),
    async (c) => c.json(await createDriver(c.get('claims').sub, c.req.valid('json')), 201),
  )

  // Link a pre-registered driver to a user who has since signed up.
  .post(
    '/drivers/:id/connect',
    requireAdminRole('SUPER', 'OPS'),
    zValidator('json', AdminConnectDriverInput),
    async (c) =>
      c.json(await connectDriver(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // List users (optional text search over displayName / phone).
  .get('/users', zValidator('query', AdminListUsersQuery), async (c) =>
    c.json(await listUsers(c.req.valid('query'))),
  )

  // Full user profile: driver record (if any), posted jobs, authored reviews.
  .get('/users/:id', async (c) =>
    c.json(await getUserDetail(c.get('claims').sub, c.req.param('id'))),
  )

  // LINE OA follow state of LINE-linked accounts (who can receive push).
  .get(
    '/line-followers',
    requireAdminRole('SUPER', 'OPS'),
    zValidator('query', AdminListLineFollowersQuery),
    async (c) => c.json(await listLineFollowers(c.req.valid('query'))),
  )

  // List jobs (province matches origin OR dest).
  .get('/jobs', zValidator('query', AdminListJobsQuery), async (c) =>
    c.json(await listJobs(c.req.valid('query'))),
  )

  // Single job detail (admin).
  .get('/jobs/:id', async (c) => c.json(await getJobDetail(c.req.param('id'))))

  // SSE live-tracking stream for the admin job page: pushes the assigned driver's
  // location + job status every few seconds until the job reaches a terminal state.
  // Admin auth is already enforced by the router-level .use('*') guard, so there is
  // no per-job ownership check — admins may watch any job. Reuses getTrackSnapshot().
  .get('/jobs/:id/track', async (c) => {
    const id = c.req.param('id');
    return streamSSE(c, async (stream) => {
      let aborted = false;
      stream.onAbort(() => {
        aborted = true;
      });
      // Cap the stream (~1h at 5s) so a forgotten tab can't poll forever.
      for (let i = 0; i < 720 && !aborted; i++) {
        const event = await getTrackSnapshot(id);
        if (!event) break;
        await stream.writeSSE({ event: 'track', data: JSON.stringify(event) });
        // Stop once the job is finished — nothing left to track.
        if (isTerminalStatus(event.status)) break;
        await stream.sleep(5000);
      }
    });
  })

  // Admin creates a job on behalf of a customer (assign a driver now, or post open).
  .post('/jobs', requireAdminRole('SUPER', 'OPS'), zValidator('json', AdminCreateJobInput), async (c) =>
    c.json(await createJob(c.get('claims').sub, c.req.valid('json')), 201),
  )

  // List / search customers.
  .get('/customers', zValidator('query', AdminListCustomersQuery), async (c) =>
    c.json(await listCustomers(c.req.valid('query'))),
  )

  // Record an offline customer.
  .post('/customers', zValidator('json', AdminCreateCustomerInput), async (c) =>
    c.json(await createCustomer(c.get('claims').sub, c.req.valid('json')), 201),
  )

  // Customer profile with job history.
  .get('/customers/:id', async (c) =>
    c.json(await getCustomerDetail(c.get('claims').sub, c.req.param('id'))),
  )

  // CRM: add a contact-history note to a customer.
  .post('/customers/:id/notes', zValidator('json', AddCustomerNoteInput), async (c) =>
    c.json(await addCustomerNote(c.get('claims').sub, c.req.param('id'), c.req.valid('json')), 201),
  )

  // CRM: edit a customer's segmentation tags.
  .patch('/customers/:id', zValidator('json', AdminUpdateCustomerInput), async (c) =>
    c.json(await updateCustomer(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // Ban / unban a user.
  .patch('/users/:id/ban', requireAdminRole('SUPER', 'OPS'), zValidator('json', AdminBanUserInput), async (c) =>
    c.json(await banUser(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // Intervene on a problem job (admin may set any status, but still legal-only).
  .patch('/jobs/:id', requireAdminRole('SUPER', 'OPS'), zValidator('json', AdminPatchJobInput), async (c) =>
    c.json(await patchJob(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // Generate a printable PDF document for a job (receipt / payout / worksheet /
  // delivery note) — opened in a new tab to print or save as evidence.
  .get('/jobs/:id/doc/:type', async (c) => {
    const { pdf, filename, contentType } = await buildJobDoc(
      c.get('claims').sub,
      c.req.param('id'),
      c.req.param('type'),
    );
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  })

  // Approve a customer's transfer slip: publishes a PENDING_PAYMENT job (-> POSTED)
  // and fans it out to drivers in the area. Requires a slip to have been uploaded.
  .post('/jobs/:id/payment/approve', requireAdminRole('SUPER', 'OPS', 'FINANCE'), async (c) =>
    c.json(await approvePayment(c.get('claims').sub, c.req.param('id'))),
  )

  // Drivers an admin can hand THIS job to right now: approved, currently available,
  // and driving the matching vehicle type.
  .get('/jobs/:id/assignable-drivers', requireAdminRole('SUPER', 'OPS', 'FINANCE'), async (c) =>
    c.json(await listAssignableDrivers(c.req.param('id'))),
  )

  // Approve the customer's slip AND assign the job to a chosen driver in one step.
  .post(
    '/jobs/:id/payment/approve-assign',
    requireAdminRole('SUPER', 'OPS', 'FINANCE'),
    zValidator('json', AdminApproveAssignInput),
    async (c) =>
      c.json(await approveAssign(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // Reject a customer's transfer slip: bounce it back so the customer can re-upload.
  .post('/jobs/:id/payment/reject', requireAdminRole('SUPER', 'OPS', 'FINANCE'), zValidator('json', AdminRejectPaymentInput), async (c) =>
    c.json(await rejectPayment(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // (COD commission is collected from the CUSTOMER up-front via the normal payment
  // slip flow — POST /jobs/:id/payment/approve handles it. No separate endpoint.)

  // ── Destination-change request review ──
  // Approve the REQUEST itself: the customer may now transfer the change fee.
  .post('/jobs/:id/dest-change/approve', requireAdminRole('SUPER', 'OPS'), async (c) =>
    c.json(await approveDestChange(c.get('claims').sub, c.req.param('id'))),
  )

  // Reject the destination-change request (customer may raise a new one later).
  .post('/jobs/:id/dest-change/reject', requireAdminRole('SUPER', 'OPS'), zValidator('json', AdminRejectDestChangeInput), async (c) =>
    c.json(await rejectDestChange(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // Approve the change-fee slip: write the new destination onto the live job in one
  // transaction, then notify the assigned driver of the re-route.
  .post('/jobs/:id/dest-change/payment/approve', requireAdminRole('SUPER', 'OPS', 'FINANCE'), async (c) =>
    c.json(await approveDestChangePayment(c.get('claims').sub, c.req.param('id'))),
  )

  // Reject the change-fee slip: bounce it back so the customer can re-upload.
  .post('/jobs/:id/dest-change/payment/reject', requireAdminRole('SUPER', 'OPS', 'FINANCE'), zValidator('json', AdminRejectDestChangeInput), async (c) =>
    c.json(await rejectDestChangePayment(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // Commission ledger (transactions).
  .get('/transactions', zValidator('query', AdminListTransactionsQuery), async (c) =>
    c.json(await listTransactions(c.req.valid('query'))),
  )

  // Mark a transaction paid / refunded (optionally attach a payment slip).
  .patch('/transactions/:id', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminUpdateTransactionInput), async (c) =>
    c.json(await updateTransaction(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // Read commission %.
  .get('/settings/commission', async (c) => c.json(await getCommission()))

  // Update commission %.
  .put('/settings/commission', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', UpdateCommissionInput), async (c) =>
    c.json(await updateCommission(c.get('claims').sub, c.req.valid('json'))),
  )

  // Read delivery price per km.
  .get('/settings/pricing', async (c) => c.json(await getPricing()))

  // Update delivery rate / surcharges / surge (each field optional — partial patch).
  .put('/settings/pricing', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', UpdatePricingInput), async (c) =>
    c.json(await updatePricing(c.get('claims').sub, c.req.valid('json'))),
  )

  // Audit trail of admin actions.
  .get('/audit-logs', zValidator('query', AdminListAuditLogsQuery), async (c) =>
    c.json(await listAuditLogs(c.req.valid('query'))),
  )

  // ── Admin identity & management (RBAC) ─────────────────────────────────────

  // The signed-in admin's identity + tier (drives UI nav gating).
  .get('/whoami', async (c) => c.json(await whoami(c.get('claims').sub)))

  // List admin accounts (SUPER only).
  .get('/admins', requireAdminRole('SUPER'), zValidator('query', AdminListAdminsQuery), async (c) =>
    c.json(await listAdmins(c.req.valid('query'))),
  )

  // Invite (create) a new admin (SUPER only).
  .post('/admins', requireAdminRole('SUPER'), zValidator('json', AdminInviteInput), async (c) =>
    c.json(await inviteAdmin(c.get('claims').sub, c.req.valid('json')), 201),
  )

  // ── Analytics (time series + funnel + leaderboard) ─────────────────────────
  .get('/analytics', zValidator('query', AdminAnalyticsQuery), async (c) =>
    c.json(await getAnalytics(c.req.valid('query'))),
  )

  // Marketplace liquidity by province.
  .get('/analytics/supply-demand', async (c) => c.json(await getSupplyDemand()))

  // Marketplace health: customer + driver retention.
  .get('/analytics/retention', async (c) => c.json(await getRetention()))

  // ── Reports ────────────────────────────────────────────────────────────────
  // Period business report. Defaults to a trailing 30 days.
  .get('/reports/summary', zValidator('query', AdminReportQuery), async (c) =>
    c.json(await getReportSummary(c.req.valid('query'))),
  )

  // CSV export of a single dataset within the range. Returns text/csv so the
  // browser downloads it; the admin UI hits this via fetch + blob.
  .get('/reports/export', zValidator('query', AdminReportExportQuery), async (c) => {
    const { csv, filename } = await exportReport(c.req.valid('query'));
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
    async (c) =>
      c.json(await updateDriverBank(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // ── Disputes ───────────────────────────────────────────────────────────────
  .get('/disputes', zValidator('query', AdminListDisputesQuery), async (c) =>
    c.json(await listDisputes(c.req.valid('query'))),
  )

  // Resolve / reject a dispute (optionally refund the job's transaction).
  .patch(
    '/disputes/:id',
    requireAdminRole('SUPER', 'OPS'),
    zValidator('json', AdminResolveDisputeInput),
    async (c) =>
      c.json(await resolveDispute(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // ── Payout runs ──────────────────────────────────────────────────────────
  .get('/payouts', zValidator('query', AdminListPayoutsQuery), async (c) =>
    c.json(await listPayouts(c.req.valid('query'))),
  )

  // Bundle a driver's unpaid commission entries into a payout run.
  .post('/payouts', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminCreatePayoutInput), async (c) =>
    c.json(await createPayout(c.get('claims').sub, c.req.valid('json')), 201),
  )

  // Mark a payout run as paid (flips its bundled transactions to PAID).
  .patch(
    '/payouts/:id',
    requireAdminRole('SUPER', 'FINANCE'),
    zValidator('json', AdminMarkPayoutPaidInput),
    async (c) =>
      c.json(await markPayoutPaid(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // ── PDPA: consent records ──────────────────────────────────────────────────
  .get('/users/:id/consents', async (c) => c.json(await listConsents(c.req.param('id'))))

  .post('/users/:id/consents', zValidator('json', RecordConsentInput), async (c) =>
    c.json(await recordConsent(c.get('claims').sub, c.req.param('id'), c.req.valid('json')), 201),
  )

  // ── PDPA: data-subject access (export) ─────────────────────────────────────
  .get('/users/:id/export', async (c) =>
    c.json(await exportUserData(c.get('claims').sub, c.req.param('id'))),
  )

  // ── PDPA: right to erasure (anonymise; keep rows for accounting integrity) ──
  .post('/users/:id/anonymize', requireAdminRole('SUPER'), async (c) =>
    c.json(await anonymizeUser(c.get('claims').sub, c.req.param('id'))),
  )

  // ── System settings (misc scalars) ─────────────────────────────────────────
  .get('/settings/system', async (c) => c.json(await getSystem()))

  .put('/settings/system', requireAdminRole('SUPER'), zValidator('json', UpdateSystemSettingsInput), async (c) =>
    c.json(await updateSystem(c.get('claims').sub, c.req.valid('json'))),
  )

  // ── Service areas (active provinces) ────────────────────────────────────────
  .get('/service-areas', async (c) => c.json(await listServiceAreas()))

  .put('/service-areas', requireAdminRole('SUPER'), zValidator('json', AdminSetServiceAreaInput), async (c) =>
    c.json(await setServiceArea(c.get('claims').sub, c.req.valid('json'))),
  )

  // ── Per-vehicle pricing ─────────────────────────────────────────────────────
  .get('/vehicle-pricing', async (c) => c.json(await listVehiclePricing()))

  .put('/vehicle-pricing', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminUpsertVehiclePricingInput), async (c) =>
    c.json(await upsertVehiclePricing(c.get('claims').sub, c.req.valid('json'))),
  )

  // Remove a vehicle type from the catalog.
  .delete('/vehicle-pricing/:vehicleType', requireAdminRole('SUPER', 'FINANCE'), async (c) =>
    c.json(await deleteVehiclePricing(c.get('claims').sub, c.req.param('vehicleType'))),
  )

  // ── Driver KYC ──────────────────────────────────────────────────────────
  .patch(
    '/drivers/:id/kyc',
    requireAdminRole('SUPER', 'OPS'),
    zValidator('json', AdminUpdateDriverKycInput),
    async (c) =>
      c.json(await updateDriverKyc(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // ── Blacklist (block re-registration by national ID / plate) ───────────────
  .get('/blacklist', zValidator('query', AdminListBlacklistQuery), async (c) =>
    c.json(await listBlacklist(c.req.valid('query'))),
  )

  .post('/blacklist', requireAdminRole('SUPER', 'OPS'), zValidator('json', AdminCreateBlacklistInput), async (c) =>
    c.json(await createBlacklist(c.get('claims').sub, c.req.valid('json')), 201),
  )

  .delete('/blacklist/:id', requireAdminRole('SUPER', 'OPS'), async (c) =>
    c.json(await removeBlacklist(c.get('claims').sub, c.req.param('id'))),
  )

  // ── Promo codes ─────────────────────────────────────────────────────────
  .get('/promos', zValidator('query', AdminListPromosQuery), async (c) =>
    c.json(await listPromos(c.req.valid('query'))),
  )

  // Per-code redemption log: which jobs (and customers) used a promo, and when.
  .get('/promos/:code/redemptions', zValidator('query', AdminListPromoRedemptionsQuery), async (c) =>
    c.json(await listPromoRedemptions(c.req.param('code'), c.req.valid('query'))),
  )

  .post('/promos', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminCreatePromoInput), async (c) =>
    c.json(await createPromo(c.get('claims').sub, c.req.valid('json')), 201),
  )

  .patch('/promos/:code', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminUpdatePromoInput), async (c) =>
    c.json(await updatePromo(c.get('claims').sub, c.req.param('code'), c.req.valid('json'))),
  )

  // ── Blog (marketing content) ──
  .get('/blog', zValidator('query', AdminListBlogQuery), async (c) =>
    c.json(await listBlog(c.req.valid('query'))),
  )
  .get('/blog/:id', async (c) => c.json(await getBlogPost(c.req.param('id'))))
  .post('/blog', requireAdminRole('SUPER', 'OPS'), zValidator('json', AdminCreateBlogInput), async (c) =>
    c.json(await createBlog(c.get('claims').sub, c.req.valid('json')), 201),
  )
  .patch('/blog/:id', requireAdminRole('SUPER', 'OPS'), zValidator('json', AdminUpdateBlogInput), async (c) =>
    c.json(await updateBlog(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )
  .delete('/blog/:id', requireAdminRole('SUPER', 'OPS'), async (c) =>
    c.json(await deleteBlog(c.get('claims').sub, c.req.param('id'))),
  )

  // ── Ledger (income/expense bookkeeping) ──
  .get('/ledger', requireAdminRole('SUPER', 'FINANCE'), zValidator('query', AdminListLedgerQuery), async (c) =>
    c.json(await listLedger(c.req.valid('query'))),
  )
  // Totals for the current filter (income / expense / net) — drives the summary cards.
  .get('/ledger/summary', requireAdminRole('SUPER', 'FINANCE'), zValidator('query', AdminListLedgerQuery), async (c) =>
    c.json(await getLedgerSummary(c.req.valid('query'))),
  )
  .get('/ledger/:id', requireAdminRole('SUPER', 'FINANCE'), async (c) =>
    c.json(await getLedgerEntry(c.req.param('id'))),
  )
  .post('/ledger', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminCreateLedgerInput), async (c) =>
    c.json(await createLedger(c.get('claims').sub, c.req.valid('json')), 201),
  )
  .patch('/ledger/:id', requireAdminRole('SUPER', 'FINANCE'), zValidator('json', AdminUpdateLedgerInput), async (c) =>
    c.json(await updateLedger(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )
  .delete('/ledger/:id', requireAdminRole('SUPER', 'FINANCE'), async (c) =>
    c.json(await deleteLedger(c.get('claims').sub, c.req.param('id'))),
  );
