import { z } from 'zod'

// ── Link flow ──────────────────────────────────────────────────────

export const generateCodeResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.coerce.date(),
})

export const confirmLinkBodySchema = z.object({
  code: z.string().min(4).max(64),
  telegramId: z.string().min(1).max(64),
  telegramChatId: z.string().min(1).max(64).optional(),
  telegramName: z.string().min(1).max(120).optional(),
})

export const linkedUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  telegramId: z.string().nullable(),
})

export const confirmLinkResponseSchema = z.object({
  user: linkedUserSchema,
})

// ── Bot-scoped resolution ─────────────────────────────────────────

export const telegramIdParam = z.object({
  telegramId: z.string().min(1).max(64),
})

export const telegramBoardParam = telegramIdParam.extend({
  boardId: z.string().min(1),
})

// ── Tasks for "today" ─────────────────────────────────────────────

export const todayTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  boardId: z.string(),
  boardName: z.string(),
  columnName: z.string(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'ARCHIVED']),
  dueDate: z.coerce.date().nullable(),
  isOverdue: z.boolean(),
})

export const todayTasksResponseSchema = z.object({
  items: z.array(todayTaskSchema),
})

// ── Boards listing ────────────────────────────────────────────────

export const myBoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
  taskCount: z.number().int().nonnegative(),
})

export const myBoardsResponseSchema = z.object({
  items: z.array(myBoardSchema),
})

// ── Bug analysis proxy ────────────────────────────────────────────

export const analyzeBugProxyBodySchema = z
  .object({
    description: z.string().min(1).max(20_000).optional(),
    imageBase64: z.string().min(1).max(20_000_000).optional(),
  })
  .refine((d) => Boolean(d.description) || Boolean(d.imageBase64), {
    message: 'description or imageBase64 is required',
  })

export const analyzeBugProxyResponseSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  tags: z.array(z.string()),
  source: z.enum(['ai', 'heuristic']),
})

// ── Submit task proxy ─────────────────────────────────────────────

export const submitTaskProxyBodySchema = z.object({
  boardId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(20_000).optional(),
  metadata: z.unknown().optional(),
})

export const submitTaskProxyResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DUPLICATE']),
  taskId: z.string().nullable(),
})

// ── Daily summary proxy ───────────────────────────────────────────

export const dailySummaryProxyResponseSchema = z.object({
  summary: z.string(),
  source: z.enum(['ai', 'heuristic']),
})
