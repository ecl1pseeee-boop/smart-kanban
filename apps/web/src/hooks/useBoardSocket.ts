import { useEffect } from 'react'
import { connectSocket, getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/authStore'
import { useBoardStore } from '@/stores/boardStore'
import type { Column, PresenceUser, TaskCardData, UserMini } from '@/lib/types'

/**
 * Joins the given board's Socket.IO room and bridges every relevant
 * `task:*`, `column:*` and `presence:*` event into the Zustand store.
 *
 * Events emitted by the current socket carry an `originSocketId` matching
 * ours — we ignore those because the originating mutation already updated
 * our local state optimistically.
 */
export function useBoardSocket(boardId: string | null): void {
  const token = useAuthStore((s) => s.accessToken)
  const store = useBoardStore

  useEffect(() => {
    if (!boardId || !token) return
    const sock = connectSocket(token)
    const mySocketId = () => sock.id

    const isMine = (originSocketId?: string) =>
      originSocketId !== undefined && originSocketId === mySocketId()

    // Join + initial presence snapshot
    const join = () => sock.emit('board:join', { boardId })
    if (sock.connected) join()
    else sock.once('connect', join)

    // ── Task events ────────────────────────────────────────────────
    const onTaskCreated = (e: { task: TaskCardData; originSocketId?: string }) => {
      if (isMine(e.originSocketId)) return
      store.getState().applyTaskCreated(e.task)
    }
    const onTaskUpdated = (e: {
      taskId: string
      changes: Partial<TaskCardData>
      originSocketId?: string
    }) => {
      if (isMine(e.originSocketId)) return
      store.getState().applyTaskUpdated(e.taskId, e.changes)
    }
    const onTaskMoved = (e: {
      taskId: string
      toColumnId: string
      position: number
      originSocketId?: string
    }) => {
      if (isMine(e.originSocketId)) return
      store.getState().applyTaskMoved(e.taskId, e.toColumnId, e.position)
    }
    const onTaskDeleted = (e: { taskId: string; originSocketId?: string }) => {
      if (isMine(e.originSocketId)) return
      store.getState().applyTaskDeleted(e.taskId)
    }
    const onTaskLocked = (e: {
      taskId: string
      lockedBy: UserMini
      originSocketId?: string
    }) => {
      if (isMine(e.originSocketId)) return
      store.getState().applyTaskLocked(e.taskId, e.lockedBy)
    }
    const onTaskUnlocked = (e: { taskId: string; originSocketId?: string }) => {
      if (isMine(e.originSocketId)) return
      store.getState().applyTaskUnlocked(e.taskId)
    }

    // ── Column events ──────────────────────────────────────────────
    const onColumnCreated = (e: { column: Column; originSocketId?: string }) => {
      if (isMine(e.originSocketId)) return
      store.getState().applyColumnCreated(e.column)
    }
    const onColumnUpdated = (e: {
      columnId: string
      changes: Partial<Column>
      originSocketId?: string
    }) => {
      if (isMine(e.originSocketId)) return
      store.getState().applyColumnUpdated(e.columnId, e.changes)
    }
    const onColumnDeleted = (e: { columnId: string; originSocketId?: string }) => {
      if (isMine(e.originSocketId)) return
      store.getState().applyColumnDeleted(e.columnId)
    }

    // ── Presence ───────────────────────────────────────────────────
    const onPresenceState = (e: { users: PresenceUser[] }) =>
      store.getState().presenceState(e.users)
    const onPresenceJoined = (e: {
      socketId: string
      userId: string
      name: string
      avatarUrl: string | null
    }) =>
      store.getState().presenceJoined({
        socketId: e.socketId,
        user: { id: e.userId, name: e.name, avatarUrl: e.avatarUrl },
      })
    const onPresenceLeft = (e: { socketId: string }) =>
      store.getState().presenceLeft(e.socketId)
    const onPresenceViewing = (e: { socketId: string; taskId: string | null }) =>
      store.getState().presenceViewing(e.socketId, e.taskId)

    sock.on('task:created', onTaskCreated)
    sock.on('task:updated', onTaskUpdated)
    sock.on('task:moved', onTaskMoved)
    sock.on('task:deleted', onTaskDeleted)
    sock.on('task:locked', onTaskLocked)
    sock.on('task:unlocked', onTaskUnlocked)
    sock.on('column:created', onColumnCreated)
    sock.on('column:updated', onColumnUpdated)
    sock.on('column:deleted', onColumnDeleted)
    sock.on('presence:state', onPresenceState)
    sock.on('presence:joined', onPresenceJoined)
    sock.on('presence:left', onPresenceLeft)
    sock.on('presence:viewing', onPresenceViewing)

    return () => {
      sock.emit('board:leave', { boardId })
      sock.off('task:created', onTaskCreated)
      sock.off('task:updated', onTaskUpdated)
      sock.off('task:moved', onTaskMoved)
      sock.off('task:deleted', onTaskDeleted)
      sock.off('task:locked', onTaskLocked)
      sock.off('task:unlocked', onTaskUnlocked)
      sock.off('column:created', onColumnCreated)
      sock.off('column:updated', onColumnUpdated)
      sock.off('column:deleted', onColumnDeleted)
      sock.off('presence:state', onPresenceState)
      sock.off('presence:joined', onPresenceJoined)
      sock.off('presence:left', onPresenceLeft)
      sock.off('presence:viewing', onPresenceViewing)
    }
  }, [boardId, token, store])
}

/** Emits a `presence:viewing` to fellow board members. Returns void. */
export function emitViewing(boardId: string, taskId: string | null): void {
  const s = getSocket()
  s?.emit('presence:viewing', { boardId, taskId })
}
