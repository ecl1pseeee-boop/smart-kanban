import { z } from 'zod'

export const priorityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
export const statusEnum = z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'ARCHIVED'])

const userMiniSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().nullable(),
})

export const checklistItemSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  text: z.string(),
  done: z.boolean(),
  position: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
})

export const commentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  authorId: z.string(),
  text: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  author: userMiniSchema,
})

export const taskBaseSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  columnId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priority: priorityEnum,
  status: statusEnum,
  position: z.number().int().nonnegative(),
  tags: z.array(z.string()),
  dueDate: z.coerce.date().nullable(),
  assigneeId: z.string().nullable(),
  creatorId: z.string(),
  lockedBy: z.string().nullable(),
  lockedAt: z.coerce.date().nullable(),
  metadata: z.unknown().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const taskDetailSchema = taskBaseSchema.extend({
  assignee: userMiniSchema.nullable(),
  creator: userMiniSchema,
  locker: userMiniSchema.nullable(),
  checklistItems: z.array(checklistItemSchema),
  commentCount: z.number().int().nonnegative(),
})

export const taskListItemSchema = taskBaseSchema.extend({
  checklistTotal: z.number().int().nonnegative(),
  checklistDone: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
})

// ── Path / query params ────────────────────────────────────────────

export const boardIdParam = z.object({ boardId: z.string().min(1) })
export const taskIdParam = z.object({ taskId: z.string().min(1) })
export const commentParams = taskIdParam.extend({ commentId: z.string().min(1) })

export const listTasksQuerySchema = z.object({
  priority: priorityEnum.optional(),
  assigneeId: z.string().min(1).optional(), // exact id, 'me', or 'unassigned'
  tag: z.string().min(1).optional(),
  dueBefore: z.coerce.date().optional(),
  dueAfter: z.coerce.date().optional(),
  q: z.string().min(1).max(200).optional(),
  columnId: z.string().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

// ── Bodies ─────────────────────────────────────────────────────────

export const createTaskBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(20_000).optional(),
  columnId: z.string().min(1).optional(),
  priority: priorityEnum.optional().default('MEDIUM'),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  dueDate: z.coerce.date().optional(),
  assigneeId: z.string().min(1).optional(),
})

export const patchTaskBodySchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(20_000).nullable(),
    priority: priorityEnum,
    status: statusEnum,
    tags: z.array(z.string().min(1).max(40)).max(20),
    dueDate: z.coerce.date().nullable(),
    assigneeId: z.string().min(1).nullable(),
  })
  .partial()

export const moveTaskBodySchema = z.object({
  columnId: z.string().min(1),
  position: z.number().int().nonnegative(),
})

export const createCommentBodySchema = z.object({
  text: z.string().min(1).max(10_000),
})

export const checklistPatchItemSchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().min(1).max(500),
  done: z.boolean().default(false),
})

export const checklistPatchBodySchema = z.object({
  items: z.array(checklistPatchItemSchema).max(100),
})

// ── Responses ──────────────────────────────────────────────────────

export const taskListPageSchema = z.object({
  items: z.array(taskListItemSchema),
  nextCursor: z.string().nullable(),
})
