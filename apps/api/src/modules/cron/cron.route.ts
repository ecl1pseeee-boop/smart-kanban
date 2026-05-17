import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { ForbiddenError } from '../../shared/errors/app-error.js'
import {
  checkDeadlines,
  eveningSummary,
  morningDigest,
} from './cron.service.js'

const deadlineResult = z.object({
  approachingCount: z.number().int().nonnegative(),
  overdueNotifications: z.number().int().nonnegative(),
  ruleTriggers: z.number().int().nonnegative(),
})
const digestResult = z.object({
  recipients: z.number().int().nonnegative(),
  totalTasks: z.number().int().nonnegative(),
})
const summaryResult = z.object({
  boards: z.number().int().nonnegative(),
  notificationsSent: z.number().int().nonnegative(),
})

async function requireAdmin(userId: string): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  if (u?.role !== 'ADMIN') throw new ForbiddenError('Admin role required')
}

/**
 * Manual triggers — useful for demos and for staging environments where
 * the production cron tick isn't running. Mounted at /api/admin/cron.
 */
export const cronRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.post(
    '/check-deadlines',
    {
      schema: {
        tags: ['cron'],
        summary: 'Manually run the deadline scan (admin only)',
        security: [{ bearerAuth: [] }],
        response: { 200: deadlineResult },
      },
    },
    async (req) => {
      await requireAdmin(req.user!.id)
      return checkDeadlines()
    },
  )

  app.post(
    '/morning-digest',
    {
      schema: {
        tags: ['cron'],
        summary: 'Manually run the 09:00 morning digest (admin only)',
        security: [{ bearerAuth: [] }],
        response: { 200: digestResult },
      },
    },
    async (req) => {
      await requireAdmin(req.user!.id)
      return morningDigest()
    },
  )

  app.post(
    '/evening-summary',
    {
      schema: {
        tags: ['cron'],
        summary: 'Manually run the 18:00 evening AI summary (admin only)',
        security: [{ bearerAuth: [] }],
        response: { 200: summaryResult },
      },
    },
    async (req) => {
      await requireAdmin(req.user!.id)
      return eveningSummary()
    },
  )
}
