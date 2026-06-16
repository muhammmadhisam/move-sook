import { prisma } from '@movesook/db';
import type { NotificationType } from '@movesook/shared';
import { flexCardMessage } from '@movesook/auth';
// Import from the leaf queue module (not ../queues) to avoid an import cycle:
// queues/index → maintenance → cron-tasks → notify.
import {
  enqueuePush,
  enqueuePushMessages,
  enqueueMulticastMessages,
} from './queues/notifications';
import { getAdminLineGroupId } from './settings';

type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  jobId?: string | null;
  /** Optional call-to-action button rendered on the LINE Flex card (e.g. a receipt link). */
  cta?: { label: string; url: string };
};

/** Plain-text fallback (chat-list preview / push alert) for a Flex card. */
function formatPush(title: string, body: string): string {
  return `${title}\n${body}`;
}

/**
 * Create an in-app notification for a recipient, then mirror it to LINE push via
 * the notifications queue (retry/backoff handled by the worker). The in-app row
 * is the source of truth; a failure of either channel must never break the
 * action that triggered it. Push is skipped automatically when no channel access
 * token is configured (see queues/notifications.ts).
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

  // Side channel: enqueue a LINE push to the recipient's account if we know it.
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { lineUserId: true },
    });
    if (user?.lineUserId) {
      const card = flexCardMessage({
        altText: formatPush(input.title, input.body),
        title: input.title,
        body: input.body,
        button: input.cta,
      });
      await enqueuePushMessages(user.lineUserId, [card]);
    }
  } catch (err) {
    console.error('[notify] line push enqueue failed', input.type, err);
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

/**
 * Push a single text alert to the admin LINE group/room configured in settings
 * (`admin_line_group_id`). Best-effort: a no-op when no group is configured or no
 * channel access token is set, and never throws (callers must not break on it).
 * The group ID works as a LINE push `to`, same as a user ID — the OA bot must be
 * a member of that group/room.
 */
export async function pushAdminLineGroup(text: string): Promise<void> {
  try {
    const groupId = await getAdminLineGroupId();
    if (!groupId) return;
    await enqueuePush(groupId, text);
  } catch (err) {
    console.error('[pushAdminLineGroup] failed', err);
  }
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

  // Enqueue a LINE multicast to every matched driver with a linked account.
  try {
    const lineIds = linked
      .map((d) => d.user?.lineUserId)
      .filter((id): id is string => Boolean(id));
    if (lineIds.length > 0) {
      const card = flexCardMessage({
        altText: formatPush(title, body),
        title,
        body: `${job.originProvince} → ${job.destProvince}`,
        rows: [{ label: 'สินค้า', value: job.itemDescription }],
      });
      await enqueueMulticastMessages(lineIds, [card]);
    }
  } catch (err) {
    console.error('[notifyNewJobToArea] line multicast enqueue failed', err);
  }
}
