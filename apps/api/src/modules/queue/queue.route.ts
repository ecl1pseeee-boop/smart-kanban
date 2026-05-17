import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  incomingIdParam,
  listQueueQuerySchema,
  listQueueResponseSchema,
  submitTaskBodySchema,
  submitResponseSchema,
  incomingTaskSchema,
} from './queue.schemas.js'
import * as queueService from './queue.service.js'

const SUBMIT_RATE_LIMIT = { max: 100, timeWindow: '1 minute' }

export const queueRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.post(
    '/tasks',
    {
      config: { rateLimit: SUBMIT_RATE_LIMIT },
      schema: {
        tags: ['queue'],
        summary: 'External task submission (Telegram bot, web form, AI …)',
        description:
          'Body validated → SHA256 dedup → IncomingTask row → BullMQ worker enriches and creates the real Task. Duplicate within the current hour returns 409.',
        security: [{ bearerAuth: [] }],
        body: submitTaskBodySchema,
        response: { 202: submitResponseSchema },
      },
    },
    async (req, reply) => {
      const result = await queueService.submit({
        ...req.body,
        userId: req.user!.id,
      })
      return reply.status(202).send(result)
    },
  )

  app.get(
    '/tasks',
    {
      schema: {
        tags: ['queue'],
        summary: 'List incoming task records (admin only)',
        security: [{ bearerAuth: [] }],
        querystring: listQueueQuerySchema,
        response: { 200: listQueueResponseSchema },
      },
    },
    async (req) =>
      queueService.listIncoming(req.user!.id, req.query),
  )

  app.post(
    '/tasks/:id/approve',
    {
      schema: {
        tags: ['queue'],
        summary: 'Approve an incoming task → create a real Task (admin only)',
        security: [{ bearerAuth: [] }],
        params: incomingIdParam,
        response: {
          200: z.object({
            incoming: incomingTaskSchema,
            task: z.object({ id: z.string(), title: z.string(), boardId: z.string() }),
          }),
        },
      },
    },
    async (req) =>
      queueService.approveIncoming(req.user!.id, req.params.id),
  )

  app.post(
    '/tasks/:id/reject',
    {
      schema: {
        tags: ['queue'],
        summary: 'Reject an incoming task (admin only)',
        security: [{ bearerAuth: [] }],
        params: incomingIdParam,
        body: z.object({ reason: z.string().max(500).optional() }).optional(),
        response: { 200: incomingTaskSchema },
      },
    },
    async (req) =>
      queueService.rejectIncoming(req.user!.id, req.params.id, req.body?.reason),
  )
}
