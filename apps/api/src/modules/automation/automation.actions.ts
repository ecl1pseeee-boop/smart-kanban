import type { Task, AutomationRule } from '@prisma/client'
import { NotificationType } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../shared/logger.js'
import { createForUser as createNotification } from '../notifications/notifications.service.js'
import type { Action } from './automation.schemas.js'

/**
 * Executes a single rule action against a task.
 *
 * `dryRun` short-circuits any DB write so the /test endpoint can preview
 * what would happen without mutating state.
 *
 * Returns the (possibly updated) task — the engine passes it back as input
 * to the next action so a sequence like
 *   [set_priority CRITICAL] → [move_to_top]
 * sees the latest state.
 */
export async function executeAction(
  action: Action,
  task: Task,
  rule: AutomationRule,
  actorId: string,
  opts: { dryRun?: boolean } = {},
): Promise<Task> {
  if (opts.dryRun) return task

  switch (action.type) {
    case 'move_to_column':
      return shiftTaskTo(task, action.params.columnId, action.params.position ?? 0)
    case 'move_to_top':
      return shiftTaskTo(task, task.columnId, 0)
    case 'set_priority':
      return prisma.task.update({
        where: { id: task.id },
        data: { priority: action.params.priority },
      })
    case 'add_tag': {
      if (task.tags.includes(action.params.tag)) return task
      return prisma.task.update({
        where: { id: task.id },
        data: { tags: { push: action.params.tag } },
      })
    }
    case 'assign_to': {
      const target =
        action.params.target === 'creator'
          ? task.creatorId
          : action.params.userId ?? null
      if (!target) return task
      return prisma.task.update({
        where: { id: task.id },
        data: { assigneeId: target },
      })
    }
    case 'notify_user': {
      const userId = resolveUserTarget(action.params.target, task)
      if (!userId) return task
      await createNotification({
        userId,
        type: NotificationType.AUTOMATION_TRIGGERED,
        title: rule.name,
        body: action.params.message ?? `Сработало правило: ${rule.name}`,
        payload: { ruleId: rule.id, taskId: task.id, boardId: task.boardId },
        actorId,
      })
      return task
    }
    case 'send_telegram': {
      // Real delivery wired in Step 14. For now: enqueue a notification row
      // tagged as DAILY_SUMMARY-adjacent so it's visible in the bell.
      const userId = resolveUserTarget(action.params.target, task)
      if (!userId) return task
      logger.info(
        { rule: rule.name, taskId: task.id, userId },
        'send_telegram action pending (Step 14)',
      )
      return task
    }
    default: {
      // Exhaustiveness: TypeScript ensures `action` is `never` here.
      const _exhaustive: never = action
      void _exhaustive
      return task
    }
  }
}

function resolveUserTarget(
  target: string,
  task: Task,
): string | null {
  if (target === 'creator') return task.creatorId
  if (target === 'assignee') return task.assigneeId
  return target // explicit userId
}

/**
 * Repositions a task into (`targetColumnId`, `targetPosition`).
 * Same shift algorithm as tasks.service.moveTask, minus auth and event
 * emission — the engine controls when to emit at the end of the rule.
 */
async function shiftTaskTo(
  task: Task,
  targetColumnId: string,
  targetPosition: number,
): Promise<Task> {
  const sameColumn = task.columnId === targetColumnId
  const sizeQuery = await prisma.task.count({
    where: {
      columnId: targetColumnId,
      ...(sameColumn ? { id: { not: task.id } } : {}),
    },
  })
  const finalPos = Math.max(0, Math.min(targetPosition, sizeQuery))

  return prisma.$transaction(async (tx) => {
    if (sameColumn) {
      if (task.position < finalPos) {
        await tx.task.updateMany({
          where: {
            columnId: targetColumnId,
            id: { not: task.id },
            position: { gt: task.position, lte: finalPos },
          },
          data: { position: { decrement: 1 } },
        })
      } else if (task.position > finalPos) {
        await tx.task.updateMany({
          where: {
            columnId: targetColumnId,
            id: { not: task.id },
            position: { gte: finalPos, lt: task.position },
          },
          data: { position: { increment: 1 } },
        })
      }
      return tx.task.update({
        where: { id: task.id },
        data: { position: finalPos },
      })
    }

    await tx.task.updateMany({
      where: { columnId: task.columnId, position: { gt: task.position } },
      data: { position: { decrement: 1 } },
    })
    await tx.task.updateMany({
      where: { columnId: targetColumnId, position: { gte: finalPos } },
      data: { position: { increment: 1 } },
    })
    return tx.task.update({
      where: { id: task.id },
      data: { columnId: targetColumnId, position: finalPos },
    })
  })
}
