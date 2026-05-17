import type { FastifyReply, FastifyRequest } from 'fastify'
import type { UserPublic } from '../modules/auth/auth.schemas.js'

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserPublic
  }
  interface FastifyInstance {
    /** Pre-handler that enforces a valid Bearer access token and loads `req.user`. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
