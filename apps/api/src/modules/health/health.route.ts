import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { redis } from '../../config/redis.js'

const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptime: z.number(),
  db: z.enum(['ok', 'down']),
  redis: z.enum(['ok', 'down']),
  version: z.string(),
})

async function checkDb(): Promise<'ok' | 'down'> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return 'ok'
  } catch {
    return 'down'
  }
}

async function checkRedis(): Promise<'ok' | 'down'> {
  try {
    const pong = await redis.ping()
    return pong === 'PONG' ? 'ok' : 'down'
  } catch {
    return 'down'
  }
}

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness + readiness probe',
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (_req, reply) => {
      const [db, redisStatus] = await Promise.all([checkDb(), checkRedis()])
      const ok = db === 'ok' && redisStatus === 'ok'
      const body = {
        status: ok ? ('ok' as const) : ('degraded' as const),
        uptime: process.uptime(),
        db,
        redis: redisStatus,
        version: process.env.npm_package_version ?? '0.1.0',
      }
      return reply.status(ok ? 200 : 503).send(body)
    },
  )
}
