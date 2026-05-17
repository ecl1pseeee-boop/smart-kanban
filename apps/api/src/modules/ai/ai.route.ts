import { z } from 'zod'
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
import { assertTranscript, processVoice } from './process-voice.service.js'

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

  // ── Voice → tasks ────────────────────────────────────────────────
  // Frontend transcribes audio locally via the browser Web Speech API and
  // POSTs the resulting text here. We feed it to a local LLM (Ollama) to
  // extract per-user tasks and persist them. No API keys needed.
  app.post(
    '/process-voice',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: AI_RATE_LIMIT.keyGenerator },
      },
      schema: {
        tags: ['ai'],
        summary: 'Extract per-user tasks from a meeting transcript',
        description:
          'POST {transcript, boardId}. The browser does STT locally; we run a ' +
          'structured-JSON LLM call (Ollama) to split the transcript into tasks ' +
          'and resolve assignees against the board members.',
        security: [{ bearerAuth: [] }],
        body: z.object({
          transcript: z.string().min(3).max(30_000),
          boardId: z.string().min(1),
        }),
        response: {
          200: z.object({
            createdTasks: z.number().int().nonnegative(),
            transcript: z.string(),
            source: z.enum(['ai', 'heuristic']),
          }),
        },
      },
    },
    async (req) => {
      assertTranscript(req.body.transcript)
      return processVoice({
        userId: req.user!.id,
        boardId: req.body.boardId,
        transcript: req.body.transcript,
      })
    },
  )
}
