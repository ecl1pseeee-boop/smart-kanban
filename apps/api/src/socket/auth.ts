import { logger } from '../shared/logger.js'
import { verifyAccessToken } from '../modules/auth/auth.tokens.js'
import { getUserById } from '../modules/auth/auth.service.js'
import type { AppSocket } from './types.js'

/**
 * Socket.IO middleware enforcing JWT auth at the handshake.
 *
 * The client should connect with `auth: { token: <accessToken> }`. We accept
 * a plain JWT or `Bearer <jwt>`. On success the resolved user is attached to
 * `socket.data.user`.
 */
export async function socketAuthMiddleware(
  socket: AppSocket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const raw =
      (socket.handshake.auth as { token?: string } | undefined)?.token ??
      socket.handshake.headers.authorization
    if (!raw) return next(new Error('UNAUTHORIZED'))

    const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw
    const payload = await verifyAccessToken(token)

    const user = await getUserById(payload.sub)
    if (!user) return next(new Error('UNAUTHORIZED'))

    socket.data.user = user
    socket.data.viewingTaskId = null

    logger.debug({ userId: user.id, socketId: socket.id }, 'socket authenticated')
    next()
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'socket auth failed')
    next(new Error('UNAUTHORIZED'))
  }
}
