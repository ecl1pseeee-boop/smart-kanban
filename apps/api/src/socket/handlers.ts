import { BoardMemberRole } from '@prisma/client'
import { logger } from '../shared/logger.js'
import { getBoardRole } from '../shared/access/board-access.js'
import { boardRoom, parseBoardRoom } from './rooms.js'
import type { AppNamespace, AppSocket, PresenceUser } from './types.js'

async function getRoomPresence(ns: AppNamespace, room: string): Promise<PresenceUser[]> {
  const sockets = await ns.in(room).fetchSockets()
  return sockets.map((s) => ({
    socketId: s.id,
    user: {
      id: s.data.user.id,
      name: s.data.user.name,
      avatarUrl: s.data.user.avatarUrl,
    },
    viewingTaskId: s.data.viewingTaskId,
  }))
}

export const userRoom = (userId: string): string => `user:${userId}`

export async function registerSocketHandlers(
  ns: AppNamespace,
  socket: AppSocket,
): Promise<void> {
  const log = logger.child({ socketId: socket.id, userId: socket.data.user.id })

  // Personal room — used for direct delivery (notifications, future DMs).
  // Awaited so the room is joined BEFORE any subsequent emit reaches the
  // bridge — otherwise an event fired between connect and join is lost.
  await socket.join(userRoom(socket.data.user.id))

  socket.on('board:join', async ({ boardId }, ack) => {
    if (!boardId || typeof boardId !== 'string') {
      ack?.({ ok: false, error: 'boardId required' })
      socket.emit('error', { code: 'VALIDATION_ERROR', message: 'boardId required' })
      return
    }

    const role = await getBoardRole(socket.data.user.id, boardId)
    if (!role) {
      ack?.({ ok: false, error: 'NOT_FOUND' })
      socket.emit('error', { code: 'NOT_FOUND', message: 'Board not found' })
      return
    }

    const room = boardRoom(boardId)
    await socket.join(room)
    log.debug({ boardId, role }, 'board:join')

    // 1) Snapshot of who's already viewing the board → to the joiner only.
    socket.emit('presence:state', { boardId, users: await getRoomPresence(ns, room) })

    // 2) Notify everyone else in the room of the new arrival.
    socket.to(room).emit('presence:joined', {
      boardId,
      userId: socket.data.user.id,
      name: socket.data.user.name,
      avatarUrl: socket.data.user.avatarUrl,
      socketId: socket.id,
    })
    ack?.({ ok: true })
  })

  socket.on('board:leave', async ({ boardId }, ack) => {
    if (!boardId || typeof boardId !== 'string') {
      ack?.({ ok: false })
      return
    }
    const room = boardRoom(boardId)
    if (socket.rooms.has(room)) {
      await socket.leave(room)
      socket.to(room).emit('presence:left', {
        boardId,
        userId: socket.data.user.id,
        socketId: socket.id,
      })
      log.debug({ boardId }, 'board:leave')
    }
    ack?.({ ok: true })
  })

  socket.on('presence:viewing', ({ boardId, taskId }) => {
    if (!boardId || typeof boardId !== 'string') return
    const room = boardRoom(boardId)
    if (!socket.rooms.has(room)) return // must be in the board first
    socket.data.viewingTaskId = taskId
    socket.to(room).emit('presence:viewing', {
      boardId,
      userId: socket.data.user.id,
      socketId: socket.id,
      taskId,
    })
  })

  // Cleanup: fires before rooms are cleared, so we can still enumerate them.
  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      const boardId = parseBoardRoom(room)
      if (!boardId) continue
      socket.to(room).emit('presence:left', {
        boardId,
        userId: socket.data.user.id,
        socketId: socket.id,
      })
    }
    log.debug('disconnecting')
  })
}
