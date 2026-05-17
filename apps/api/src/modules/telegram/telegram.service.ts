import { randomBytes } from 'node:crypto'
import { TaskStatus } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { redis } from '../../config/redis.js'
import { logger } from '../../shared/logger.js'
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app-error.js'
import { invalidateUserCache } from '../auth/auth.service.js'
import * as queueService from '../queue/queue.service.js'
import * as aiService from '../ai/ai.service.js'

// ── Link-code flow ────────────────────────────────────────────────
// User clicks "Привязать Telegram" in the web UI → API generates a short
// numeric code, stores `tg:link:<code> → userId` in Redis with a 10-minute
// TTL. User pastes `/start <code>` to the bot; the bot calls
// `confirmLink({code, telegramId})` (BOT_SECRET-guarded) and we bind.

const LINK_CODE_TTL_SECONDS = 10 * 60
const linkCodeKey = (code: string) => `tg:link:${code}`

function generateCode(): string {
  // 8 hex chars ≈ 32 bits of entropy. Plenty for a 10-min single-use code.
  return randomBytes(4).toString('hex').toUpperCase()
}

export async function generateLinkCode(userId: string): Promise<{
  code: string
  expiresAt: Date
}> {
  const code = generateCode()
  await redis.set(linkCodeKey(code), userId, 'EX', LINK_CODE_TTL_SECONDS)
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_SECONDS * 1000)
  logger.info({ userId, code }, 'telegram link code generated')
  return { code, expiresAt }
}

export interface ConfirmLinkInput {
  code: string
  telegramId: string
  telegramChatId?: string | undefined
  telegramName?: string | undefined
}

export async function confirmLink(input: ConfirmLinkInput) {
  const key = linkCodeKey(input.code.toUpperCase())
  const userId = await redis.get(key)
  if (!userId) throw new NotFoundError('Link code')

  // 409 if this Telegram account is already bound to a *different* user.
  const existingByTg = await prisma.user.findUnique({
    where: { telegramId: input.telegramId },
  })
  if (existingByTg && existingByTg.id !== userId) {
    throw new ConflictError('Telegram account is already linked to a different user', {
      userId: existingByTg.id,
    })
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      telegramId: input.telegramId,
      telegramChatId: input.telegramChatId ?? null,
    },
  })

  // Consume the code so it can't be replayed.
  await redis.del(key).catch(() => undefined)
  // The user record changed → drop the cached version.
  await invalidateUserCache(userId)

  logger.info(
    { userId, telegramId: input.telegramId, telegramName: input.telegramName },
    'telegram account linked',
  )
  return {
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      telegramId: updated.telegramId,
    },
  }
}

// ── Resolution ────────────────────────────────────────────────────

async function userByTelegramOrThrow(telegramId: string) {
  const user = await prisma.user.findUnique({ where: { telegramId } })
  if (!user) throw new NotFoundError('Telegram-linked user')
  return user
}

export async function meByTelegram(telegramId: string) {
  const user = await userByTelegramOrThrow(telegramId)
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    telegramId: user.telegramId,
  }
}

// ── Tasks for "today" ─────────────────────────────────────────────
// Anything assigned to this user that is NOT done/archived AND
// (no due date) OR (due ≤ end of today). Overdue surfaces first.

export async function todayTasksByTelegram(telegramId: string) {
  const user = await userByTelegramOrThrow(telegramId)
  const now = new Date()
  const endOfToday = new Date(now)
  endOfToday.setUTCHours(23, 59, 59, 999)

  const rows = await prisma.task.findMany({
    where: {
      assigneeId: user.id,
      status: { notIn: [TaskStatus.DONE, TaskStatus.ARCHIVED] },
      OR: [{ dueDate: null }, { dueDate: { lte: endOfToday } }],
    },
    include: {
      board: { select: { name: true } },
      column: { select: { name: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }],
    take: 20,
  })

  return {
    items: rows.map((t) => ({
      id: t.id,
      title: t.title,
      boardId: t.boardId,
      boardName: t.board.name,
      columnName: t.column.name,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      isOverdue: t.dueDate ? t.dueDate.getTime() < now.getTime() : false,
    })),
  }
}

// ── User's boards ─────────────────────────────────────────────────

export async function myBoardsByTelegram(telegramId: string) {
  const user = await userByTelegramOrThrow(telegramId)
  const memberships = await prisma.boardMember.findMany({
    where: { userId: user.id },
    include: {
      board: {
        select: {
          id: true,
          name: true,
          slug: true,
          _count: { select: { tasks: true } },
        },
      },
    },
    orderBy: { board: { name: 'asc' } },
  })

  return {
    items: memberships.map((m) => ({
      id: m.board.id,
      name: m.board.name,
      slug: m.board.slug,
      role: m.role,
      taskCount: m.board._count.tasks,
    })),
  }
}

// ── AI proxies ────────────────────────────────────────────────────

export async function analyzeBugByTelegram(
  telegramId: string,
  input: { description?: string | undefined; imageBase64?: string | undefined },
) {
  await userByTelegramOrThrow(telegramId) // require linked account
  return aiService.analyzeBug(input)
}

export async function dailySummaryByTelegram(telegramId: string, boardId: string) {
  const user = await userByTelegramOrThrow(telegramId)
  return aiService.dailySummary(user.id, { boardId })
}

// ── Queue submit proxy ────────────────────────────────────────────

export async function submitTaskByTelegram(
  telegramId: string,
  input: { boardId: string; title: string; description?: string | undefined; metadata?: unknown },
) {
  const user = await userByTelegramOrThrow(telegramId)
  if (!input.boardId || !input.title) {
    throw new ValidationError(null, 'boardId and title are required')
  }
  return queueService.submit({
    boardId: input.boardId,
    title: input.title,
    description: input.description,
    source: 'telegram',
    metadata: input.metadata,
    userId: user.id,
  })
}
