import { z } from 'zod'

export const triggerSchema = z.enum([
  'TASK_CREATED',
  'TASK_MOVED',
  'TASK_UPDATED',
  'TASK_ASSIGNED',
  'DUE_DATE_APPROACHING',
  'TAG_ADDED',
])
export type Trigger = z.infer<typeof triggerSchema>

export const conditionSchema = z.object({
  field: z.enum(['tag', 'priority', 'columnId', 'assigneeId', 'dueDate']),
  operator: z.enum([
    'equals',
    'contains',
    'not_equals',
    'is_empty',
    'before',
    'after',
  ]),
  value: z.union([z.string(), z.array(z.string()), z.boolean(), z.null()]),
})
export type Condition = z.infer<typeof conditionSchema>

const moveToColumnAction = z.object({
  type: z.literal('move_to_column'),
  params: z.object({
    columnId: z.string().min(1),
    position: z.number().int().nonnegative().optional(),
  }),
})

const moveToTopAction = z.object({
  type: z.literal('move_to_top'),
  params: z.object({}).default({}),
})

const setPriorityAction = z.object({
  type: z.literal('set_priority'),
  params: z.object({
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  }),
})

const addTagAction = z.object({
  type: z.literal('add_tag'),
  params: z.object({ tag: z.string().min(1).max(40) }),
})

const assignToAction = z.object({
  type: z.literal('assign_to'),
  params: z.object({
    target: z.enum(['creator', 'specific']).optional(),
    userId: z.string().min(1).optional(),
  }),
})

const notifyUserAction = z.object({
  type: z.literal('notify_user'),
  params: z.object({
    target: z.union([z.enum(['creator', 'assignee']), z.string().min(1)]),
    message: z.string().min(1).max(500).optional(),
  }),
})

const sendTelegramAction = z.object({
  type: z.literal('send_telegram'),
  params: z.object({
    target: z.union([z.enum(['creator', 'assignee']), z.string().min(1)]),
    message: z.string().min(1).max(500).optional(),
  }),
})

export const actionSchema = z.discriminatedUnion('type', [
  moveToColumnAction,
  moveToTopAction,
  setPriorityAction,
  addTagAction,
  assignToAction,
  notifyUserAction,
  sendTelegramAction,
])
export type Action = z.infer<typeof actionSchema>

export const ruleSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema),
  actions: z.array(actionSchema).min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type RuleDto = z.infer<typeof ruleSchema>

export const createRuleBodySchema = z.object({
  name: z.string().min(1).max(120),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1),
  isActive: z.boolean().optional().default(true),
})

export const patchRuleBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    trigger: triggerSchema,
    conditions: z.array(conditionSchema),
    actions: z.array(actionSchema).min(1),
    isActive: z.boolean(),
  })
  .partial()

export const testRuleBodySchema = z.object({
  taskId: z.string().min(1),
})

export const testRuleResultSchema = z.object({
  matches: z.boolean(),
  evaluatedConditions: z.array(
    z.object({
      condition: conditionSchema,
      result: z.boolean(),
    }),
  ),
  wouldExecute: z.array(actionSchema),
})

export const boardRuleParam = z.object({ boardId: z.string().min(1) })
export const ruleParam = boardRuleParam.extend({ ruleId: z.string().min(1) })
