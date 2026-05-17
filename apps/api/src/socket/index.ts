import type { Server as HttpServer } from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { corsOrigins } from '../config/env.js'
import { createRedisConnection } from '../config/redis.js'
import { logger } from '../shared/logger.js'
import { socketAuthMiddleware } from './auth.js'
import { registerSocketHandlers } from './handlers.js'
import { bridgeEventBusToSocket } from './event-bridge.js'
import type { AppNamespace } from './types.js'

export interface SocketBundle {
  io: SocketIOServer
  boards: AppNamespace
  close: () => Promise<void>
}

export function attachSocketServer(server: HttpServer): SocketBundle {
  const io = new SocketIOServer(server, {
    cors: { origin: corsOrigins, credentials: true },
    path: '/socket.io',
  })

  // Redis adapter: enables multi-instance broadcast through Redis pub/sub.
  const pubClient = createRedisConnection()
  const subClient = createRedisConnection()
  io.adapter(createAdapter(pubClient, subClient))

  const boards = io.of('/boards') as AppNamespace
  boards.use(socketAuthMiddleware)

  boards.on('connection', (socket) => {
    logger.info(
      { socketId: socket.id, userId: socket.data.user.id, name: socket.data.user.name },
      'socket connected',
    )
    void registerSocketHandlers(boards, socket).catch((err) => {
      logger.error({ err, socketId: socket.id }, 'failed to register socket handlers')
    })
    socket.on('disconnect', (reason) => {
      logger.debug({ socketId: socket.id, reason }, 'socket disconnected')
    })
  })

  bridgeEventBusToSocket(boards)

  return {
    io,
    boards,
    close: async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()))
      await pubClient.quit().catch(() => undefined)
      await subClient.quit().catch(() => undefined)
    },
  }
}
