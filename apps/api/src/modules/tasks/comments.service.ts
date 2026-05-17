import { BoardMemberRole, ActivityAction } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error.js'
import { ROLE_LEVEL } from '../../shared/access/board-access.js'
import { eventBus } from '../../shared/events/index.js'
import { getAccessibleTask } from './tasks.service.js'
import { recordActivity } from '../boards/boards.service.js'

export async function listComments(userId: string, taskId: string) {
  await getAccessibleTask(userId, taskId, BoardMemberRole.VIEWER)
  return prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  })
}

export async function createComment(userId: string, taskId: string, input: { text: string }) {
  const { task } = await getAccessibleTask(userId, taskId, BoardMemberRole.MEMBER)
  const comment = await prisma.comment.create({
    data: { taskId, authorId: userId, text: input.text },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  })
  await recordActivity({
    boardId: task.boardId,
    userId,
    taskId,
    action: ActivityAction.TASK_COMMENTED,
    diff: { commentId: comment.id },
  })
  eventBus.emit('comment:added', {
    comment,
    taskId,
    boardId: task.boardId,
    actorId: userId,
  })
  return comment
}

export async function deleteComment(
  userId: string,
  taskId: string,
  commentId: string,
): Promise<void> {
  const { task, role } = await getAccessibleTask(userId, taskId, BoardMemberRole.MEMBER)

  const comment = await prisma.comment.findUnique({ where: { id: commentId } })
  if (!comment || comment.taskId !== taskId) throw new NotFoundError('Comment')

  const isAuthor = comment.authorId === userId
  const isAdmin = ROLE_LEVEL[role] >= ROLE_LEVEL[BoardMemberRole.ADMIN]
  if (!isAuthor && !isAdmin) {
    throw new ForbiddenError('Only the author or a board ADMIN can delete this comment')
  }

  await prisma.comment.delete({ where: { id: commentId } })
  await recordActivity({
    boardId: task.boardId,
    userId,
    taskId,
    action: ActivityAction.TASK_UPDATED,
    diff: { deletedCommentId: commentId },
  })
  eventBus.emit('comment:deleted', {
    commentId,
    taskId,
    boardId: task.boardId,
    actorId: userId,
  })
}
