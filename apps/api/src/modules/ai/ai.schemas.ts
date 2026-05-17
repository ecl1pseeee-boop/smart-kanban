import { z } from 'zod'
// The Anthropic SDK's structured-outputs helper (zodOutputFormat) is typed
// against zod v4, while fastify-type-provider-zod is on zod v3. We use both:
// v3 for HTTP request/response shapes (Fastify validation) and v4 for the
// schemas we pass into the SDK (parse() type inference).
import * as zV4 from 'zod/v4'

const sourceTag = z.enum(['ai', 'heuristic'])

// ── HTTP request bodies ────────────────────────────────────────────

export const decomposeBodySchema = z.object({
  taskId: z.string().min(1),
})

export const dailySummaryBodySchema = z.object({
  boardId: z.string().min(1),
})

export const analyzeBugBodySchema = z
  .object({
    description: z.string().min(1).max(20_000).optional(),
    imageBase64: z.string().min(1).max(20_000_000).optional(),
  })
  .refine((d) => Boolean(d.description) || Boolean(d.imageBase64), {
    message: 'description or imageBase64 is required',
  })

// ── LLM output schemas (passed to zodOutputFormat) ────────────────
// These shape what we hand to Claude as the response contract via
// output_config.format. The API guarantees the result matches.
// Written on zod v4 so SDK type inference flows into parsed_output.

export const decomposeLlmSchema = zV4.object({
  steps: zV4.array(zV4.string().min(1).max(500)).min(1).max(8),
})

export const dailySummaryLlmSchema = zV4.object({
  summary: zV4.string().min(1).max(4000),
})

export const analyzeBugLlmSchema = zV4.object({
  title: zV4.string().min(1).max(200),
  description: zV4.string().max(2000),
  priority: zV4.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  tags: zV4.array(zV4.string().min(1).max(40)).max(10),
})

// ── HTTP responses ─────────────────────────────────────────────────

export const decomposeResponseSchema = z.object({
  checklistItems: z.array(z.string()),
  source: sourceTag,
})

export const dailySummaryResponseSchema = z.object({
  summary: z.string(),
  source: sourceTag,
})

export const analyzeBugResponseSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  tags: z.array(z.string()),
  source: sourceTag,
})
