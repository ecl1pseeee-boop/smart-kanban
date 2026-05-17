import {
  AutomationTrigger,
  BoardMemberRole,
  NotificationType,
  TaskStatus,
} from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { redis } from '../../config/redis.js'
import { logger } from '../../shared/logger.js'
import { processTrigger } from '../automation/automation.service.js'
import { createForUser as createNotification } from '../notifications/notifications.service.js'

const DUE_HORIZON_MS = 24 * 60 * 60 * 1000

/**
 * Per-hour dedup so a task whose dueDate is "soon" doesn't trigger the same
 * rule/notification on every 15-min tick. Returns true if the caller should
 * proceed (first time this hour), false otherwise.
 */
async function claimDedup(key: string, ttlSeconds: number): Promise<boolean> {
  const res = await redis.set(key, '1', 'EX', ttlSeconds, 'NX').catch(() => null)
  return res === 'OK'
}

// ── 1. Deadline checker (every 15 min) ────────────────────────────

export interface DeadlineCheckResult {
  approachingCount: number
  overdueNotifications: number
  ruleTriggers: number
}

export async function checkDeadlines(): Promise<DeadlineCheckResult> {
  const now = new Date()
  const horizon = new Date(now.getTime() + DUE_HORIZON_MS)
  const hourBucket = Math.floor(now.getTime() / 3_600_000)

  let approachingCount = 0
  let ruleTriggers = 0

  const approaching = await prisma.task.findMany({
    where: {
      dueDate: { gte: now, lte: horizon },
      status: { notIn: [TaskStatus.DONE, TaskStatus.ARCHIVED] },
    },
  })

  for (const task of approaching) {
    approachingCount++
    if (!(await claimDedup(`cron:due-approaching:${task.id}:${hourBucket}`, 3600))) continue

    // Activity log + automation gets the board owner as actor so audit
    // attribution doesn't say "the assignee did this".
    const board = await prisma.board.findUnique({
      where: { id: task.boardId },
      select: { ownerId: true },
    })
    const actorId = board?.ownerId ?? task.creatorId
    try {
      await processTrigger(AutomationTrigger.DUE_DATE_APPROACHING, task, actorId)
      ruleTriggers++
    } catch (err) {
      logger.error({ err, taskId: task.id }, 'DUE_DATE_APPROACHING trigger failed')
    }
  }

  // Overdue: dueDate < now, not done. One reminder per assignee per day.
  let overdueNotifications = 0
  const overdue = await prisma.task.findMany({
    where: {
      dueDate: { lt: now },
      status: { notIn: [TaskStatus.DONE, TaskStatus.ARCHIVED] },
      assigneeId: { not: null },
    },
  })

  const today = now.toISOString().slice(0, 10) // YYYY-MM-DD
  for (const task of overdue) {
    if (!task.assigneeId) continue
    if (!(await claimDedup(`cron:overdue:${task.id}:${today}`, 86400))) continue

    await createNotification({
      userId: task.assigneeId,
      type: NotificationType.TASK_OVERDUE,
      title: 'Задача просрочена',
      body: `"${task.title}" просрочена — дедлайн был ${task.dueDate!.toISOString().slice(0, 10)}`,
      payload: { taskId: task.id, boardId: task.boardId },
    })
    overdueNotifications++
  }

  logger.info(
    { approachingCount, overdueNotifications, ruleTriggers },
    'deadline checker tick complete',
  )
  return { approachingCount, overdueNotifications, ruleTriggers }
}

// ── 2. Morning digest (09:00 daily) ────────────────────────────────

export interface MorningDigestResult {
  recipients: number
  totalTasks: number
}

export async function morningDigest(): Promise<MorningDigestResult> {
  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)
  const today = now.toISOString().slice(0, 10)

  const groups = await prisma.task.groupBy({
    by: ['assigneeId'],
    where: {
      dueDate: { gte: dayStart, lt: dayEnd },
      status: { notIn: [TaskStatus.DONE, TaskStatus.ARCHIVED] },
      assigneeId: { not: null },
    },
    _count: { _all: true },
  })

  let recipients = 0
  let totalTasks = 0

  for (const { assigneeId, _count } of groups) {
    if (!assigneeId) continue
    if (!(await claimDedup(`cron:morning:${assigneeId}:${today}`, 86400))) continue

    await createNotification({
      userId: assigneeId,
      type: NotificationType.TASK_DUE_SOON,
      title: '🌅 Доброе утро!',
      body: `Сегодня дедлайн по ${_count._all} ${pluralizeTasks(_count._all)}`,
      payload: { count: _count._all, date: today },
    })
    recipients++
    totalTasks += _count._all
  }

  logger.info({ recipients, totalTasks }, 'morning digest sent')
  return { recipients, totalTasks }
}

// ── 3. Evening AI summary (18:00 daily) ────────────────────────────

export interface EveningSummaryResult {
  boards: number
  notificationsSent: number
}

export async function eveningSummary(): Promise<EveningSummaryResult> {
  const now = new Date()
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const today = now.toISOString().slice(0, 10)

  const boards = await prisma.board.findMany({
    include: {
      members: {
        where: { role: { in: [BoardMemberRole.OWNER, BoardMemberRole.ADMIN] } },
      },
    },
  })

  let notificationsSent = 0
  for (const board of boards) {
    const [created, doneToday, overdue, totalTasks] = await Promise.all([
      prisma.task.count({
        where: { boardId: board.id, createdAt: { gte: since } },
      }),
      prisma.task.count({
        where: {
          boardId: board.id,
          status: TaskStatus.DONE,
          updatedAt: { gte: since },
        },
      }),
      prisma.task.count({
        where: {
          boardId: board.id,
          dueDate: { lt: now },
          status: { notIn: [TaskStatus.DONE, TaskStatus.ARCHIVED] },
        },
      }),
      prisma.task.count({ where: { boardId: board.id } }),
    ])

    if (created === 0 && doneToday === 0 && overdue === 0) continue

    // Heuristic summary text — Step 12 will replace with Claude API.
    const body =
      `📊 Итоги дня для «${board.name}»\n\n` +
      `✅ Завершено: ${doneToday}\n` +
      `🆕 Создано: ${created}\n` +
      `🚨 Просрочено: ${overdue}\n` +
      `📌 Всего задач: ${totalTasks}`

    for (const member of board.members) {
      if (!(await claimDedup(`cron:evening:${board.id}:${member.userId}:${today}`, 86400))) {
        continue
      }
      await createNotification({
        userId: member.userId,
        type: NotificationType.DAILY_SUMMARY,
        title: `Дайджест: ${board.name}`,
        body,
        payload: { boardId: board.id, created, doneToday, overdue, totalTasks },
      })
      notificationsSent++
    }
  }

  logger.info({ boards: boards.length, notificationsSent }, 'evening summary sent')
  return { boards: boards.length, notificationsSent }
}

function pluralizeTasks(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'задаче'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'задачам'
  return 'задачам'
}
