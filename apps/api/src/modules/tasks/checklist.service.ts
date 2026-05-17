import { BoardMemberRole, ActivityAction } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { ConflictError } from '../../shared/errors/app-error.js'
import { eventBus } from '../../shared/events/index.js'
import { getAccessibleTask } from './tasks.service.js'
import { recordActivity } from '../boards/boards.service.js'

interface ChecklistInputItem {
  id?: string | undefined
  text: string
  done?: boolean
}

/**
 * Replaces the task's checklist with the supplied items in order:
 *   - items with an existing `id` are updated in place
 *   - items without `id` are inserted
 *   - existing items NOT referenced in the body are deleted
 * Positions are reassigned to match the supplied order (0..N-1).
 */
export async function patchChecklist(
  userId: string,
  taskId: string,
  input: { items: ChecklistInputItem[] },
) {
  const { task } = await getAccessibleTask(userId, taskId, BoardMemberRole.MEMBER)

  if (task.lockedBy && task.lockedBy !== userId) {
    throw new ConflictError(`Task is locked by user ${task.lockedBy}`)
  }

  const inputIds = new Set(input.items.map((i) => i.id).filter((x): x is string => Boolean(x)))

  await prisma.$transaction(async (tx) => {
    // 1. Delete items not referenced in the input.
    await tx.checklistItem.deleteMany({
      where: {
        taskId,
        ...(inputIds.size > 0 ? { NOT: { id: { in: [...inputIds] } } } : {}),
      },
    })

    // 2. Upsert each input item in order.
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i]!
      if (item.id) {
        await tx.checklistItem.update({
          where: { id: item.id },
          data: { text: item.text, done: item.done ?? false, position: i },
        })
      } else {
        await tx.checklistItem.create({
          data: { taskId, text: item.text, done: item.done ?? false, position: i },
        })
      }
    }
  })

  const fresh = await prisma.checklistItem.findMany({
    where: { taskId },
    orderBy: { position: 'asc' },
  })

  await recordActivity({
    boardId: task.boardId,
    userId,
    taskId,
    action: ActivityAction.TASK_UPDATED,
    diff: { checklistUpdated: { count: fresh.length } },
  })
  eventBus.emit('checklist:updated', {
    taskId,
    boardId: task.boardId,
    items: fresh,
    actorId: userId,
  })
  return fresh
}
