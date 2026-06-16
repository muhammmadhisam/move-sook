import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import { hashPassword } from '@movesook/auth';
import {
  pageArgs,
  orderByOf,
  writeAudit,
} from '@movesook/services/support';
import type {
  AdminListAdminsQuery,
  AdminInviteInput,
  AdminWhoamiResponse,
  AdminListItem,
} from '@movesook/shared';

/** The signed-in admin's identity + tier (drives UI nav gating). */
export async function whoami(sub: string): Promise<AdminWhoamiResponse> {
  const cred = await prisma.adminCredential.findUnique({
    where: { userId: sub },
    include: { user: { select: { displayName: true } } },
  });
  if (!cred) throw new HTTPException(403, { message: 'Not an admin' });
  return {
    userId: sub,
    displayName: cred.user.displayName,
    email: cred.email,
    adminRole: cred.adminRole,
  };
}

export type AdminListResponse = {
  items: AdminListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** List admin accounts (SUPER only). */
export async function listAdmins(q: AdminListAdminsQuery): Promise<AdminListResponse> {
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
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Invite (create) a new admin (SUPER only). */
export async function inviteAdmin(
  sub: string,
  input: AdminInviteInput,
): Promise<AdminListItem> {
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
    actorId: sub,
    action: 'admin.invite',
    targetType: 'user',
    targetId: created.user.id,
    metadata: { email, adminRole: input.adminRole },
  });
  return {
    userId: created.user.id,
    displayName: created.user.displayName,
    email,
    adminRole: created.cred.adminRole,
    createdAt: created.cred.createdAt.toISOString(),
  };
}
