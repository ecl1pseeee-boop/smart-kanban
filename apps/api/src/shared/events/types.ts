import type { ChecklistItem, Column, Comment, Notification, Task, User } from '@prisma/client'

export interface UserMeta {
  id: string
  name: string
  avatarUrl: string | null
}

export interface CommentWithAuthor extends Comment {
  author: Pick<User, 'id' | 'name' | 'email' | 'avatarUrl'>
}

/**
 * In-process domain events. Subscribers: Socket.IO bridge (Step 8),
 * AutomationEngine (Step 9), NotificationService (Step 13).
 *
 * `originSocketId` is set automatically by the bus when the request carried
 * an `X-Socket-Id` header — Socket.IO subscribers use it to skip echoing
 * an event back to the client that initiated it (Section 5.3 of SPEC.md).
 */
export interface DomainEvents {
  'task:created': { task: Task; actorId: string; originSocketId?: string }
  'task:updated': {
    task: Task
    previous: Task
    actorId: string
    originSocketId?: string
  }
  'task:moved': {
    task: Task
    fromColumnId: string
    toColumnId: string
    position: number
    actorId: string
    originSocketId?: string
  }
  'task:deleted': {
    taskId: string
    boardId: string
    columnId: string
    actorId: string
    originSocketId?: string
  }
  'task:locked': {
    task: Task
    locker: UserMeta
    actorId: string
    originSocketId?: string
  }
  'task:unlocked': { task: Task; actorId: string; originSocketId?: string }

  'column:created': { column: Column; actorId: string; originSocketId?: string }
  'column:updated': {
    column: Column
    previous: Column
    actorId: string
    originSocketId?: string
  }
  'column:deleted': {
    columnId: string
    boardId: string
    actorId: string
    originSocketId?: string
  }
  'column:reordered': {
    boardId: string
    columns: { id: string; position: number }[]
    actorId: string
    originSocketId?: string
  }

  'comment:added': {
    comment: CommentWithAuthor
    taskId: string
    boardId: string
    actorId: string
    originSocketId?: string
  }
  'comment:deleted': {
    commentId: string
    taskId: string
    boardId: string
    actorId: string
    originSocketId?: string
  }

  'checklist:updated': {
    taskId: string
    boardId: string
    items: ChecklistItem[]
    actorId: string
    originSocketId?: string
  }

  'notification:new': {
    notification: Notification
    recipientId: string
    actorId: string
    originSocketId?: string
  }
}

export type DomainEventName = keyof DomainEvents
