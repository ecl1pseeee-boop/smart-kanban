import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { env } from '../../config/env.js'
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../shared/errors/app-error.js'
import {
  analyzeBugProxyBodySchema,
  analyzeBugProxyResponseSchema,
  confirmLinkBodySchema,
  confirmLinkResponseSchema,
  dailySummaryProxyResponseSchema,
  generateCodeResponseSchema,
  linkedUserSchema,
  myBoardsResponseSchema,
  submitTaskProxyBodySchema,
  submitTaskProxyResponseSchema,
  telegramBoardParam,
  telegramIdParam,
  todayTasksResponseSchema,
} from './telegram.schemas.js'
import * as telegramService from './telegram.service.js'

const BOT_RATE_LIMIT = { max: 120, timeWindow: '1 minute' }

/**
 * Bot-scoped routes — all require `X-Bot-Secret: BOT_SECRET`. Refuses every
 * request with 403 when BOT_SECRET is unset so we don't fall open in a
 * misconfigured environment.
 */
const botOnlyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', (req, _reply, done) => {
    if (!env.BOT_SECRET) {
      return done(new ForbiddenError('Bot integration is not configured'))
    }
    const provided = req.headers['x-bot-secret']
    if (typeof provided !== 'string' || provided !== env.BOT_SECRET) {
      return done(new UnauthorizedError('Invalid bot secret'))
    }
    done()
  })

  app.post(
    '/link/confirm',
    {
      config: { rateLimit: BOT_RATE_LIMIT },
      schema: {
        tags: ['telegram'],
        summary: 'Confirm a link code (bot only)',
        body: confirmLinkBodySchema,
        response: { 200: confirmLinkResponseSchema },
      },
    },
    async (req) => telegramService.confirmLink(req.body),
  )

  app.get(
    '/me/:telegramId',
    {
      config: { rateLimit: BOT_RATE_LIMIT },
      schema: {
        tags: ['telegram'],
        summary: 'Resolve telegramId → user (bot only)',
        params: telegramIdParam,
        response: { 200: linkedUserSchema },
      },
    },
    async (req) => telegramService.meByTelegram(req.params.telegramId),
  )

  app.get(
    '/me/:telegramId/tasks',
    {
      config: { rateLimit: BOT_RATE_LIMIT },
      schema: {
        tags: ['telegram'],
        summary: "Today's tasks for the linked user (bot only)",
        params: telegramIdParam,
        response: { 200: todayTasksResponseSchema },
      },
    },
    async (req) => telegramService.todayTasksByTelegram(req.params.telegramId),
  )

  app.get(
    '/me/:telegramId/boards',
    {
      config: { rateLimit: BOT_RATE_LIMIT },
      schema: {
        tags: ['telegram'],
        summary: 'Boards the linked user is a member of (bot only)',
        params: telegramIdParam,
        response: { 200: myBoardsResponseSchema },
      },
    },
    async (req) => telegramService.myBoardsByTelegram(req.params.telegramId),
  )

  app.post(
    '/me/:telegramId/boards/:boardId/summary',
    {
      config: { rateLimit: BOT_RATE_LIMIT },
      schema: {
        tags: ['telegram'],
        summary: 'Generate a daily summary for a board (bot only)',
        params: telegramBoardParam,
        response: { 200: dailySummaryProxyResponseSchema },
      },
    },
    async (req) =>
      telegramService.dailySummaryByTelegram(
        req.params.telegramId,
        req.params.boardId,
      ),
  )

  app.post(
    '/me/:telegramId/analyze-bug',
    {
      config: { rateLimit: BOT_RATE_LIMIT },
      schema: {
        tags: ['telegram'],
        summary: 'Analyze a bug photo/text via Claude (bot only)',
        params: telegramIdParam,
        body: analyzeBugProxyBodySchema,
        response: { 200: analyzeBugProxyResponseSchema },
      },
    },
    async (req) =>
      telegramService.analyzeBugByTelegram(req.params.telegramId, req.body),
  )

  app.post(
    '/me/:telegramId/queue/tasks',
    {
      config: { rateLimit: BOT_RATE_LIMIT },
      schema: {
        tags: ['telegram'],
        summary: 'Submit an incoming task on behalf of the linked user (bot only)',
        params: telegramIdParam,
        body: submitTaskProxyBodySchema,
        response: { 202: submitTaskProxyResponseSchema },
      },
    },
    async (req, reply) => {
      const result = await telegramService.submitTaskByTelegram(
        req.params.telegramId,
        req.body,
      )
      return reply.status(202).send(result)
    },
  )
}

/**
 * Routes mounted at /api/telegram.
 *
 * Two auth modes here:
 *  • /link/generate — user-authenticated (Bearer). The user opens the web
 *    UI, requests a code, then types it into Telegram.
 *  • everything under botOnlyRoutes — `X-Bot-Secret`. The bot is the only
 *    caller; it identifies the human via `telegramId` in the URL.
 */
export const telegramRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/link/generate',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['telegram'],
        summary: 'Generate a one-time code to link your Telegram account',
        security: [{ bearerAuth: [] }],
        response: { 200: generateCodeResponseSchema },
      },
    },
    async (req) => telegramService.generateLinkCode(req.user!.id),
  )

  await app.register(botOnlyRoutes)
}
