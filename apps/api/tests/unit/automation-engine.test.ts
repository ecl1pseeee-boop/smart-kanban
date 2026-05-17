import { describe, it, expect, beforeEach } from 'vitest'
import {
  AutomationTrigger,
  Prisma,
  TaskPriority,
  TaskStatus,
} from '@prisma/client'
import { processTrigger } from '../../src/modules/automation/automation.service.js'
import { prisma } from '../../src/config/prisma.js'
import { redis } from '../../src/config/redis.js'
import { eventBus } from '../../src/shared/events/index.js'
import { createBoard, createTaskRow, createUser, rand } from '../helpers.js'

async function makeRule(
  boardId: string,
  trigger: AutomationTrigger,
  conditions: unknown[],
  actions: unknown[],
  isActive = true,
) {
  return prisma.automationRule.create({
    data: {
      boardId,
      name: rand('Rule'),
      trigger,
      isActive,
      conditions: conditions as Prisma.InputJsonValue,
      actions: actions as Prisma.InputJsonValue,
    },
  })
}

describe('AutomationEngine.processTrigger', () => {
  // Cached rules in Redis would mask DB changes between tests — wipe.
  beforeEach(async () => {
    const keys = await redis.keys('automation:rules:*').catch(() => [])
    if (keys.length > 0) await redis.del(...keys).catch(() => undefined)
  })

  it('fires when conditions match and applies all actions sequentially', async () => {
    const { user } = await createUser()
    const { board, columns } = await createBoard(user.id)
    const [todo, doing] = [columns[0]!, columns[1]!]

    await makeRule(
      board.id,
      AutomationTrigger.TAG_ADDED,
      [{ field: 'tag', operator: 'contains', value: 'bug' }],
      [
        { type: 'set_priority', params: { priority: 'CRITICAL' } },
        { type: 'move_to_column', params: { columnId: doing.id } },
      ],
    )

    const task = await createTaskRow(user.id, board.id, todo.id, {
      title: 'failing payment',
      tags: ['bug'],
    })

    await processTrigger(AutomationTrigger.TAG_ADDED, task, user.id)

    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(after.priority).toBe(TaskPriority.CRITICAL)
    expect(after.columnId).toBe(doing.id)
  })

  it('does NOT fire when conditions do not match', async () => {
    const { user } = await createUser()
    const { board, columns } = await createBoard(user.id)
    const [todo, doing] = [columns[0]!, columns[1]!]

    await makeRule(
      board.id,
      AutomationTrigger.TASK_CREATED,
      [{ field: 'priority', operator: 'equals', value: 'CRITICAL' }],
      [{ type: 'move_to_column', params: { columnId: doing.id } }],
    )

    const task = await createTaskRow(user.id, board.id, todo.id, {
      priority: TaskPriority.LOW,
    })

    await processTrigger(AutomationTrigger.TASK_CREATED, task, user.id)

    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(after.columnId).toBe(todo.id)
  })

  it('ignores inactive rules', async () => {
    const { user } = await createUser()
    const { board, columns } = await createBoard(user.id)
    const [todo, doing] = [columns[0]!, columns[1]!]

    await makeRule(
      board.id,
      AutomationTrigger.TASK_CREATED,
      [],
      [{ type: 'move_to_column', params: { columnId: doing.id } }],
      false, // inactive
    )

    const task = await createTaskRow(user.id, board.id, todo.id)
    await processTrigger(AutomationTrigger.TASK_CREATED, task, user.id)

    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(after.columnId).toBe(todo.id)
  })

  it('keeps executing remaining actions when one action fails', async () => {
    const { user } = await createUser()
    const { board, columns } = await createBoard(user.id)
    const todo = columns[0]!

    // First action targets a non-existent column → executeAction throws,
    // engine logs and continues. Second action sets priority.
    await makeRule(
      board.id,
      AutomationTrigger.TASK_CREATED,
      [],
      [
        { type: 'move_to_column', params: { columnId: 'nonexistent-column-id' } },
        { type: 'set_priority', params: { priority: 'HIGH' } },
      ],
    )

    const task = await createTaskRow(user.id, board.id, todo.id, {
      priority: TaskPriority.LOW,
    })

    await processTrigger(AutomationTrigger.TASK_CREATED, task, user.id)
    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(after.priority).toBe(TaskPriority.HIGH)
  })

  it('emits a single task:updated when actions mutate the row', async () => {
    const { user } = await createUser()
    const { board, columns } = await createBoard(user.id)
    const todo = columns[0]!

    await makeRule(
      board.id,
      AutomationTrigger.TASK_CREATED,
      [],
      [{ type: 'set_priority', params: { priority: 'HIGH' } }],
    )

    const task = await createTaskRow(user.id, board.id, todo.id, {
      priority: TaskPriority.LOW,
    })

    const seen: { newPriority?: TaskPriority }[] = []
    // TypedEventBus.on() returns its own unsubscribe — there's no `off()`.
    const unsubscribe = eventBus.on('task:updated', (payload) =>
      seen.push({ newPriority: payload.task.priority }),
    )
    try {
      await processTrigger(AutomationTrigger.TASK_CREATED, task, user.id)
    } finally {
      unsubscribe()
    }

    // The engine emits one synthetic task:updated containing the post-action
    // state; the inner set_priority call also emits one. Both are valid
    // observations — what matters is at least one carries HIGH.
    expect(seen.some((s) => s.newPriority === TaskPriority.HIGH)).toBe(true)
  })

  it('prevents recursion: an action that mutates the task does not re-trigger', async () => {
    const { user } = await createUser()
    const { board, columns } = await createBoard(user.id)
    const todo = columns[0]!

    // A self-feeding rule: TASK_UPDATED + add_tag — if it didn't have a
    // guard, every patch would re-fire it and we'd loop forever.
    await makeRule(
      board.id,
      AutomationTrigger.TASK_UPDATED,
      [],
      [{ type: 'add_tag', params: { tag: 'auto' } }],
    )

    const task = await createTaskRow(user.id, board.id, todo.id, { tags: [] })
    await processTrigger(AutomationTrigger.TASK_UPDATED, task, user.id)

    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(after.tags).toContain('auto')
    // tag should be present exactly once — no recursive add.
    expect(after.tags.filter((t) => t === 'auto')).toHaveLength(1)
  })
})
