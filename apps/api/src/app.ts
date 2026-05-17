import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { ZodError } from 'zod'
import { randomUUID } from 'node:crypto'

import { env, corsOrigins, isDev, isProd } from './config/env.js'
import { redis } from './config/redis.js'
import { logger } from './shared/logger.js'
import { runWithContext } from './shared/context/request-context.js'
import { AppError, ValidationError } from './shared/errors/app-error.js'
import { authPlugin } from './shared/middleware/auth.js'
import { eventBus } from './shared/events/index.js'
import { healthRoutes } from './modules/health/health.route.js'
import { authRoutes } from './modules/auth/auth.route.js'
import { boardsRoutes } from './modules/boards/boards.route.js'
import { columnsRoutes } from './modules/columns/columns.route.js'
import { boardTasksRoutes, tasksRoutes } from './modules/tasks/tasks.route.js'
import { automationRoutes } from './modules/automation/automation.route.js'
import { startAutomationEngine } from './modules/automation/automation.engine.js'
import { queueRoutes } from './modules/queue/queue.route.js'
import { startIncomingTasksWorker } from './modules/queue/queue.worker.js'
import { cronRoutes } from './modules/cron/cron.route.js'
import { scheduleCronJobs, startCronWorker } from './modules/cron/cron.worker.js'
import { aiRoutes } from './modules/ai/ai.route.js'
import { notificationsRoutes } from './modules/notifications/notifications.route.js'
import { telegramRoutes } from './modules/telegram/telegram.route.js'
import { closeAllQueues } from './queue/registry.js'
import type { Worker } from 'bullmq'

export async function buildApp() {
  const app = Fastify({
    logger,
    disableRequestLogging: true, // we log manually in hooks to include status + duration
    genReqId: (req) => {
      const headerId = req.headers['x-request-id']
      return typeof headerId === 'string' && headerId.length > 0 ? headerId : randomUUID()
    },
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MB
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Accept empty JSON body on POST/PATCH/DELETE — many of our "action" routes
  // (mark-as-read, logout, /admin/cron/*) take no body, and the default
  // parser rejects an empty payload as FST_ERR_CTP_EMPTY_JSON_BODY.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const raw = typeof body === 'string' ? body.trim() : ''
      if (raw.length === 0) {
        done(null, {})
        return
      }
      try {
        done(null, JSON.parse(raw))
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  // ── Security & CORS ──────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: isProd ? undefined : false })
  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  })

  // ── Rate limiting (Redis store) ──────────────────────────────────
  await app.register(rateLimit, {
    redis,
    global: false, // each route opts in
    nameSpace: 'rl:',
    keyGenerator: (req) => req.ip,
  })

  // ── Swagger (OpenAPI 3) ──────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Smart Kanban API',
        description: 'Real-time канбан с AI и Telegram-ботом',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  })
  await app.register(swaggerUi, {
    routePrefix: '/documentation',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  })

  // ── Request-scoped AsyncLocalStorage ─────────────────────────────
  app.addHook('onRequest', (req, _reply, done) => {
    const headerSocketId = req.headers['x-socket-id']
    const socketId =
      typeof headerSocketId === 'string' && headerSocketId.length > 0
        ? headerSocketId
        : undefined
    runWithContext(
      { requestId: req.id, ...(socketId !== undefined && { socketId }) },
      done,
    )
  })

  // ── Structured request logging ───────────────────────────────────
  app.addHook('onResponse', (req, reply, done) => {
    req.log.info(
      {
        method: req.method,
        path: req.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      'request completed',
    )
    done()
  })

  // ── Centralized error handler (Section 12 of SPEC.md) ────────────
  app.setErrorHandler((err, req, reply) => {
    const requestId = req.id

    if (err instanceof ZodError) {
      const validation = new ValidationError(
        err.issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
      )
      req.log.warn({ err: validation.message, details: validation.details }, 'validation error')
      return reply.status(validation.statusCode).send({
        error: {
          code: validation.code,
          message: validation.message,
          details: validation.details,
          requestId,
        },
      })
    }

    if (err instanceof AppError) {
      const level = err.statusCode >= 500 ? 'error' : 'warn'
      req.log[level]({ code: err.code, statusCode: err.statusCode }, err.message)
      return reply.status(err.statusCode).send({
        error: {
          code: err.code,
          message: err.message,
          details: err.details ?? null,
          requestId,
        },
      })
    }

    // Fastify built-in validation errors
    if (err.validation) {
      req.log.warn({ validation: err.validation }, 'fastify validation failed')
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message,
          details: err.validation,
          requestId,
        },
      })
    }

    if (err.statusCode && err.statusCode < 500) {
      req.log.warn({ err: err.message, statusCode: err.statusCode }, 'client error')
      return reply.status(err.statusCode).send({
        error: {
          code: err.code ?? 'CLIENT_ERROR',
          message: err.message,
          details: null,
          requestId,
        },
      })
    }

    req.log.error({ err: err.message, stack: err.stack }, 'unhandled error')
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: isDev ? err.message : 'Internal server error',
        details: null,
        requestId,
      },
    })
  })

  // ── 404 envelope ─────────────────────────────────────────────────
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.url} not found`,
        details: null,
        requestId: req.id,
      },
    })
  })

  // ── Auth decorator (req.user + app.authenticate) ─────────────────
  await app.register(authPlugin)

  // ── AutomationEngine: subscribes to EventBus, runs board rules ──
  startAutomationEngine()

  // ── BullMQ: workers + repeatable schedulers ──────────────────────
  const incomingWorker: Worker = startIncomingTasksWorker()
  const cronWorker: Worker = startCronWorker()
  await scheduleCronJobs()
  app.addHook('onClose', async () => {
    await Promise.allSettled([incomingWorker.close(), cronWorker.close()])
    await closeAllQueues()
  })

  // ── EventBus diagnostics in dev: log every domain event ──────────
  if (isDev) {
    eventBus.onAny((name, payload) => {
      const origin =
        (payload as { originSocketId?: string }).originSocketId ?? '(none)'
      logger.info({ event: name, originSocketId: origin }, 'bus event')
    })
  }

  // ── Routes ───────────────────────────────────────────────────────
  await app.register(healthRoutes)
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' })
      await api.register(
        async (boards) => {
          await boards.register(boardsRoutes)
          await boards.register(columnsRoutes, { prefix: '/:boardId/columns' })
          await boards.register(boardTasksRoutes, { prefix: '/:boardId/tasks' })
          await boards.register(automationRoutes, { prefix: '/:boardId/rules' })
        },
        { prefix: '/boards' },
      )
      await api.register(tasksRoutes, { prefix: '/tasks' })
      await api.register(queueRoutes, { prefix: '/queue' })
      await api.register(cronRoutes, { prefix: '/admin/cron' })
      await api.register(aiRoutes, { prefix: '/ai' })
      await api.register(notificationsRoutes, { prefix: '/notifications' })
      await api.register(telegramRoutes, { prefix: '/telegram' })
    },
    { prefix: '/api' },
  )

  return app
}
