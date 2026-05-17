import { randomBytes } from 'node:crypto'
import { BoardMemberRole, TaskPriority } from '@prisma/client'
import argon2 from 'argon2'
import { prisma } from '../src/config/prisma.js'

export function rand(prefix = 'tst'): string {
  return `${prefix}_${randomBytes(4).toString('hex')}`
}

/** Creates a user with a unique email and a known argon2 hash. */
export async function createUser(input: { password?: string; name?: string } = {}) {
  const password = input.password ?? 'TestPass123!'
  const passwordHash = await argon2.hash(password)
  const email = `${rand('u')}@test.local`
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name ?? rand('User'),
      passwordHash,
    },
  })
  return { user, password, email }
}

/**
 * Creates a board owned by `ownerId` with two default columns (To Do, Doing).
 * Adds optional extra members. Returns `{ board, columns, ownerMembership }`.
 */
export async function createBoard(
  ownerId: string,
  options: {
    name?: string
    wipLimitDoing?: number | null
    extraMembers?: { userId: string; role: BoardMemberRole }[]
  } = {},
) {
  const board = await prisma.board.create({
    data: {
      name: options.name ?? rand('Board'),
      slug: rand('slug'),
      ownerId,
      members: {
        create: [
          { userId: ownerId, role: BoardMemberRole.OWNER },
          ...(options.extraMembers ?? []),
        ],
      },
      columns: {
        create: [
          { name: 'To Do', position: 0, isDefault: true },
          { name: 'Doing', position: 1, wipLimit: options.wipLimitDoing ?? null },
        ],
      },
    },
    include: { columns: { orderBy: { position: 'asc' } } },
  })
  return { board, columns: board.columns }
}

/** Creates a task in the given column at the next available position. */
export async function createTaskRow(
  ownerId: string,
  boardId: string,
  columnId: string,
  input: { title?: string; priority?: TaskPriority; tags?: string[]; dueDate?: Date } = {},
) {
  const next = await prisma.task.count({ where: { columnId } })
  return prisma.task.create({
    data: {
      boardId,
      columnId,
      title: input.title ?? rand('Task'),
      priority: input.priority ?? TaskPriority.MEDIUM,
      position: next,
      creatorId: ownerId,
      tags: input.tags ?? [],
      dueDate: input.dueDate ?? null,
    },
  })
}
