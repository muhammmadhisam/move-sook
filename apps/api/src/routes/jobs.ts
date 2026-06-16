import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { streamSSE } from 'hono/streaming';
import {
  CreateJobInput,
  CreateReviewInput,
  CreateDisputeInput,
  EstimateJobInput,
  FlagJobIllegalInput,
  ListJobsQuery,
  RequestDestChangeInput,
  SetJobProofInput,
  UpdateJobStatusInput,
  UploadDestChangeSlipInput,
  UploadPaymentSlipInput,
  isTerminalStatus,
} from '@movesook/shared';
import type { AppEnv } from '../lib/context';
import { authenticate, requireRole } from '../middleware/auth';
import {
  acceptJob,
  authorizeTrack,
  buildReceipt,
  buildReceiptByToken,
  buildWorksheet,
  cancelDestChange,
  cancelJob,
  confirmDelivery,
  createDispute,
  createJob,
  createReview,
  estimateJob,
  flagJobIllegal,
  getJobDetail,
  getPricing,
  getServiceAreas,
  getTrackSnapshot,
  listJobs,
  requestDestChange,
  setJobProof,
  switchToCod,
  updateJobStatus,
  uploadDestChangeSlip,
  uploadPaymentSlip,
} from '@movesook/services/jobs';

// Thin HTTP wrappers over @movesook/services/jobs. The whole router MUST stay one
// unbroken method chain so hc<AppType>() sees every route's types. Middleware
// (authenticate/requireRole/zValidator) stays here; services get validated data + sub.
export const jobRoutes = new Hono<AppEnv>()
  // Public: price-per-km per vehicle type — used by the web summary screen (read-only display).
  .get('/pricing', async (c) => c.json(await getPricing()))

  // Public: provinces the platform serves — used by the posting form to constrain
  // the origin-province picker.
  .get('/service-areas', async (c) => c.json(await getServiceAreas()))

  // Public: full itemised quote for a specific trip + an optional promo-code preview.
  .post('/estimate', zValidator('json', EstimateJobInput), async (c) =>
    c.json(await estimateJob(c.req.valid('json'))),
  )

  // USER creates and publishes a moving job.
  .post(
    '/',
    authenticate('user'),
    requireRole('USER', 'DRIVER'),
    zValidator('json', CreateJobInput),
    async (c) => c.json(await createJob(c.get('claims').sub, c.req.valid('json')), 201),
  )

  // CUSTOMER uploads their bank-transfer slip for a job awaiting payment.
  .post(
    '/:id/payment-slip',
    authenticate('user'),
    requireRole('USER', 'DRIVER'),
    zValidator('json', UploadPaymentSlipInput),
    async (c) =>
      c.json(
        await uploadPaymentSlip(c.get('claims').sub, c.req.param('id'), c.req.valid('json').slipUrl),
      ),
  )

  // CUSTOMER switches a still-unpaid (PENDING_PAYMENT) job to COD.
  .post('/:id/switch-to-cod', authenticate('user'), requireRole('USER', 'DRIVER'), async (c) =>
    c.json(await switchToCod(c.get('claims').sub, c.req.param('id'))),
  )

  // CUSTOMER requests a destination change mid-delivery.
  .post(
    '/:id/dest-change',
    authenticate('user'),
    requireRole('USER', 'DRIVER'),
    zValidator('json', RequestDestChangeInput),
    async (c) =>
      c.json(await requestDestChange(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // CUSTOMER uploads the change-fee transfer slip (only after admin approved the request).
  .post(
    '/:id/dest-change/slip',
    authenticate('user'),
    requireRole('USER', 'DRIVER'),
    zValidator('json', UploadDestChangeSlipInput),
    async (c) =>
      c.json(
        await uploadDestChangeSlip(
          c.get('claims').sub,
          c.req.param('id'),
          c.req.valid('json').slipUrl,
        ),
      ),
  )

  // CUSTOMER withdraws their own pending destination-change request.
  .post(
    '/:id/dest-change/cancel',
    authenticate('user'),
    requireRole('USER', 'DRIVER'),
    async (c) => c.json(await cancelDestChange(c.get('claims').sub, c.req.param('id'))),
  )

  // DRIVER browses matching/backhaul jobs; USER lists their own jobs.
  .get('/', authenticate('user'), zValidator('query', ListJobsQuery), async (c) => {
    const { sub, role } = c.get('claims');
    return c.json(await listJobs(sub, role, c.req.valid('query')));
  })

  // Job detail / tracking — visible to the job's customer or its assigned driver.
  .get('/:id', authenticate('user'), async (c) =>
    c.json(await getJobDetail(c.get('claims').sub, c.req.param('id'))),
  )

  // Customer downloads their own receipt PDF (only the job's owner; only once paid).
  .get('/:id/receipt', authenticate('user'), async (c) => {
    const { pdf, filename } = await buildReceipt(c.get('claims').sub, c.req.param('id'));
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  })

  // Public, token-authenticated receipt view (opened from the LINE Flex card).
  .get('/:id/receipt/view', async (c) => {
    const { pdf, filename } = await buildReceiptByToken(
      c.req.param('id'),
      c.req.query('token') ?? '',
    );
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  })

  // Assigned driver prints the job worksheet (ใบสรุปงาน) for a job they accepted.
  .get('/:id/worksheet', authenticate('user'), async (c) => {
    const { pdf, filename } = await buildWorksheet(c.get('claims').sub, c.req.param('id'));
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  })

  // SSE live-tracking stream: pushes the assigned driver's location + job status
  // every few seconds until the job reaches a terminal state. Visible to the
  // job's customer or its assigned driver (cookie auth via EventSource credentials).
  // The streamSSE() wiring is HTTP-layer and stays here; the authorization check and
  // per-tick snapshot live in @movesook/services/jobs.
  .get('/:id/track', authenticate('user'), async (c) => {
    const { sub } = c.get('claims');
    const id = c.req.param('id');
    await authorizeTrack(sub, id);

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

  // DRIVER attaches a pickup / delivery proof photo to their job.
  .post(
    '/:id/proof',
    authenticate('user'),
    requireRole('DRIVER'),
    zValidator('json', SetJobProofInput),
    async (c) =>
      c.json(await setJobProof(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // CUSTOMER cancels their own job (only while not yet picked up).
  .post('/:id/cancel', authenticate('user'), requireRole('USER', 'DRIVER'), async (c) =>
    c.json(await cancelJob(c.get('claims').sub, c.req.param('id'))),
  )

  // CUSTOMER confirms they received the goods (an extra signal for the admin).
  .post('/:id/confirm-delivery', authenticate('user'), requireRole('USER', 'DRIVER'), async (c) =>
    c.json(await confirmDelivery(c.get('claims').sub, c.req.param('id'))),
  )

  // DRIVER accepts an open job; snapshots the current commission %.
  .post('/:id/accept', authenticate('user'), requireRole('DRIVER'), async (c) =>
    c.json(await acceptJob(c.get('claims').sub, c.req.param('id'))),
  )

  // DRIVER flags the cargo as prohibited/illegal — puts the job on hold for admin review.
  .post(
    '/:id/flag-illegal',
    authenticate('user'),
    requireRole('DRIVER'),
    zValidator('json', FlagJobIllegalInput),
    async (c) =>
      c.json(
        await flagJobIllegal(c.get('claims').sub, c.req.param('id'), c.req.valid('json').reason),
      ),
  )

  // DRIVER advances job status through the shared state machine.
  .patch(
    '/:id/status',
    authenticate('user'),
    requireRole('DRIVER'),
    zValidator('json', UpdateJobStatusInput),
    async (c) =>
      c.json(await updateJobStatus(c.get('claims').sub, c.req.param('id'), c.req.valid('json'))),
  )

  // USER reviews the driver after a job is DELIVERED (one review per job).
  .post(
    '/:id/review',
    authenticate('user'),
    requireRole('USER', 'DRIVER'),
    zValidator('json', CreateReviewInput),
    async (c) =>
      c.json(await createReview(c.get('claims').sub, c.req.param('id'), c.req.valid('json')), 201),
  )

  // A party to the job (customer or assigned driver) raises a dispute.
  .post(
    '/:id/dispute',
    authenticate('user'),
    requireRole('USER', 'DRIVER'),
    zValidator('json', CreateDisputeInput),
    async (c) =>
      c.json(await createDispute(c.get('claims').sub, c.req.param('id'), c.req.valid('json')), 201),
  );
