import { z } from 'zod'

const notificationType = z.enum([
  'TASK_ASSIGNED',
  'TASK_COMMENTED',
  'TASK_DUE_SOON',
  'TASK_OVERDUE',
  'AUTOMATION_TRIGGERED',
  'DAILY_SUMMARY',
  'SYSTEM',
])

export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: notificationType,
  title: z.string(),
  body: z.string(),
  payload: z.unknown().nullable(),
  isRead: z.boolean(),
  createdAt: z.coerce.date(),
})

export const listNotificationsQuerySchema = z.object({
  filter: z.enum(['all', 'unread']).default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const listNotificationsResponseSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
})

export const notificationIdParam = z.object({ id: z.string().min(1) })

export const readAllResponseSchema = z.object({
  markedRead: z.number().int().nonnegative(),
})

export const unreadCountResponseSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
})
