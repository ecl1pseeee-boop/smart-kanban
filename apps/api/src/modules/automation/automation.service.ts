import { AsyncLocalStorage } from 'node:async_hooks'
import { BoardMemberRole, AutomationTrigger, type AutomationRule, type Task } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { redis } from '../../config/redis.js'
import { logger } from '../../shared/logger.js'
import { requireBoardRole } from '../../shared/access/board-access.js'
import { NotFoundError } from '../../shared/errors/app-error.js'
import { eventBus } from '../../shared/events/index.js'
import { recordActivity } from '../boards/boards.service.js'
import {
  type Action,
  type Condition,
  conditionSchema,
  actionSchema,
} from './automation.schemas.js'
import { evaluateConditions } from './automation.conditions.js'
import { executeAction } from './automation.actions.js'
import { ActivityAction } from '@prisma/client'

const CACHE_TTL_SECONDS = 60
const cacheKey = (boardId: string) => `automation:rules:${boardId}`

// ── Recursion guard ────────────────────────────────────────────────
// While an automation is running, downstream event emits (task:moved,
// task:updated …) must NOT re-enter the engine, or we'd hit infinite loops
// when rules act on the same trigger family they listen to.

const insideAutomation = new AsyncLocalStorage<true>()
export const isInsideAutomation = (): boolean => insideAutomation.getStore() === true

// ── Cache ──────────────────────────────────────────────────────────

export async function getActiveRules(
  boardId: string,
  trigger: AutomationTrigger,
): Promise<AutomationRule[]> {
  const key = cacheKey(boardId)
  const cached = await redis.get(key).catch(() => null)
  let all: AutomationRule[] | null = null

  if (cached) {
    try {
      const parsed = JSON.parse(cached) as Array<
        Omit<AutomationRule, 'createdAt' | 'updatedAt'> & {
          createdAt: string
          updatedAt: string
        }
      >
      all = parsed.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      }))
    } catch {
      all = null
    }
  }

  if (!all) {
    all = await prisma.automationRule.findMany({
      where: { boardId, isActive: true },
    })
    await redis
      .set(key, JSON.stringify(all), 'EX', CACHE_TTL_SECONDS)
      .catch(() => undefined)
  }

  return all.filter((r) => r.trigger === trigger)
}

async function invalidateCache(boardId: string): Promise<void> {
  await redis.del(cacheKey(boardId)).catch(() => undefined)
}

// ── Engine ─────────────────────────────────────────────────────────

/**
 * Public entry point used by EventBus subscribers. Runs every matching rule
 * for the given trigger; isolates errors so one bad rule cannot stop others.
 */
export async function processTrigger(
  trigger: AutomationTrigger,
  task: Task,
  actorId: string,
): Promise<void> {
  if (isInsideAutomation()) return // prevent rule-induced recursion

  const rules = await getActiveRules(task.boardId, trigger)
  if (rules.length === 0) return

  await insideAutomation.run(true, async () => {
    for (const rule of rules) {
      try {
        const conditions = parseConditionsSafe(rule.conditions)
        const { matches } = evaluateConditions(conditions, task)
        if (!matches) continue

        let mutated = task
        const actions = parseActionsSafe(rule.actions)
        for (const action of actions) {
          try {
            mutated = await executeAction(action, mutated, rule, actorId)
          } catch (actionErr) {
            logger.error(
              { err: actionErr, ruleId: rule.id, action: action.type },
              'rule action failed',
            )
            // continue executing remaining actions
          }
        }

        await recordActivity({
          boardId: task.boardId,
          userId: actorId,
          taskId: task.id,
          action: ActivityAction.RULE_TRIGGERED,
          diff: { ruleName: rule.name, ruleId: rule.id, trigger },
        })

        // If any action changed the task row, emit a single update so the
        // socket bridge propagates the new state to all board viewers.
        if (mutated.updatedAt.getTime() !== task.updatedAt.getTime()) {
          eventBus.emit('task:updated', {
            task: mutated,
            previous: task,
            actorId,
          })
        }
      } catch (err) {
        logger.error({ err, ruleId: rule.id }, 'rule processing failed')
      }
    }
  })
}

