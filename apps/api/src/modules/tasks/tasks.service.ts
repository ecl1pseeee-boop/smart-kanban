import { Prisma, BoardMemberRole, ActivityAction, type Task } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app-error.js'
import { ROLE_LEVEL, requireBoardRole } from '../../shared/access/board-access.js'
import { eventBus } from '../../shared/events/index.js'
import { recordActivity } from '../boards/boards.service.js'

const LOCK_TTL_MS = 10 * 60 * 1000 // stale locks auto-recover after 10 minutes

export interface AccessibleTask {
  task: Task
  role: BoardMemberRole
}

/** Loads a task and asserts the caller has at least `minRole` on its board. */
export async function getAccessibleTask(
  userId: string,
  taskId: string,
  minRole: BoardMemberRole,
): Promise<AccessibleTask> {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) throw new NotFoundError('Task')
  const role = await requireBoardRole(userId, task.boardId, minRole)
  return { task, role }
}

function isLockHeldByOther(
  task: Task,
  callerId: string,
  now: number = Date.now(),
): boolean {
  if (!task.lockedBy || task.lockedBy === callerId) return false
  if (!task.lockedAt) return false
  return now - task.lockedAt.getTime() < LOCK_TTL_MS
}

// ── List ────────────────────────────────────────────────────────────

export async function listTasks(
  userId: string,
  boardId: string,
  filters: {
    priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    assigneeId?: string
    tag?: string
    dueBefore?: Date
    dueAfter?: Date
    q?: string
    columnId?: string
    cursor?: string
    limit: number
  },
) {
  await requireBoardRole(userId, boardId, BoardMemberRole.VIEWER)

  const where: Prisma.TaskWhereInput = { boardId }
  if (filters.priority) where.priority = filters.priority
  if (filters.assigneeId === 'me') where.assigneeId = userId
  else if (filters.assigneeId === 'unassigned') where.assigneeId = null
  else if (filters.assigneeId) where.assigneeId = filters.assigneeId
  if (filters.tag) where.tags = { has: filters.tag }
  if (filters.columnId) where.columnId = filters.columnId
  if (filters.dueBefore || filters.dueAfter) {
    where.dueDate = {
      ...(filters.dueBefore && { lte: filters.dueBefore }),
      ...(filters.dueAfter && { gte: filters.dueAfter }),
    }
  }
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: 'insensitive' } },
      { description: { contains: filters.q, mode: 'insensitive' } },
    ]
  }

  const take = filters.limit
  const items = await prisma.task.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(filters.cursor && { cursor: { id: filters.cursor }, skip: 1 }),
    include: {
      _count: { select: { checklistItems: true, comments: true } },
      checklistItems: { where: { done: true }, select: { id: true } },
    },
  })

  const hasMore = items.length > take
  const page = hasMore ? items.slice(0, take) : items
  const last = page[page.length - 1]
  return {
    items: page.map((t) => ({
      id: t.id,
      boardId: t.boardId,
      columnId: t.columnId,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      position: t.position,
      tags: t.tags,
      dueDate: t.dueDate,
      assigneeId: t.assigneeId,
      creatorId: t.creatorId,
      lockedBy: t.lockedBy,
      lockedAt: t.lockedAt,
      metadata: t.metadata,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      checklistTotal: t._count.checklistItems,
      checklistDone: t.checklistItems.length,
      commentCount: t._count.comments,
    })),
    nextCursor: hasMore && last ? last.id : null,
  }
}

// ── Create ──────────────────────────────────────────────────────────

export async function createTask(
  userId: string,
  boardId: string,
  input: {
    title: string
    description?: string | undefined
    columnId?: string | undefined
    priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | undefined
    tags?: string[] | undefined
    dueDate?: Date | undefined
    assigneeId?: string | undefined
  },
) {
  await requireBoardRole(userId, boardId, BoardMemberRole.MEMBER)

  // Resolve column: explicit or board's default or first by position.
  const column = await resolveTargetColumn(boardId, input.columnId)

  const task = await prisma.$transaction(async (tx) => {
    const max = await tx.task.aggregate({
      where: { boardId, columnId: column.id },
      _max: { position: true },
    })
    return tx.task.create({
      data: {
        boardId,
        columnId: column.id,
        title: input.title,
        description: input.description,
        priority: input.priority ?? 'MEDIUM',
        tags: input.tags ?? [],
        dueDate: input.dueDate,
        assigneeId: input.assigneeId,
        creatorId: userId,
        position: (max._max.position ?? -1) + 1,
      },
    })
  })

  await recordActivity({
    boardId,
    userId,
    taskId: task.id,
    action: ActivityAction.TASK_CREATED,
    diff: { title: task.title, columnId: task.columnId, priority: task.priority },
  })
  eventBus.emit('task:created', { task, actorId: userId })
  return task
}

