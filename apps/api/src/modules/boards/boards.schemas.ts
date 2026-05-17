import { z } from 'zod'

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const boardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  isPublic: z.boolean(),
  ownerId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const boardMemberRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'])

export const boardMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  boardId: z.string(),
  role: boardMemberRoleSchema,
  joinedAt: z.coerce.date(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    avatarUrl: z.string().nullable(),
  }),
})

export const boardListItemSchema = boardSchema.extend({
  role: boardMemberRoleSchema,
  memberCount: z.number().int().nonnegative(),
  taskCount: z.number().int().nonnegative(),
})

export const columnSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  position: z.number().int().nonnegative(),
  wipLimit: z.number().int().positive().nullable(),
  isDefault: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const taskCardSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  columnId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'ARCHIVED']),
  position: z.number().int().nonnegative(),
  tags: z.array(z.string()),
  dueDate: z.coerce.date().nullable(),
  assigneeId: z.string().nullable(),
  creatorId: z.string(),
  lockedBy: z.string().nullable(),
  lockedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  checklistTotal: z.number().int().nonnegative(),
  checklistDone: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
})

export const boardStateSchema = z.object({
  board: boardSchema.extend({ role: boardMemberRoleSchema }),
  columns: z.array(columnSchema),
  tasks: z.array(taskCardSchema),
})

export const createBoardBodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  slug: z.string().regex(slugRe, 'slug must be lowercase, alphanumeric, kebab-case').optional(),
  isPublic: z.boolean().optional().default(false),
})

export const patchBoardBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).nullable(),
    isPublic: z.boolean(),
  })
  .partial()

export const addMemberBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
})

export const boardIdParamSchema = z.object({
  boardId: z.string().min(1),
})

export const memberIdParamSchema = boardIdParamSchema.extend({
  userId: z.string().min(1),
})

export const activityQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const activityItemSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  taskId: z.string().nullable(),
  userId: z.string(),
  action: z.enum([
    'TASK_CREATED',
    'TASK_UPDATED',
    'TASK_MOVED',
    'TASK_DELETED',
    'TASK_ASSIGNED',
    'TASK_COMMENTED',
    'COLUMN_CREATED',
    'COLUMN_UPDATED',
    'RULE_TRIGGERED',
  ]),
  diff: z.unknown().nullable(),
  createdAt: z.coerce.date(),
  user: z.object({ id: z.string(), name: z.string(), avatarUrl: z.string().nullable() }),
})

export const activityPageSchema = z.object({
  items: z.array(activityItemSchema),
  nextCursor: z.string().nullable(),
})