function parseConditionsSafe(raw: unknown): Condition[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: Condition[] = []
  for (const c of arr) {
    const parsed = conditionSchema.safeParse(c)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

function parseActionsSafe(raw: unknown): Action[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: Action[] = []
  for (const a of arr) {
    const parsed = actionSchema.safeParse(a)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

/** Prisma stores conditions/actions as Json — parse them into typed shapes
 *  before returning to API consumers. Drops any malformed entries silently. */
function serializeRule(rule: AutomationRule) {
  return {
    ...rule,
    conditions: parseConditionsSafe(rule.conditions),
    actions: parseActionsSafe(rule.actions),
  }
}

// ── CRUD ───────────────────────────────────────────────────────────

export async function listRules(userId: string, boardId: string) {
  await requireBoardRole(userId, boardId, BoardMemberRole.VIEWER)
  const rules = await prisma.automationRule.findMany({
    where: { boardId },
    orderBy: { createdAt: 'asc' },
  })
  return rules.map(serializeRule)
}

export async function createRule(
  userId: string,
  boardId: string,
  input: {
    name: string
    trigger: AutomationTrigger
    conditions: Condition[]
    actions: Action[]
    isActive: boolean
  },
) {
  await requireBoardRole(userId, boardId, BoardMemberRole.ADMIN)
  const rule = await prisma.automationRule.create({
    data: {
      boardId,
      name: input.name,
      trigger: input.trigger,
      conditions: input.conditions,
      actions: input.actions,
      isActive: input.isActive,
    },
  })
  await invalidateCache(boardId)
  return serializeRule(rule)
}

export async function patchRule(
  userId: string,
  boardId: string,
  ruleId: string,
  patch: Partial<{
    name: string
    trigger: AutomationTrigger
    conditions: Condition[]
    actions: Action[]
    isActive: boolean
  }>,
) {
  await requireBoardRole(userId, boardId, BoardMemberRole.ADMIN)
  const existing = await prisma.automationRule.findUnique({ where: { id: ruleId } })
  if (!existing || existing.boardId !== boardId) throw new NotFoundError('AutomationRule')

  const updated = await prisma.automationRule.update({
    where: { id: ruleId },
    data: {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.trigger !== undefined && { trigger: patch.trigger }),
      ...(patch.conditions !== undefined && { conditions: patch.conditions }),
      ...(patch.actions !== undefined && { actions: patch.actions }),
      ...(patch.isActive !== undefined && { isActive: patch.isActive }),
    },
  })
  await invalidateCache(boardId)
  return serializeRule(updated)
}

export async function deleteRule(
  userId: string,
  boardId: string,
  ruleId: string,
): Promise<void> {
  await requireBoardRole(userId, boardId, BoardMemberRole.ADMIN)
  const existing = await prisma.automationRule.findUnique({ where: { id: ruleId } })
  if (!existing || existing.boardId !== boardId) throw new NotFoundError('AutomationRule')
  await prisma.automationRule.delete({ where: { id: ruleId } })
  await invalidateCache(boardId)
}

export async function toggleRule(userId: string, boardId: string, ruleId: string) {
  await requireBoardRole(userId, boardId, BoardMemberRole.ADMIN)
  const existing = await prisma.automationRule.findUnique({ where: { id: ruleId } })
  if (!existing || existing.boardId !== boardId) throw new NotFoundError('AutomationRule')
  const updated = await prisma.automationRule.update({
    where: { id: ruleId },
    data: { isActive: !existing.isActive },
  })
  await invalidateCache(boardId)
  return serializeRule(updated)
}

/** Dry-run a rule against a real task — returns matches + would-execute. */
export async function testRule(
  userId: string,
  boardId: string,
  ruleId: string,
  taskId: string,
) {
  await requireBoardRole(userId, boardId, BoardMemberRole.ADMIN)

  const [rule, task] = await Promise.all([
    prisma.automationRule.findUnique({ where: { id: ruleId } }),
    prisma.task.findUnique({ where: { id: taskId } }),
  ])
  if (!rule || rule.boardId !== boardId) throw new NotFoundError('AutomationRule')
  if (!task || task.boardId !== boardId) throw new NotFoundError('Task')

  const conditions = parseConditionsSafe(rule.conditions)
  const actions = parseActionsSafe(rule.actions)
  const { matches, details } = evaluateConditions(conditions, task)

  return {
    matches,
    evaluatedConditions: details,
    wouldExecute: matches ? actions : [],
  }
}