async function resolveTargetColumn(boardId: string, columnId?: string | undefined) {
  if (columnId) {
    const c = await prisma.column.findUnique({ where: { id: columnId } })
    if (!c || c.boardId !== boardId) throw new NotFoundError('Column')
    return c
  }
  const def = await prisma.column.findFirst({
    where: { boardId, isDefault: true },
    orderBy: { position: 'asc' },
  })
  if (def) return def
  const first = await prisma.column.findFirst({
    where: { boardId },
    orderBy: { position: 'asc' },
  })
  if (!first) throw new ConflictError('Board has no columns to host a task')
  return first
}

// ── Read (single) ───────────────────────────────────────────────────

export async function getTaskDetail(userId: string, taskId: string) {
  const { task } = await getAccessibleTask(userId, taskId, BoardMemberRole.VIEWER)

  const [full, _count] = await Promise.all([
    prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
        checklistItems: { orderBy: { position: 'asc' } },
        _count: { select: { comments: true } },
      },
    }),
    Promise.resolve(task),
  ])

  let locker = null
  if (full.lockedBy) {
    locker = await prisma.user.findUnique({
      where: { id: full.lockedBy },
      select: { id: true, name: true, email: true, avatarUrl: true },
    })
  }

  return {
    ...full,
    locker,
    commentCount: full._count.comments,
    _count: undefined,
  }
}

// ── Patch ───────────────────────────────────────────────────────────

export async function patchTask(
  userId: string,
  taskId: string,
  patch: {
    title?: string
    description?: string | null
    priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    status?: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'ARCHIVED'
    tags?: string[]
    dueDate?: Date | null
    assigneeId?: string | null
  },
) {
  const { task } = await getAccessibleTask(userId, taskId, BoardMemberRole.MEMBER)

  if (isLockHeldByOther(task, userId)) {
    throw new ConflictError(`Task is locked by user ${task.lockedBy}`)
  }

  // Validate assignee is a board member (if changing to a real user)
  if (patch.assigneeId) {
    const member = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId: task.boardId, userId: patch.assigneeId } },
    })
    if (!member) throw new ValidationError(null, 'Assignee is not a member of this board')
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.tags !== undefined && { tags: patch.tags }),
      ...(patch.dueDate !== undefined && { dueDate: patch.dueDate }),
      ...(patch.assigneeId !== undefined && { assigneeId: patch.assigneeId }),
    },
  })

  await recordActivity({
    boardId: task.boardId,
    userId,
    taskId,
    action:
      patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId
        ? ActivityAction.TASK_ASSIGNED
        : ActivityAction.TASK_UPDATED,
    diff: { patch },
  })
  eventBus.emit('task:updated', { task: updated, previous: task, actorId: userId })
  return updated
}

// ── Delete ──────────────────────────────────────────────────────────

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const { task, role } = await getAccessibleTask(userId, taskId, BoardMemberRole.MEMBER)

  const isCreator = task.creatorId === userId
  const isAdmin = ROLE_LEVEL[role] >= ROLE_LEVEL[BoardMemberRole.ADMIN]
  if (!isCreator && !isAdmin) {
    throw new ForbiddenError('Only the creator or a board ADMIN can delete a task')
  }
  if (isLockHeldByOther(task, userId)) {
    throw new ConflictError(`Task is locked by user ${task.lockedBy}`)
  }

  // Record activity BEFORE the delete: ActivityLog.task FK is ON DELETE SET NULL,
  // but writing the row with a doomed `taskId` after the delete is racy and the
  // catch-all would silently drop it. We log first; the FK then nulls itself.
  await recordActivity({
    boardId: task.boardId,
    userId,
    taskId,
    action: ActivityAction.TASK_DELETED,
    diff: { title: task.title, columnId: task.columnId },
  })

  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id: taskId } })
    // Compact positions in the source column so later inserts pick contiguous slots.
    await tx.task.updateMany({
      where: { columnId: task.columnId, position: { gt: task.position } },
      data: { position: { decrement: 1 } },
    })
  })

  eventBus.emit('task:deleted', {
    taskId,
    boardId: task.boardId,
    columnId: task.columnId,
    actorId: userId,
  })
}

// ── Move ────────────────────────────────────────────────────────────

