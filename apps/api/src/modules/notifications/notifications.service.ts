import type { Notification, NotificationType, Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../shared/logger.js'
import { eventBus } from '../../shared/events/index.js'
import { NotFoundError } from '../../shared/errors/app-error.js'

const SYSTEM_ACTOR = 'system'

/**
 * Centralized notification creator: writes the row and emits `notification:new`
 * so the Socket.IO bridge delivers it in real-time to the recipient's
 * personal room. All other modules (automation, cron, queue) should call this
 * instead of `prisma.notification.create` directly.
 */
export async function createForUser(input: {
  userId: string
  type: NotificationType
  title: string
  body: string
  payload?: Prisma.InputJsonValue
  actorId?: string | undefined
}): Promise<Notification> {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      ...(input.payload !== undefined && { payload: input.payload }),
    },
  })

  eventBus.emit('notification:new', {
    notification,
    recipientId: input.userId,
    actorId: input.actorId ?? SYSTEM_ACTOR,
  })

  logger.debug(
    { userId: input.userId, type: input.type, notificationId: notification.id },
    'notification created',
  )
  return notification
}

// ── User-facing operations ────────────────────────────────────────

export async function list(
  userId: string,
  params: { filter: 'all' | 'unread'; cursor?: string | undefined; limit: number },
) {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(params.filter === 'unread' && { isRead: false }),
  }
  const take = params.limit

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(params.cursor && { cursor: { id: params.cursor }, skip: 1 }),
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ])

  const hasMore = items.length > take
  const page = hasMore ? items.slice(0, take) : items
  const last = page[page.length - 1]
  return {
    items: page,
    nextCursor: hasMore && last ? last.id : null,
    unreadCount,
  }
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } })
}

export async function markAllRead(userId: string): Promise<{ markedRead: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  })
  return { markedRead: result.count }
}

export async function markRead(userId: string, notificationId: string): Promise<Notification> {
  // Important: scope the find by userId so requests for someone else's
  // notification 404 instead of letting the row be modified.
  const existing = await prisma.notification.findUnique({
    where: { id: notificationId },
  })
  if (!existing || existing.userId !== userId) {
    throw new NotFoundError('Notification')
  }
  if (existing.isRead) return existing // idempotent

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  })
}
