import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Plus, X } from 'lucide-react'
import type {
  Action,
  Column,
  Condition,
  ConditionField,
  ConditionOp,
  Rule,
  Trigger,
} from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  ACTION_LABELS,
  FIELD_LABELS,
  OP_LABELS,
  PRIORITIES,
  TRIGGER_LABELS,
  VALID_OPS_BY_FIELD,
  describeAction,
  describeCondition,
  emptyAction,
  emptyCondition,
} from './ruleHelpers'

interface Props {
  initial?: Pick<Rule, 'name' | 'trigger' | 'conditions' | 'actions' | 'isActive'>
  columns: Column[]
  busy?: boolean
  error?: string | null
  onSubmit: (
    payload: Pick<Rule, 'name' | 'trigger' | 'conditions' | 'actions'> & {
      isActive?: boolean
    },
  ) => void
  onCancel: () => void
  submitLabel?: string
}

const LABEL_STYLE: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-muted)',
  marginBottom: 6,
  display: 'block',
}

const ROW_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
  gap: 8,
  alignItems: 'center',
  padding: 10,
  borderRadius: 'var(--radius-md)',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--border-subtle)',
}

const ERROR_STYLE: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)',
  color: '#fca5a5',
  fontSize: 13,
}

const PREVIEW_STYLE: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid rgba(139,92,246,0.25)',
  background: 'rgba(139,92,246,0.06)',
  padding: 12,
  fontSize: 13,
  color: 'var(--text-primary)',
}

