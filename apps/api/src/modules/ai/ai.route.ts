import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  analyzeBugBodySchema,
  analyzeBugResponseSchema,
  dailySummaryBodySchema,
  dailySummaryResponseSchema,
  decomposeBodySchema,
  decomposeResponseSchema,
} from './ai.schemas.js'
import * as aiService from './ai.service.js'

/** Per-user rate limit for AI endpoints (Section 11 of SPEC.md). */
const AI_RATE_LIMIT = {
  max: 20,
  timeWindow: '1 minute',
  keyGenerator: (req: { user?: { id?: string }; ip: string }) => req.user?.id ?? req.ip,
}

export const aiRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.post(
    '/decompose',
    {
      config: { rateLimit: AI_RATE_LIMIT },
      schema: {
        tags: ['ai'],
        summary: 'Decompose a task into an actionable checklist via Claude',
        description:
          'Loads the task from DB, calls Claude with structured outputs. Returns up to 8 steps. Falls back to a keyword-based heuristic if `ANTHROPIC_API_KEY` is unset, the model refuses, or the call fails.',
        security: [{ bearerAuth: [] }],
        body: decomposeBodySchema,
        response: { 200: decomposeResponseSchema },
      },
    },
    async (req) => aiService.decompose(req.user!.id, req.body),
  )

  app.post(
    '/daily-summary',
    {
      config: { rateLimit: AI_RATE_LIMIT },
      schema: {
        tags: ['ai'],
        summary: 'Generate a daily summary for the board',
        description:
          'Aggregates 24h activity, upcoming deadlines (48h), and stuck tasks (>3d), then asks Claude to produce a structured summary.',
        security: [{ bearerAuth: [] }],
        body: dailySummaryBodySchema,
        response: { 200: dailySummaryResponseSchema },
      },
    },
    async (req) => aiService.dailySummary(req.user!.id, req.body),
  )

  app.post(
    '/analyze-bug',
    {
      config: { rateLimit: AI_RATE_LIMIT },
      schema: {
        tags: ['ai'],
        summary: 'Draft a bug-card from text and/or a screenshot',
        description:
          'Accepts optional description and optional base64 image (data URL or raw). Returns a task draft {title, description, priority, tags}.',
        security: [{ bearerAuth: [] }],
        body: analyzeBugBodySchema,
        response: { 200: analyzeBugResponseSchema },
      },
    },
    async (req) => aiService.analyzeBug(req.body),
  )
}
