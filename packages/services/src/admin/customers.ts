import { HTTPException } from 'hono/http-exception';
import { prisma, type Prisma } from '@movesook/db';
import {
  toCustomerDto,
  toJobDto,
  pageArgs,
  orderByOf,
  writeAudit,
} from '@movesook/services/support';
import type {
  AdminListCustomersQuery,
  AdminCreateCustomerInput,
  AddCustomerNoteInput,
  AdminUpdateCustomerInput,
  AdminCustomerDetailResponse,
  CustomerDto,
  CustomerNoteDto,
} from '@movesook/shared';

export type CustomerListResponse = {
  items: CustomerDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** List / search customers. */
export async function listCustomers(
  q: AdminListCustomersQuery,
): Promise<CustomerListResponse> {
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
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Record an offline customer. */
export async function createCustomer(
  sub: string,
  input: AdminCreateCustomerInput,
): Promise<CustomerDto> {
  const created = await prisma.customer.create({
    data: {
      name: input.name,
      phone: input.phone ?? null,
      note: input.note ?? null,
      createdById: sub,
    },
  });
  await writeAudit({
    actorId: sub,
    action: 'customer.create',
    targetType: 'user',
    targetId: created.id,
    metadata: { name: input.name, phone: input.phone ?? null },
  });
  return toCustomerDto(created);
}

/** Customer profile with job history. */
export async function getCustomerDetail(
  sub: string,
  id: string,
): Promise<AdminCustomerDetailResponse> {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new HTTPException(404, { message: 'Customer not found' });
  await writeAudit({
    actorId: sub,
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
  return {
    customer: toCustomerDto(customer),
    jobs: jobs.map(toJobDto),
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      authorName: n.author?.displayName ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

/** CRM: add a contact-history note to a customer. */
export async function addCustomerNote(
  sub: string,
  id: string,
  input: AddCustomerNoteInput,
): Promise<CustomerNoteDto> {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new HTTPException(404, { message: 'Customer not found' });
  const note = await prisma.customerNote.create({
    data: { customerId: id, authorId: sub, body: input.body },
    include: { author: { select: { displayName: true } } },
  });
  return {
    id: note.id,
    body: note.body,
    authorName: note.author?.displayName ?? null,
    createdAt: note.createdAt.toISOString(),
  };
}

/** CRM: edit a customer's segmentation tags. */
export async function updateCustomer(
  sub: string,
  id: string,
  input: AdminUpdateCustomerInput,
): Promise<CustomerDto> {
  const { tags } = input;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new HTTPException(404, { message: 'Customer not found' });
  const updated = await prisma.customer.update({ where: { id }, data: { tags } });
  await writeAudit({
    actorId: sub,
    action: 'customer.update',
    targetType: 'user',
    targetId: id,
    metadata: { tags },
  });
  return toCustomerDto(updated);
}
