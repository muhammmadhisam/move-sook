import { HTTPException } from 'hono/http-exception';
import { prisma, type Prisma } from '@movesook/db';
import {
  toLedgerEntryDto,
  pageArgs,
  orderByOf,
  writeAudit,
} from '@movesook/services/support';
import type {
  AdminListLedgerQuery,
  AdminCreateLedgerInput,
  AdminUpdateLedgerInput,
  LedgerEntryDto,
  LedgerSummaryResponse,
} from '@movesook/shared';

export type LedgerListResponse = {
  items: LedgerEntryDto[];
  total: number;
  page: number;
  pageSize: number;
};

function ledgerWhere(q: AdminListLedgerQuery): Prisma.LedgerEntryWhereInput {
  return {
    ...(q.type ? { type: q.type } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.from || q.to
      ? {
          occurredAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        }
      : {}),
  };
}

/** Company cash ledger (list). */
export async function listLedger(q: AdminListLedgerQuery): Promise<LedgerListResponse> {
  const where = ledgerWhere(q);
  const [rows, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: orderByOf(q.sortBy, q.sortDir, ['occurredAt', 'amount', 'createdAt'], 'occurredAt'),
      include: { attachments: true, createdBy: { select: { displayName: true } } },
      ...pageArgs(q),
    }),
    prisma.ledgerEntry.count({ where }),
  ]);
  const items: LedgerEntryDto[] = rows.map(toLedgerEntryDto);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Totals for the current filter (income / expense / net). */
export async function getLedgerSummary(
  q: AdminListLedgerQuery,
): Promise<LedgerSummaryResponse> {
  const where = ledgerWhere(q);
  const grouped = await prisma.ledgerEntry.groupBy({
    by: ['type'],
    where,
    _sum: { amount: true },
  });
  const income = grouped.find((g) => g.type === 'INCOME')?._sum.amount ?? 0;
  const expense = grouped.find((g) => g.type === 'EXPENSE')?._sum.amount ?? 0;
  return { income, expense, net: income - expense };
}

/** Single ledger entry. */
export async function getLedgerEntry(id: string): Promise<LedgerEntryDto> {
  const row = await prisma.ledgerEntry.findUnique({
    where: { id },
    include: { attachments: true, createdBy: { select: { displayName: true } } },
  });
  if (!row) throw new HTTPException(404, { message: 'ไม่พบรายการบัญชี' });
  return toLedgerEntryDto(row);
}

/** Create a ledger entry. */
export async function createLedger(
  sub: string,
  input: AdminCreateLedgerInput,
): Promise<LedgerEntryDto> {
  const row = await prisma.ledgerEntry.create({
    data: {
      type: input.type,
      category: input.category.trim(),
      title: input.title.trim(),
      amount: input.amount,
      note: input.note ?? null,
      occurredAt: new Date(input.occurredAt),
      createdById: sub,
      ...(input.attachments?.length
        ? { attachments: { create: input.attachments.map((a) => ({ url: a.url, name: a.name, mimeType: a.mimeType })) } }
        : {}),
    },
    include: { attachments: true, createdBy: { select: { displayName: true } } },
  });
  await writeAudit({ actorId: sub, action: 'ledger.create', targetType: 'transaction', targetId: row.id });
  return toLedgerEntryDto(row);
}

/** Update a ledger entry. */
export async function updateLedger(
  sub: string,
  id: string,
  input: AdminUpdateLedgerInput,
): Promise<LedgerEntryDto> {
  const existing = await prisma.ledgerEntry.findUnique({ where: { id } });
  if (!existing) throw new HTTPException(404, { message: 'ไม่พบรายการบัญชี' });
  const row = await prisma.ledgerEntry.update({
    where: { id },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.category !== undefined ? { category: input.category.trim() } : {}),
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.occurredAt !== undefined ? { occurredAt: new Date(input.occurredAt) } : {}),
      // A present attachments array replaces the whole set (drop old, add new).
      ...(input.attachments !== undefined
        ? {
            attachments: {
              deleteMany: {},
              create: input.attachments.map((a) => ({ url: a.url, name: a.name, mimeType: a.mimeType })),
            },
          }
        : {}),
    },
    include: { attachments: true, createdBy: { select: { displayName: true } } },
  });
  await writeAudit({ actorId: sub, action: 'ledger.update', targetType: 'transaction', targetId: id });
  return toLedgerEntryDto(row);
}

/** Delete a ledger entry. */
export async function deleteLedger(
  sub: string,
  id: string,
): Promise<{ id: string; deleted: true }> {
  const existing = await prisma.ledgerEntry.findUnique({ where: { id } });
  if (!existing) throw new HTTPException(404, { message: 'ไม่พบรายการบัญชี' });
  await prisma.ledgerEntry.delete({ where: { id } });
  await writeAudit({ actorId: sub, action: 'ledger.delete', targetType: 'transaction', targetId: id });
  return { id, deleted: true };
}
