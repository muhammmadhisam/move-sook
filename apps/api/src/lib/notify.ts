import { prisma } from '@movesook/db';
import type { NotificationType } from '@movesook/shared';
import { pushLineText, multicastLineText } from '@movesook/auth';
import { env } from '../config';

type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  jobId?: string | null;
};

/** Render an in-app notification as a single LINE text bubble. */
function formatPush(title: string, body: string): string {
  return `${title}\n${body}`;
}

/**
 * Create an in-app notification for a recipient, then mirror it to LINE push
 * (best-effort). A failure of either channel must never break the action that
 * triggered it. LINE push is skipped automatically when no channel access token
 * is configured (see config.LINE_CHANNEL_ACCESS_TOKEN).
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        jobId: input.jobId ?? null,
      },
    });
  } catch (err) {
    console.error('[notify] failed', input.type, err);
  }

  // Side channel: push to the recipient's LINE account if we know it.
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { lineUserId: true },
    });
    if (user?.lineUserId) {
      await pushLineText(
        env.LINE_CHANNEL_ACCESS_TOKEN,
        user.lineUserId,
        formatPush(input.title, input.body),
      );
    }
  } catch (err) {
    console.error('[notify] line push failed', input.type, err);
  }
}

/** Bulk variant (e.g. fan-out to all available drivers in a province). */
export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: inputs.map((i) => ({
        userId: i.userId,
        type: i.type,
        title: i.title,
        body: i.body,
        jobId: i.jobId ?? null,
      })),
    });
  } catch (err) {
    console.error('[notifyMany] failed', err);
  }
}

/** Fan-out a notification to every admin (e.g. an illegal-cargo flag needing review). */
export async function notifyAdmins(input: Omit<NotifyInput, 'userId'>): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  });
  await notifyMany(admins.map((a) => ({ ...input, userId: a.id })));
}

/** Fan-out a freshly-posted open job to approved, available drivers in its origin province. */
export async function notifyNewJobToArea(job: {
  id: string;
  originProvince: string;
  destProvince: string;
  itemDescription: string;
}): Promise<void> {
  const drivers = await prisma.driver.findMany({
    where: { verifyStatus: 'APPROVED', isAvailable: true, serviceProvince: job.originProvince },
    select: { userId: true, user: { select: { lineUserId: true } } },
  });
  const linked = drivers.filter(
    (d): d is { userId: string; user: { lineUserId: string | null } | null } => d.userId !== null,
  );
  const title = 'มีงานใหม่ในพื้นที่ของคุณ';
  const body = `${job.originProvince} → ${job.destProvince} · ${job.itemDescription}`;

  await notifyMany(
    linked.map((d) => ({
      userId: d.userId,
      type: 'JOB_NEW_IN_AREA' as const,
      title,
      body,
      jobId: job.id,
    })),
  );

  // Push to every matched driver who has a linked LINE account (best-effort).
  try {
    const lineIds = linked
      .map((d) => d.user?.lineUserId)
      .filter((id): id is string => Boolean(id));
    if (lineIds.length > 0) {
      await multicastLineText(env.LINE_CHANNEL_ACCESS_TOKEN, lineIds, formatPush(title, body));
    }
  } catch (err) {
    console.error('[notifyNewJobToArea] line multicast failed', err);
  }
}
