import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import { toJobDto, writeAudit } from '@movesook/services/support';
import type {
  RecordConsentInput,
  ConsentDto,
  UserDataExport,
} from '@movesook/shared';

/** PDPA: list a user's consent records. */
export async function listConsents(id: string): Promise<{ items: ConsentDto[] }> {
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
  return { items };
}

/** PDPA: record a consent decision for a user. */
export async function recordConsent(
  sub: string,
  id: string,
  input: RecordConsentInput,
): Promise<ConsentDto> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  const row = await prisma.consentRecord.create({
    data: { userId: id, type: input.type, version: input.version, granted: input.granted },
  });
  await writeAudit({
    actorId: sub,
    action: 'pdpa.consent',
    targetType: 'user',
    targetId: id,
    metadata: { type: input.type, version: input.version, granted: input.granted },
  });
  return {
    id: row.id,
    type: row.type,
    version: row.version,
    granted: row.granted,
    createdAt: row.createdAt.toISOString(),
  };
}

/** PDPA: data-subject access export. */
export async function exportUserData(sub: string, id: string): Promise<UserDataExport> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { driver: true, customerProfile: true, consents: true },
  });
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  await writeAudit({
    actorId: sub,
    action: 'pdpa.export',
    targetType: 'user',
    targetId: id,
  });
  const [jobs, reviews] = await Promise.all([
    prisma.job.findMany({ where: { customer: { userId: id } }, orderBy: { createdAt: 'desc' } }),
    prisma.review.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' } }),
  ]);
  return {
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
}

/** PDPA: right to erasure (anonymise; keep rows for accounting integrity). */
export async function anonymizeUser(
  sub: string,
  id: string,
): Promise<{ id: string; anonymized: true }> {
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
  await writeAudit({ actorId: sub, action: 'pdpa.anonymize', targetType: 'user', targetId: id });
  return { id, anonymized: true };
}
