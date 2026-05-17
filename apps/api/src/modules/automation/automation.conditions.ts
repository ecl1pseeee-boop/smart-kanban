import type { Task } from '@prisma/client'
import type { Condition } from './automation.schemas.js'

/**
 * Parses '24h', '2d', '30m' into milliseconds. Returns null for invalid.
 * Used by `before`/`after` on the `dueDate` field.
 */
function parseDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = /^(\d+)\s*([smhd])$/.exec(value.trim().toLowerCase())
  if (!m) return null
  const n = Number(m[1])
  switch (m[2]) {
    case 's':
      return n * 1000
    case 'm':
      return n * 60_000
    case 'h':
      return n * 3_600_000
    case 'd':
      return n * 86_400_000
    default:
      return null
  }
}

function valueAsArray(v: Condition['value']): string[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') return [v]
  return []
}

export interface ConditionEvalResult {
  condition: Condition
  result: boolean
}

export function evaluateConditions(
  conditions: Condition[],
  task: Task,
  now: number = Date.now(),
): { matches: boolean; details: ConditionEvalResult[] } {
  const details = conditions.map((c) => ({
    condition: c,
    result: evaluateOne(c, task, now),
  }))
  return {
    matches: details.every((d) => d.result),
    details,
  }
}

function evaluateOne(c: Condition, task: Task, now: number): boolean {
  const v = c.value
  switch (c.field) {
    case 'tag': {
      switch (c.operator) {
        case 'contains':
          return valueAsArray(v).every((tag) => task.tags.includes(tag))
        case 'equals':
          return JSON.stringify([...task.tags].sort()) === JSON.stringify(valueAsArray(v).sort())
        case 'not_equals':
          return JSON.stringify([...task.tags].sort()) !== JSON.stringify(valueAsArray(v).sort())
        case 'is_empty':
          return task.tags.length === 0
        default:
          return false
      }
    }
    case 'priority': {
      switch (c.operator) {
        case 'equals':
          return valueAsArray(v).includes(task.priority)
        case 'not_equals':
          return !valueAsArray(v).includes(task.priority)
        default:
          return false
      }
    }
    case 'columnId': {
      switch (c.operator) {
        case 'equals':
          return valueAsArray(v).includes(task.columnId)
        case 'not_equals':
          return !valueAsArray(v).includes(task.columnId)
        default:
          return false
      }
    }
    case 'assigneeId': {
      switch (c.operator) {
        case 'is_empty':
          return task.assigneeId === null
        case 'equals':
          return task.assigneeId !== null && valueAsArray(v).includes(task.assigneeId)
        case 'not_equals':
          return task.assigneeId === null || !valueAsArray(v).includes(task.assigneeId)
        default:
          return false
      }
    }
    case 'dueDate': {
      if (c.operator === 'is_empty') return task.dueDate === null
      if (!task.dueDate) return false
      const due = task.dueDate.getTime()
      if (c.operator === 'before' || c.operator === 'after') {
        // value may be a duration like '24h' (relative to now) or an ISO date.
        const offset = parseDuration(v)
        const threshold =
          offset !== null
            ? now + offset
            : typeof v === 'string'
              ? Date.parse(v)
              : NaN
        if (!Number.isFinite(threshold)) return false
        return c.operator === 'before' ? due <= threshold : due >= threshold
      }
      return false
    }
    default:
      return false
  }
}
