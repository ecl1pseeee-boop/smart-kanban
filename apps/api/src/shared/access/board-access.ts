import type { BoardMemberRole } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { ForbiddenError, NotFoundError } from '../errors/app-error.js'

export const ROLE_LEVEL: Record<BoardMemberRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
}

/** Returns the caller's role on the board, or null if they are not a member. */
export async function getBoardRole(
  userId: string,
  boardId: string,
): Promise<BoardMemberRole | null> {
  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId } },
    select: { role: true },
  })
  return membership?.role ?? null
}

/**
 * Asserts the caller has at least the required role on the board.
 * Throws NotFoundError (not Forbidden) if they aren't a member — leaking
 * existence of private boards would be a side-channel.
 */
export async function requireBoardRole(
  userId: string,
  boardId: string,
  minRole: BoardMemberRole,
): Promise<BoardMemberRole> {
  const role = await getBoardRole(userId, boardId)
  if (!role) throw new NotFoundError('Board')
  if (ROLE_LEVEL[role] < ROLE_LEVEL[minRole]) {
    throw new ForbiddenError(`Requires ${minRole} role on this board`)
  }
  return role
}