export function RuleEditor({
  initial,
  columns,
  busy,
  error,
  onSubmit,
  onCancel,
  submitLabel = 'Сохранить',
}: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [trigger, setTrigger] = useState<Trigger>(initial?.trigger ?? 'TASK_CREATED')
  const [conditions, setConditions] = useState<Condition[]>(initial?.conditions ?? [])
  const [actions, setActions] = useState<Action[]>(initial?.actions ?? [emptyAction()])

  useEffect(() => {
    if (initial) {
      setName(initial.name)
      setTrigger(initial.trigger)
      setConditions(initial.conditions)
      setActions(initial.actions)
    }
  }, [initial])

  const preview = useMemo(() => {
    const condText =
      conditions.length === 0
        ? 'без условий'
        : conditions.map((c) => describeCondition(c, columns)).join(' И ')
    const actText = actions.map((a) => describeAction(a, columns)).join(', ')
    return `Когда «${TRIGGER_LABELS[trigger]}», если ${condText} → ${actText || 'нет действий'}`
  }, [trigger, conditions, actions, columns])

  const submit = () => {
    onSubmit({
      name: name.trim(),
      trigger,
      conditions,
      actions,
      ...(initial?.isActive !== undefined && { isActive: initial.isActive }),
    })
  }

  const canSubmit = name.trim().length > 0 && actions.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <label style={LABEL_STYLE}>Название</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например: «Срочное → в IN_PROGRESS»"
        />
      </div>

      <div>
        <label style={LABEL_STYLE}>Триггер</label>
        <select
          value={trigger}
          onChange={(e) => setTrigger(e.target.value as Trigger)}
          className="pb-input"
        >
          {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Conditions */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}
        >
          <label style={LABEL_STYLE}>Условия (И)</label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConditions((cs) => [...cs, emptyCondition()])}
          >
            <Plus size={12} /> добавить
          </Button>
        </div>
        {conditions.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
            Условий нет — правило срабатывает на каждый триггер
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conditions.map((c, idx) => (
            <ConditionRow
              key={idx}
              value={c}
              columns={columns}
              onChange={(next) =>
                setConditions((cs) => cs.map((c, i) => (i === idx ? next : c)))
              }
              onRemove={() => setConditions((cs) => cs.filter((_, i) => i !== idx))}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}
        >
          <label style={LABEL_STYLE}>Действия</label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActions((as) => [...as, emptyAction()])}
          >
            <Plus size={12} /> добавить
          </Button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {actions.map((a, idx) => (
            <ActionRow
              key={idx}
              value={a}
              columns={columns}
              onChange={(next) =>
                setActions((as) => as.map((x, i) => (i === idx ? next : x)))
              }
              onRemove={
                actions.length > 1
                  ? () => setActions((as) => as.filter((_, i) => i !== idx))
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      <div style={PREVIEW_STYLE}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--accent-from)',
            marginBottom: 4,
          }}
        >
          Превью
        </div>
        <div>{preview}</div>
      </div>

      {error && <div style={ERROR_STYLE}>{error}</div>}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          paddingTop: 14,
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <Button variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <Button variant="primary" onClick={submit} disabled={!canSubmit || busy}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

// ── Condition row ─────────────────────────────────────────────────

function ConditionRow({
  value,
  columns,
  onChange,
  onRemove,
}: {
  value: Condition
  columns: Column[]
  onChange: (next: Condition) => void
  onRemove: () => void
}) {
  const validOps = VALID_OPS_BY_FIELD[value.field]
  return (
    <div style={ROW_STYLE}>
      <select
        value={value.field}
        onChange={(e) => {
          const field = e.target.value as ConditionField
          const ops = VALID_OPS_BY_FIELD[field]
          const operator = ops.includes(value.operator) ? value.operator : ops[0]!
          onChange({ ...value, field, operator, value: '' })
        }}
        className="pb-input"
        style={{ gridColumn: 'span 3' }}
      >
        {Object.entries(FIELD_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>

      <select
        value={value.operator}
        onChange={(e) => onChange({ ...value, operator: e.target.value as ConditionOp })}
        className="pb-input"
        style={{ gridColumn: 'span 3' }}
      >
        {validOps.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>

      <div style={{ gridColumn: 'span 5' }}>
        <ValueEditor condition={value} columns={columns} onChange={onChange} />
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        aria-label="убрать"
        style={{ gridColumn: 'span 1' }}
      >
        <X size={14} />
      </Button>
    </div>
  )
}

function ValueEditor({
  condition,
  columns,
  onChange,
}: {
  condition: Condition
  columns: Column[]
  onChange: (next: Condition) => void
}) {
  if (condition.operator === 'is_empty') {
    return (
      <span style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-subtle)' }}>
        — нет значения —
      </span>
    )
  }
  if (condition.field === 'priority') {
    return (
      <select
        className="pb-input"
        value={typeof condition.value === 'string' ? condition.value : ''}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    )
  }
  if (condition.field === 'columnId') {
    return (
      <select
        className="pb-input"
        value={typeof condition.value === 'string' ? condition.value : ''}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
      >
        <option value="">— колонка —</option>
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    )
  }
  if (condition.field === 'dueDate') {
    return (
      <Input
        value={typeof condition.value === 'string' ? condition.value : ''}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        placeholder='Напр.: "24h" или "2026-06-01"'
      />
    )
  }
  return (
    <Input
      value={typeof condition.value === 'string' ? condition.value : ''}
      onChange={(e) => onChange({ ...condition, value: e.target.value })}
      placeholder="значение"
    />
  )
}

// ── Action row ────────────────────────────────────────────────────

function ActionRow({
  value,
  columns,
  onChange,
  onRemove,
}: {
  value: Action
  columns: Column[]
  onChange: (next: Action) => void
  onRemove?: () => void
}) {
  return (
    <div style={ROW_STYLE}>
      <select
        value={value.type}
        onChange={(e) => onChange(actionWithDefaults(e.target.value as Action['type']))}
        className="pb-input"
        style={{ gridColumn: 'span 4' }}
      >
        {Object.entries(ACTION_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <div style={{ gridColumn: 'span 7' }}>
        <ActionParamsEditor value={value} columns={columns} onChange={onChange} />
      </div>
      {onRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label="убрать"
          style={{ gridColumn: 'span 1' }}
        >
          <X size={14} />
        </Button>
      )}
    </div>
  )
}

function actionWithDefaults(type: Action['type']): Action {
  switch (type) {
    case 'move_to_column':
      return { type, params: { columnId: '' } }
    case 'move_to_top':
      return { type, params: {} }
    case 'set_priority':
      return { type, params: { priority: 'HIGH' } }
    case 'add_tag':
      return { type, params: { tag: '' } }
    case 'assign_to':
      return { type, params: { target: 'creator' } }
    case 'notify_user':
      return { type, params: { target: 'assignee' } }
    case 'send_telegram':
      return { type, params: { target: 'assignee' } }
  }
}

function ActionParamsEditor({
  value,
  columns,
  onChange,
}: {
  value: Action
  columns: Column[]
  onChange: (next: Action) => void
}) {
  switch (value.type) {
    case 'move_to_column':
      return (
        <select
          className="pb-input"
          value={value.params.columnId}
          onChange={(e) =>
            onChange({ type: 'move_to_column', params: { columnId: e.target.value } })
          }
        >
          <option value="">— колонка —</option>
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )
    case 'move_to_top':
      return (
        <span style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-subtle)' }}>
          — без параметров —
        </span>
      )
    case 'set_priority':
      return (
        <select
          className="pb-input"
          value={value.params.priority}
          onChange={(e) =>
            onChange({
              type: 'set_priority',
              params: { priority: e.target.value as (typeof PRIORITIES)[number] },
            })
          }
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      )
    case 'add_tag':
      return (
        <Input
          value={value.params.tag}
          onChange={(e) => onChange({ type: 'add_tag', params: { tag: e.target.value } })}
          placeholder="например «срочно»"
        />
      )
    case 'assign_to':
      return (
        <select
          className="pb-input"
          value={value.params.target ?? 'creator'}
          onChange={(e) =>
            onChange({
              type: 'assign_to',
              params: { target: e.target.value as 'creator' | 'specific' },
            })
          }
        >
          <option value="creator">создателю задачи</option>
          <option value="specific">конкретному (введите userId далее)</option>
        </select>
      )
    case 'notify_user':
    case 'send_telegram':
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            className="pb-input"
            value={
              value.params.target === 'creator' || value.params.target === 'assignee'
                ? value.params.target
                : 'specific'
            }
            onChange={(e) => {
              const t = e.target.value
              onChange({
                type: value.type,
                params: {
                  target:
                    t === 'creator' || t === 'assignee' ? t : value.params.target || '',
                },
              })
            }}
          >
            <option value="assignee">исполнителю</option>
            <option value="creator">создателю</option>
            <option value="specific">по userId</option>
          </select>
          {value.params.target !== 'creator' && value.params.target !== 'assignee' && (
            <Input
              value={value.params.target}
              onChange={(e) =>
                onChange({ type: value.type, params: { target: e.target.value } })
              }
              placeholder="userId"
            />
          )}
        </div>
      )
  }
}
