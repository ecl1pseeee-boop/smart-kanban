import { randomBytes } from 'node:crypto'
import { Prisma, BoardMemberRole, type ActivityAction } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app-error.js'
import { ROLE_LEVEL, requireBoardRole } from '../../shared/access/board-access.js'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'board'
  const exists = await prisma.board.findUnique({ where: { slug: root }, select: { id: true } })
  if (!exists) return root
  return `${root}-${randomBytes(3).toString('hex')}`
}

// ── Boards ──────────────────────────────────────────────────────────

export async function listBoardsForUser(userId: string) {
  const memberships = await prisma.boardMember.findMany({
    where: { userId },
    include: {
      board: {
        include: {
          _count: { select: { members: true, tasks: true } },
        },
      },
    },
    orderBy: { board: { updatedAt: 'desc' } },
  })

  return memberships.map((m) => ({
    id: m.board.id,
    name: m.board.name,
    description: m.board.description,
    slug: m.board.slug,
    isPublic: m.board.isPublic,
    ownerId: m.board.ownerId,
    createdAt: m.board.createdAt,
    updatedAt: m.board.updatedAt,
    role: m.role,
    memberCount: m.board._count.members,
    taskCount: m.board._count.tasks,
  }))
}

export async function createBoard(
  userId: string,
  input: { name: string; description?: string | undefined; slug?: string | undefined; isPublic?: boolean | undefined },
) {
  const slug = input.slug ?? (await uniqueSlug(input.name))

  // If user supplied an explicit slug, conflict must be reported.
  if (input.slug) {
    const exists = await prisma.board.findUnique({ where: { slug }, select: { id: true } })
    if (exists) throw new ConflictError('Board slug already taken')
  }

  return prisma.$transaction(async (tx) => {
    const board = await tx.board.create({
      data: {
        name: input.name,
        description: input.description,
        slug,
        isPublic: input.isPublic ?? false,
        ownerId: userId,
        members: {
          create: { userId, role: BoardMemberRole.OWNER },
        },
        columns: {
          create: [
            { name: 'To Do', color: '#3b82f6', position: 0, isDefault: true },
            { name: 'In Progress', color: '#f59e0b', position: 1 },
            { name: 'Done', color: '#22c55e', position: 2 },
          ],
        },
      },
    })
    return board
  })
}

export async function getBoardState(userId: string, boardId: string) {
  const role = await requireBoardRole(userId, boardId, BoardMemberRole.VIEWER)

  const [board, columns, tasks] = await Promise.all([
    prisma.board.findUniqueOrThrow({ where: { id: boardId } }),
    prisma.column.findMany({ where: { boardId }, orderBy: { position: 'asc' } }),
    prisma.task.findMany({
      where: { boardId },
      orderBy: [{ columnId: 'asc' }, { position: 'asc' }],
      include: {
        _count: { select: { checklistItems: true, comments: true } },
        checklistItems: { where: { done: true }, select: { id: true } },
      },
    }),
  ])

  return {
    board: { ...board, role },
    columns,
    tasks: tasks.map((t) => ({
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
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      checklistTotal: t._count.checklistItems,
      checklistDone: t.checklistItems.length,
      commentCount: t._count.comments,
    })),
  }
}

export async function updateBoard(
  userId: string,
  boardId: string,
  patch: { name?: string; description?: string | null; isPublic?: boolean },
) {
  await requireBoardRole(userId, boardId, BoardMemberRole.ADMIN)
  return prisma.board.update({
    where: { id: boardId },
    data: {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.isPublic !== undefined && { isPublic: patch.isPublic }),
    },
  })
}

export async function deleteBoard(userId: string, boardId: string): Promise<void> {
  await requireBoardRole(userId, boardId, BoardMemberRole.OWNER)
  await prisma.board.delete({ where: { id: boardId } })
}

// ── Members ─────────────────────────────────────────────────────────

export async function listMembers(userId: string, boardId: string) {
  await requireBoardRole(userId, boardId, BoardMemberRole.VIEWER)
  return prisma.boardMember.findMany({
    where: { boardId },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { joinedAt: 'asc' },
  })
}

export async function addMember(
  callerId: string,
  boardId: string,
  input: { email: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' },
) {
  await requireBoardRole(callerId, boardId, BoardMemberRole.ADMIN)

  const targetUser = await prisma.user.findUnique({ where: { email: input.email } })
  if (!targetUser) throw new NotFoundError('User')

  try {
    return await prisma.boardMember.create({
      data: { boardId, userId: targetUser.id, role: input.role },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('User is already a member of this board')
    }
    throw err
  }
}

export async function removeMember(
  callerId: string,
  boardId: string,
  targetUserId: string,
): Promise<void> {
  const callerRole = await requireBoardRole(callerId, boardId, BoardMemberRole.MEMBER)

  const target = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: targetUserId } },
  })
  if (!target) throw new NotFoundError('Board member')

  // Allow self-leave for any member; otherwise need ADMIN+ and cannot exceed your own level.
  const isSelf = callerId === targetUserId
  if (!isSelf) {
    if (ROLE_LEVEL[callerRole] < ROLE_LEVEL[BoardMemberRole.ADMIN]) {
      throw new ForbiddenError('Requires ADMIN role to remove others')
    }
    if (ROLE_LEVEL[target.role] >= ROLE_LEVEL[callerRole]) {
      throw new ForbiddenError('Cannot remove a member with equal or higher role')
    }
  }

  if (target.role === BoardMemberRole.OWNER) {
    throw new ValidationError(null, 'Cannot remove the board OWNER — transfer ownership first')
  }

  await prisma.boardMember.delete({
    where: { boardId_userId: { boardId, userId: targetUserId } },
  })
}

// ── Activity log (cursor pagination) ────────────────────────────────

export async function getActivity(
  userId: string,
  boardId: string,
  params: { cursor?: string | undefined; limit: number },
) {
  await requireBoardRole(userId, boardId, BoardMemberRole.VIEWER)
  const take = params.limit

  const items = await prisma.activityLog.findMany({
    where: { boardId },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(params.cursor && { cursor: { id: params.cursor }, skip: 1 }),
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

  const hasMore = items.length > take
  const page = hasMore ? items.slice(0, take) : items
  const last = page[page.length - 1]
  return {
    items: page,
    nextCursor: hasMore && last ? last.id : null,
  }
}

// Helper for downstream modules to record activity safely.
export async function recordActivity(input: {
  boardId: string
  userId: string
  action: ActivityAction
  taskId?: string | undefined
  diff?: Prisma.InputJsonValue | undefined
}): Promise<void> {
  await prisma.activityLog
    .create({
      data: {
        boardId: input.boardId,
        userId: input.userId,
        action: input.action,
        ...(input.taskId && { taskId: input.taskId }),
        ...(input.diff !== undefined && { diff: input.diff }),
      },
    })
    .catch(() => undefined) // activity logging must never break the main flow
}
