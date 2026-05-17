import type { Namespace, Socket } from 'socket.io'
import type { Task, Column, Notification, User } from '@prisma/client'
import type { UserPublic } from '../modules/auth/auth.schemas.js'
import type { CommentWithAuthor } from '../shared/events/types.js'

export interface PresenceUser {
  socketId: string
  user: Pick<User, 'id' | 'name' | 'avatarUrl'>
  viewingTaskId: string | null
}

export interface ServerToClientEvents {
  // Tasks
  'task:created': (p: { task: Task; originSocketId?: string }) => void
  'task:updated': (p: { taskId: string; changes: Partial<Task>; originSocketId?: string }) => void
  'task:moved': (p: {
    taskId: string
    fromColumnId: string
    toColumnId: string
    position: number
    originSocketId?: string
  }) => void
  'task:deleted': (p: { taskId: string; originSocketId?: string }) => void
  'task:locked': (p: {
    taskId: string
    lockedBy: { id: string; name: string; avatarUrl: string | null }
    originSocketId?: string
  }) => void
  'task:unlocked': (p: { taskId: string; originSocketId?: string }) => void

  // Columns
  'column:created': (p: { column: Column; originSocketId?: string }) => void
  'column:updated': (p: { columnId: string; changes: Partial<Column>; originSocketId?: string }) => void
  'column:deleted': (p: { columnId: string; originSocketId?: string }) => void
  'column:reordered': (p: {
    columns: { id: string; position: number }[]
    originSocketId?: string
  }) => void

  // Comments + checklist
  'comment:added': (p: { taskId: string; comment: CommentWithAuthor; originSocketId?: string }) => void
  'comment:deleted': (p: { taskId: string; commentId: string; originSocketId?: string }) => void
  'checklist:updated': (p: {
    taskId: string
    items: unknown[]
    originSocketId?: string
  }) => void

  // Notifications (per-user delivery)
  'notification:new': (p: { notification: Notification; originSocketId?: string }) => void

  // Presence
  'presence:state': (p: { boardId: string; users: PresenceUser[] }) => void
  'presence:joined': (p: {
    boardId: string
    userId: string
    name: string
    avatarUrl: string | null
    socketId: string
  }) => void
  'presence:left': (p: { boardId: string; userId: string; socketId: string }) => void
  'presence:viewing': (p: {
    boardId: string
    userId: string
    socketId: string
    taskId: string | null
  }) => void

  // Errors
  'error': (p: { code: string; message: string }) => void
}

export interface ClientToServerEvents {
  'board:join': (p: { boardId: string }, ack?: (resp: { ok: boolean; error?: string }) => void) => void
  'board:leave': (p: { boardId: string }, ack?: (resp: { ok: boolean }) => void) => void
  'presence:viewing': (p: { boardId: string; taskId: string | null }) => void
}

export interface InterServerEvents {} // none for now

export interface SocketData {
  user: UserPublic
  /** taskId currently viewed in any board the socket is in — single value per socket. */
  viewingTaskId: string | null
}

export type AppNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>
export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>
