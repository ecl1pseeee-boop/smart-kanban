import { Prisma, BoardMemberRole, ActivityAction } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app-error.js'
import { requireBoardRole } from '../../shared/access/board-access.js'
import { eventBus } from '../../shared/events/index.js'
import { recordActivity } from '../boards/boards.service.js'

export async function listColumns(userId: string, boardId: string) {
  await requireBoardRole(userId, boardId, BoardMemberRole.VIEWER)
  return prisma.column.findMany({ where: { boardId }, orderBy: { position: 'asc' } })
}

export async function createColumn(
  userId: string,
  boardId: string,
  input: { name: string; color?: string | undefined; wipLimit?: number | undefined },
) {
  await requireBoardRole(userId, boardId, BoardMemberRole.ADMIN)

  const column = await prisma.$transaction(async (tx) => {
    const max = await tx.column.aggregate({
      where: { boardId },
      _max: { position: true },
    })
    const nextPosition = (max._max.position ?? -1) + 1
    return tx.column.create({
      data: {
        boardId,
        name: input.name,
        color: input.color,
        wipLimit: input.wipLimit,
        position: nextPosition,
      },
    })
  })

  await recordActivity({
    boardId,
    userId,
    action: ActivityAction.COLUMN_CREATED,
    diff: { columnId: column.id, name: column.name, position: column.position },
  })
  eventBus.emit('column:created', { column, actorId: userId })
  return column
}

export async function updateColumn(
  userId: string,
  boardId: string,
  columnId: string,
  patch: {
    name?: string
    color?: string | null
    wipLimit?: number | null
    isDefault?: boolean
  },
) {
  await requireBoardRole(userId, boardId, BoardMemberRole.ADMIN)

  const existing = await prisma.column.findUnique({ where: { id: columnId } })
  if (!existing || existing.boardId !== boardId) throw new NotFoundError('Column')

  const column = await prisma.$transaction(async (tx) => {
    // Only one default column per board.
    if (patch.isDefault === true) {
      await tx.column.updateMany({
        where: { boardId, NOT: { id: columnId } },
        data: { isDefault: false },
      })
    }
    return tx.column.update({
      where: { id: columnId },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.color !== undefined && { color: patch.color }),
        ...(patch.wipLimit !== undefined && { wipLimit: patch.wipLimit }),
        ...(patch.isDefault !== undefined && { isDefault: patch.isDefault }),
      },
    })
  })

  await recordActivity({
    boardId,
    userId,
    action: ActivityAction.COLUMN_UPDATED,
    diff: { columnId, patch },
  })
  eventBus.emit('column:updated', { column, previous: existing, actorId: userId })
  return column
}

export async function deleteColumn(
  userId: string,
  boardId: string,
  columnId: string,
): Promise<void> {
  await requireBoardRole(userId, boardId, BoardMemberRole.ADMIN)

  const existing = await prisma.column.findUnique({
    where: { id: columnId },
    include: { _count: { select: { tasks: true } } },
  })
  if (!existing || existing.boardId !== boardId) throw new NotFoundError('Column')

  if (existing._count.tasks > 0) {
    throw new ConflictError(
      `Column "${existing.name}" still has ${existing._count.tasks} task(s) — move them first`,
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.column.delete({ where: { id: columnId } })
    // Compact positions so later inserts pick contiguous slot.
    const remaining = await tx.column.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
      select: { id: true },
    })
    await applyPositions(tx, remaining)
  })

  await recordActivity({
    boardId,
    userId,
    action: ActivityAction.COLUMN_UPDATED,
    diff: { deletedColumnId: columnId, name: existing.name },
  })
  eventBus.emit('column:deleted', { columnId, boardId, actorId: userId })
}

/**
 * Atomically reorders columns within a board.
 *
 * Postgres enforces @@unique([boardId, position]) immediately on UPDATE, so a
 * naïve "update each column to its new position" sequence collides whenever
 * two columns swap. We work around this with a two-phase update inside one
 * transaction:
 *   phase 1: assign each affected column a unique *negative* position
 *   phase 2: assign each column its desired final (positive) position
 * After phase 1 no positive slot is used, so phase 2 cannot collide.
 */
export async function reorderColumns(
  userId: string,
  boardId: string,
  order: { id: string; position: number }[],
) {
  await requireBoardRole(userId, boardId, BoardMemberRole.ADMIN)

  // Validate: each id belongs to this board, positions are unique.
  const ids = order.map((o) => o.id)
  const positions = order.map((o) => o.position)
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError({ field: 'order' }, 'order contains duplicate column ids')
  }
  if (new Set(positions).size !== positions.length) {
    throw new ValidationError({ field: 'order' }, 'order contains duplicate positions')
  }

  const existing = await prisma.column.findMany({
    where: { boardId },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((c) => c.id))
  for (const o of order) {
    if (!existingIds.has(o.id)) throw new NotFoundError(`Column ${o.id}`)
  }
  if (order.length !== existing.length) {
    throw new ValidationError(
      { expected: existing.length, got: order.length },
      'order must include every column of the board exactly once',
    )
  }

  await prisma.$transaction(async (tx) => {
    // Phase 1: move all affected columns to disjoint negative positions.
    for (let i = 0; i < order.length; i++) {
      const item = order[i]!
      await tx.column.update({
        where: { id: item.id },
        data: { position: -(i + 1) },
      })
    }
    // Phase 2: assign the requested positions.
    for (const item of order) {
      await tx.column.update({
        where: { id: item.id },
        data: { position: item.position },
      })
    }
  })

  await recordActivity({
    boardId,
    userId,
    action: ActivityAction.COLUMN_UPDATED,
    diff: { reorder: order },
  })

  eventBus.emit('column:reordered', {
    boardId,
    columns: order,
    actorId: userId,
  })

  return prisma.column.findMany({ where: { boardId }, orderBy: { position: 'asc' } })
}

async function applyPositions(
  tx: Prisma.TransactionClient,
  rows: { id: string }[],
): Promise<void> {
  for (let i = 0; i < rows.length; i++) {
    await tx.column.update({ where: { id: rows[i]!.id }, data: { position: -(i + 1) } })
  }
  for (let i = 0; i < rows.length; i++) {
    await tx.column.update({ where: { id: rows[i]!.id }, data: { position: i } })
  }
}
