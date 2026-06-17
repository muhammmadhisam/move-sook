import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import { verifyDocToken } from '@movesook/auth';
import { buildJobDocument, getSystemSettings, getVehicleLabel } from '@movesook/services/support';
import { getEnv } from '@movesook/services/runtime';

// Per-job PDF document builders. Each returns the rendered PDF bytes + a filename;
// the ROUTE (apps/api/src/routes/jobs.ts) sets the response headers / body. Token
// verification for the public receipt view lives here (the route passes the raw token).

export type JobDocResult = {
  pdf: Buffer;
  filename: string;
};

/** Customer downloads their own receipt PDF (only the job's owner; only once paid). */
export async function buildReceipt(sub: string, id: string): Promise<JobDocResult> {
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: { include: { user: { select: { displayName: true, phone: true } } } },
      driver: { include: { user: { select: { displayName: true, phone: true } } } },
      transaction: true,
    },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
  if (!job.paymentApprovedAt) {
    throw new HTTPException(422, { message: 'ใบเสร็จจะออกได้หลังยืนยันการชำระเงิน' });
  }
  const settings = await getSystemSettings();
  const pdf = await buildJobDocument('receipt', {
    job,
    customer: job.customer,
    driver: job.driver,
    transaction: job.transaction,
    settings,
    vehicleLabel: await getVehicleLabel(job.vehicleType),
  });
  return { pdf, filename: `receipt-${id}.pdf` };
}

/** Public, token-authenticated receipt view: opened from the "ดูใบเสร็จรับเงิน"
 *  button on the LINE Flex card pushed when payment is approved. The card opens in
 *  an external browser with no session cookie, so a scoped doc token (signed for
 *  this exact jobId) stands in for auth. Read-only; receipt type only. */
export async function buildReceiptByToken(id: string, token: string): Promise<JobDocResult> {
  const verified = await verifyDocToken(token, getEnv().JWT_SECRET);
  if (!verified.ok || verified.type !== 'receipt' || verified.jobId !== id) {
    throw new HTTPException(403, { message: 'ลิงก์ใบเสร็จไม่ถูกต้องหรือหมดอายุ' });
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
  if (!job.paymentApprovedAt) {
    throw new HTTPException(422, { message: 'ใบเสร็จจะออกได้หลังยืนยันการชำระเงิน' });
  }
  const settings = await getSystemSettings();
  const pdf = await buildJobDocument('receipt', {
    job,
    customer: job.customer,
    driver: job.driver,
    transaction: job.transaction,
    settings,
    vehicleLabel: await getVehicleLabel(job.vehicleType),
  });
  return { pdf, filename: `receipt-${id}.pdf` };
}

/** Assigned driver prints the job worksheet (ใบสรุปงาน) for a job they accepted.
 *  Available from the moment they win the claim (ACCEPTED) onward. */
export async function buildWorksheet(sub: string, id: string): Promise<JobDocResult> {
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: { include: { user: { select: { displayName: true, phone: true } } } },
      driver: { include: { user: { select: { displayName: true, phone: true } } } },
      transaction: true,
    },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (!job.driver || job.driver.userId !== sub) {
    throw new HTTPException(403, { message: 'Not your job' });
  }
  const settings = await getSystemSettings();
  const pdf = await buildJobDocument('worksheet', {
    job,
    customer: job.customer,
    driver: job.driver,
    transaction: job.transaction,
    settings,
    vehicleLabel: await getVehicleLabel(job.vehicleType),
  });
  return { pdf, filename: `worksheet-${id}.pdf` };
}
