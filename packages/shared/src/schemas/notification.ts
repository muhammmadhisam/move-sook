import { z } from 'zod';
import { NotificationTypeSchema } from '../enums';

export const NotificationDto = z.object({
  id: z.string(),
  userId: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  jobId: z.string().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type NotificationDto = z.infer<typeof NotificationDto>;

// GET /me/notifications
export const ListNotificationsQuery = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  take: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuery>;