/**
 * Moves a task to (`columnId`, `position`).
 *
 * Task.position has only an index (no unique constraint), so we don't need
 * a two-phase swap like with columns. The transaction shifts the affected
 * neighbours by ±1 and assigns the final position to the moving task.
 */
export async function moveTask(
  userId: string,
  taskId: string,
  target: { columnId: string; position: number },
) {
  const { task } = await getAccessibleTask(userId, taskId, BoardMemberRole.MEMBER)
  if (isLockHeldByOther(task, userId)) {
    throw new ConflictError(`Task is locked by user ${task.lockedBy}`)
  }

  const column = await prisma.column.findUnique({ where: { id: target.columnId } })
  if (!column || column.boardId !== task.boardId) throw new NotFoundError('Column')

  const sameColumn = task.columnId === target.columnId
  const fromColumnId = task.columnId

  // Clamp the requested position so the caller can pass "very large" and we land at end.
  const sizeQuery = await prisma.task.count({
    where: { columnId: target.columnId, ...(sameColumn ? { id: { not: taskId } } : {}) },
  })
  const finalPos = Math.max(0, Math.min(target.position, sizeQuery))

  // WIP-limit enforcement on the destination column (only when moving between columns).
  if (!sameColumn && column.wipLimit !== null && column.wipLimit !== undefined) {
    if (sizeQuery >= column.wipLimit) {
      throw new ConflictError(
        `Column "${column.name}" has reached its WIP limit of ${column.wipLimit}`,
      )
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (sameColumn) {
      if (task.position < finalPos) {
        await tx.task.updateMany({
          where: {
            columnId: target.columnId,
            id: { not: taskId },
            position: { gt: task.position, lte: finalPos },
          },
          data: { position: { decrement: 1 } },
        })
      } else if (task.position > finalPos) {
        await tx.task.updateMany({
          where: {
            columnId: target.columnId,
            id: { not: taskId },
            position: { gte: finalPos, lt: task.position },
          },
          data: { position: { increment: 1 } },
        })
      }
      return tx.task.update({
        where: { id: taskId },
        data: { position: finalPos },
      })
    }

    // Cross-column move:
    // 1. Close the gap in the source column.
    await tx.task.updateMany({
      where: { columnId: fromColumnId, position: { gt: task.position } },
      data: { position: { decrement: 1 } },
    })
    // 2. Open a slot in the destination column.
    await tx.task.updateMany({
      where: { columnId: target.columnId, position: { gte: finalPos } },
      data: { position: { increment: 1 } },
    })
    // 3. Move the task.
    return tx.task.update({
      where: { id: taskId },
      data: { columnId: target.columnId, position: finalPos },
    })
  })

  await recordActivity({
    boardId: task.boardId,
    userId,
    taskId,
    action: ActivityAction.TASK_MOVED,
    diff: {
      from: { columnId: fromColumnId, position: task.position },
      to: { columnId: target.columnId, position: finalPos },
    },
  })

  eventBus.emit('task:moved', {
    task: updated,
    fromColumnId,
    toColumnId: target.columnId,
    position: finalPos,
    actorId: userId,
  })

  return { task: updated, fromColumnId, toColumnId: target.columnId }
}

// ── Lock / Unlock ───────────────────────────────────────────────────

export async function lockTask(userId: string, taskId: string) {
  const { task } = await getAccessibleTask(userId, taskId, BoardMemberRole.MEMBER)

  if (isLockHeldByOther(task, userId)) {
    throw new ConflictError(`Task is locked by user ${task.lockedBy}`)
  }

  const locked = await prisma.task.update({
    where: { id: taskId },
    data: { lockedBy: userId, lockedAt: new Date() },
  })

  const lockerUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, avatarUrl: true },
  })
  if (lockerUser) {
    eventBus.emit('task:locked', { task: locked, locker: lockerUser, actorId: userId })
  }
  return locked
}

export async function unlockTask(userId: string, taskId: string) {
  const { task, role } = await getAccessibleTask(userId, taskId, BoardMemberRole.MEMBER)

  if (!task.lockedBy) return task // idempotent

  const isOwnLock = task.lockedBy === userId
  const isAdmin = ROLE_LEVEL[role] >= ROLE_LEVEL[BoardMemberRole.ADMIN]
  if (!isOwnLock && !isAdmin) {
    throw new ForbiddenError('Only the user who locked the task (or a board ADMIN) can unlock it')
  }

  const unlocked = await prisma.task.update({
    where: { id: taskId },
    data: { lockedBy: null, lockedAt: null },
  })
  eventBus.emit('task:unlocked', { task: unlocked, actorId: userId })
  return unlocked
}
