import { eventBus } from '../shared/events/index.js'
import { boardRoom } from './rooms.js'
import { userRoom } from './handlers.js'
import type { AppNamespace } from './types.js'

/**
 * Subscribes Socket.IO to the in-process EventBus and fans events out to the
 * appropriate board room. Subscribers from other parts of the system
 * (AutomationEngine, NotificationService) can listen to the same bus —
 * Socket.IO is just one consumer.
 *
 * Each broadcast carries `originSocketId` (when present) so that the client
 * that initiated the change can ignore the echo (Section 5.3 of SPEC.md).
 */
export function bridgeEventBusToSocket(ns: AppNamespace): void {
  // ── Tasks ────────────────────────────────────────────────────────
  eventBus.on('task:created', ({ task, originSocketId }) => {
    ns.to(boardRoom(task.boardId)).emit('task:created', {
      task,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  eventBus.on('task:updated', ({ task, previous, originSocketId }) => {
    // Only forward fields that actually changed → smaller payloads, simpler client merge.
    const changes: Record<string, unknown> = {}
    for (const k of Object.keys(task) as (keyof typeof task)[]) {
      if (JSON.stringify(task[k]) !== JSON.stringify(previous[k])) {
        changes[k as string] = task[k]
      }
    }
    ns.to(boardRoom(task.boardId)).emit('task:updated', {
      taskId: task.id,
      changes,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  eventBus.on('task:moved', ({ task, fromColumnId, toColumnId, position, originSocketId }) => {
    ns.to(boardRoom(task.boardId)).emit('task:moved', {
      taskId: task.id,
      fromColumnId,
      toColumnId,
      position,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  eventBus.on('task:deleted', ({ taskId, boardId, originSocketId }) => {
    ns.to(boardRoom(boardId)).emit('task:deleted', {
      taskId,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  eventBus.on('task:locked', ({ task, locker, originSocketId }) => {
    ns.to(boardRoom(task.boardId)).emit('task:locked', {
      taskId: task.id,
      lockedBy: locker,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  eventBus.on('task:unlocked', ({ task, originSocketId }) => {
    ns.to(boardRoom(task.boardId)).emit('task:unlocked', {
      taskId: task.id,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  // ── Columns ──────────────────────────────────────────────────────
  eventBus.on('column:created', ({ column, originSocketId }) => {
    ns.to(boardRoom(column.boardId)).emit('column:created', {
      column,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  eventBus.on('column:updated', ({ column, previous, originSocketId }) => {
    const changes: Record<string, unknown> = {}
    for (const k of Object.keys(column) as (keyof typeof column)[]) {
      if (JSON.stringify(column[k]) !== JSON.stringify(previous[k])) {
        changes[k as string] = column[k]
      }
    }
    ns.to(boardRoom(column.boardId)).emit('column:updated', {
      columnId: column.id,
      changes,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  eventBus.on('column:deleted', ({ columnId, boardId, originSocketId }) => {
    ns.to(boardRoom(boardId)).emit('column:deleted', {
      columnId,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  eventBus.on('column:reordered', ({ boardId, columns, originSocketId }) => {
    ns.to(boardRoom(boardId)).emit('column:reordered', {
      columns,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  // ── Comments + checklist ─────────────────────────────────────────
  eventBus.on('comment:added', ({ boardId, taskId, comment, originSocketId }) => {
    ns.to(boardRoom(boardId)).emit('comment:added', {
      taskId,
      comment,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  eventBus.on('comment:deleted', ({ boardId, taskId, commentId, originSocketId }) => {
    ns.to(boardRoom(boardId)).emit('comment:deleted', {
      taskId,
      commentId,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  eventBus.on('checklist:updated', ({ boardId, taskId, items, originSocketId }) => {
    ns.to(boardRoom(boardId)).emit('checklist:updated', {
      taskId,
      items,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })

  // ── Notifications (per-user delivery, not per-board) ─────────────
  eventBus.on('notification:new', ({ notification, recipientId, originSocketId }) => {
    ns.to(userRoom(recipientId)).emit('notification:new', {
      notification,
      ...(originSocketId !== undefined && { originSocketId }),
    })
  })
}
