import { z } from 'zod'

export const submitTaskBodySchema = z.object({
  boardId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(20_000).optional(),
  /** Origin of the request (e.g. 'telegram', 'web-form', 'email', 'api', 'ai'). */
  source: z.string().min(1).max(40),
  metadata: z.unknown().optional(),
})

export const incomingTaskSchema = z.object({
  id: z.string(),
  source: z.string(),
  rawPayload: z.unknown(),
  status: z.enum(['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DUPLICATE']),
  dedupHash: z.string(),
  enrichedData: z.unknown().nullable(),
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
  processedAt: z.coerce.date().nullable(),
})

export const submitResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DUPLICATE']),
  taskId: z.string().nullable(),
})

export const listQueueQuerySchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DUPLICATE']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const listQueueResponseSchema = z.object({
  items: z.array(incomingTaskSchema),
  nextCursor: z.string().nullable(),
})

export const incomingIdParam = z.object({ id: z.string().min(1) })

export const conflictResponseSchema = z.object({
  error: z.object({
    code: z.literal('CONFLICT'),
    message: z.string(),
    details: z.object({
      existingIncomingTaskId: z.string(),
      existingStatus: z.string(),
    }),
    requestId: z.string(),
  }),
})
