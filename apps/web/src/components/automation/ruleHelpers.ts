import type {
  Action,
  Column,
  Condition,
  ConditionField,
  ConditionOp,
  Trigger,
} from '@/lib/types'

export const TRIGGER_LABELS: Record<Trigger, string> = {
  TASK_CREATED: 'Задача создана',
  TASK_MOVED: 'Задача перемещена',
  TASK_UPDATED: 'Задача изменена',
  TASK_ASSIGNED: 'Назначен исполнитель',
  DUE_DATE_APPROACHING: 'Скоро дедлайн',
  TAG_ADDED: 'Добавлен тег',
}

export const FIELD_LABELS: Record<ConditionField, string> = {
  tag: 'Тег',
  priority: 'Приоритет',
  columnId: 'Колонка',
  assigneeId: 'Исполнитель',
  dueDate: 'Дедлайн',
}

export const OP_LABELS: Record<ConditionOp, string> = {
  equals: '=',
  not_equals: '≠',
  contains: 'содержит',
  is_empty: 'пусто',
  before: 'до',
  after: 'после',
}

export const ACTION_LABELS: Record<Action['type'], string> = {
  move_to_column: 'Переместить в колонку',
  move_to_top: 'Поднять в начало',
  set_priority: 'Изменить приоритет',
  add_tag: 'Добавить тег',
  assign_to: 'Назначить исполнителя',
  notify_user: 'Уведомить',
  send_telegram: 'Отправить в Telegram',
}

export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

export const VALID_OPS_BY_FIELD: Record<ConditionField, ConditionOp[]> = {
  tag: ['equals', 'contains', 'is_empty'],
  priority: ['equals', 'not_equals'],
  columnId: ['equals', 'not_equals'],
  assigneeId: ['equals', 'not_equals', 'is_empty'],
  dueDate: ['before', 'after', 'is_empty'],
}

export function emptyCondition(): Condition {
  return { field: 'priority', operator: 'equals', value: 'HIGH' }
}

export function emptyAction(): Action {
  return { type: 'notify_user', params: { target: 'assignee' } }
}

/** Human-readable preview of a condition. */
export function describeCondition(c: Condition, columns: Column[]): string {
  if (c.operator === 'is_empty') return `${FIELD_LABELS[c.field]} не задан`
  const v =
    c.field === 'columnId' && typeof c.value === 'string'
      ? columns.find((col) => col.id === c.value)?.name ?? c.value
      : Array.isArray(c.value)
        ? c.value.join(', ')
        : String(c.value)
  return `${FIELD_LABELS[c.field]} ${OP_LABELS[c.operator]} "${v}"`
}

/** Human-readable preview of an action. */
export function describeAction(a: Action, columns: Column[]): string {
  switch (a.type) {
    case 'move_to_column': {
      const col = columns.find((c) => c.id === a.params.columnId)?.name ?? a.params.columnId
      return `${ACTION_LABELS[a.type]} "${col}"`
    }
    case 'move_to_top':
      return ACTION_LABELS[a.type]
    case 'set_priority':
      return `${ACTION_LABELS[a.type]} → ${a.params.priority}`
    case 'add_tag':
      return `${ACTION_LABELS[a.type]} «${a.params.tag}»`
    case 'assign_to':
      return a.params.target === 'specific' && a.params.userId
        ? `${ACTION_LABELS[a.type]} (id ${a.params.userId.slice(0, 6)}…)`
        : 'Назначить создателю'
    case 'notify_user':
      return `Уведомить ${a.params.target}`
    case 'send_telegram':
      return `Telegram → ${a.params.target}`
  }
}
