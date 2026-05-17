import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { UnauthorizedError } from '../errors/app-error.js'
import { verifyAccessToken } from '../../modules/auth/auth.tokens.js'
import { getUserById } from '../../modules/auth/auth.service.js'

function extractBearer(req: FastifyRequest): string {
  const h = req.headers.authorization
  if (!h) throw new UnauthorizedError('Missing Authorization header')
  const [scheme, token] = h.split(' ')
  if (scheme !== 'Bearer' || !token) throw new UnauthorizedError('Invalid Authorization header')
  return token
}

async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearer(req)
  const payload = await verifyAccessToken(token)
  const user = await getUserById(payload.sub)
  if (!user) throw new UnauthorizedError('User no longer exists')

  req.user = user
  req.log = req.log.child({ userId: user.id })
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('authenticate', authenticate)
})
