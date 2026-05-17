import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FlaskConical, Pencil, Plus, Trash2, Zap } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { Rule, TestRuleResult } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  ACTION_LABELS,
  TRIGGER_LABELS,
  describeAction,
  describeCondition,
} from '@/components/automation/ruleHelpers'
import { RuleEditor } from '@/components/automation/RuleEditor'

type Mode =
  | { kind: 'idle' }
  | { kind: 'create' }
  | { kind: 'edit'; rule: Rule }
  | { kind: 'test'; rule: Rule }

const BREADCRUMB_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: 'var(--text-subtle)',
  marginBottom: 12,
}

export function RulesPage() {
  const { boardId } = useParams({ from: '/boards/$boardId/rules' })
  const qc = useQueryClient()

  const boardQuery = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.getBoardState(boardId),
  })
  const rulesQuery = useQuery({
    queryKey: ['rules', boardId],
    queryFn: () => api.listRules(boardId),
  })

  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (body: Parameters<typeof api.createRule>[1]) =>
      api.createRule(boardId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', boardId] })
      setMode({ kind: 'idle' })
      setError(null)
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Не удалось создать'),
  })

  const patch = useMutation({
    mutationFn: ({
      ruleId,
      body,
    }: {
      ruleId: string
      body: Parameters<typeof api.patchRule>[2]
    }) => api.patchRule(boardId, ruleId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', boardId] })
      setMode({ kind: 'idle' })
      setError(null)
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Не удалось обновить'),
  })

  const toggle = useMutation({
    mutationFn: (ruleId: string) => api.toggleRule(boardId, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules', boardId] }),
  })
  const del = useMutation({
    mutationFn: (ruleId: string) => api.deleteRule(boardId, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules', boardId] }),
  })

  const columns = boardQuery.data?.columns ?? []
  const rules = rulesQuery.data ?? []

  if (boardQuery.isLoading || rulesQuery.isLoading) {
    return (
      <div style={{ maxWidth: 1024, margin: '0 auto', padding: 32, color: 'var(--text-muted)' }}>
        Загрузка…
      </div>
    )
  }
  if (boardQuery.error || rulesQuery.error) {
    return (
      <div style={{ maxWidth: 1024, margin: '0 auto', padding: 32, color: '#fca5a5' }}>
        Не удалось загрузить доску или правила.
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1024, margin: '0 auto', padding: '32px 24px' }}>
      <div style={BREADCRUMB_STYLE}>
        <Link
          to="/boards/$boardId"
          params={{ boardId }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--text-muted)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} />
          {boardQuery.data?.board.name ?? 'Доска'}
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)' }}>Автоматизация</span>
      </div>

      <div
        style={{
          marginBottom: 24,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}
            className="gradient-text"
          >
            Правила автоматизации
          </h1>
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
            Когда срабатывает триггер и условия выполнены — выполнить действия.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setError(null)
            setMode({ kind: 'create' })
          }}
        >
          <Plus size={14} />
          Новое правило
        </Button>
      </div>

      {rules.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<Zap size={48} />}
            title="Здесь пока нет правил"
            description="Автоматизируйте перемещение, назначения, теги и уведомления"
            action={{ label: 'Создать первое', onClick: () => setMode({ kind: 'create' }) }}
          />
        </GlassCard>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.map((r) => (
            <li key={r.id}>
              <GlassCard style={{ padding: 18, opacity: r.isActive ? 1 : 0.65 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <h3
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: r.isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        {r.name}
                      </h3>
                      <Badge dot={false}>{TRIGGER_LABELS[r.trigger]}</Badge>
                      {!r.isActive && (
                        <Badge variant="warning">выкл</Badge>
                      )}
                    </div>
                    <div
                      style={{
                        marginTop: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        fontSize: 12,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {r.conditions.length === 0 ? (
                        <p style={{ fontStyle: 'italic', color: 'var(--text-subtle)' }}>
                          условий нет
                        </p>
                      ) : (
                        r.conditions.map((c, i) => <p key={i}>• {describeCondition(c, columns)}</p>)
                      )}
                      <p style={{ marginTop: 4 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>→ </span>
                        {r.actions.map((a) => describeAction(a, columns)).join(' · ')}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={r.isActive}
                        disabled={toggle.isPending}
                        onChange={() => toggle.mutate(r.id)}
                        style={{ accentColor: 'var(--accent-from)' }}
                      />
                      активно
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setError(null)
                        setMode({ kind: 'test', rule: r })
                      }}
                      title="Тестировать"
                    >
                      <FlaskConical size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setError(null)
                        setMode({ kind: 'edit', rule: r })
                      }}
                      title="Редактировать"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Удалить правило «${r.name}»?`)) del.mutate(r.id)
                      }}
                      title="Удалить"
                      style={{ color: '#fca5a5' }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}

      {(mode.kind === 'create' || mode.kind === 'edit') && (
        <Modal open onClose={() => setMode({ kind: 'idle' })} maxWidth={720}>
          <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: '16px 20px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {mode.kind === 'create' ? 'Новое правило' : `Правило: ${mode.rule.name}`}
            </h2>
          </div>
          <div style={{ padding: 20 }}>
            <RuleEditor
              initial={mode.kind === 'edit' ? mode.rule : undefined}
              columns={columns}
              busy={create.isPending || patch.isPending}
              error={error}
              submitLabel={mode.kind === 'create' ? 'Создать' : 'Сохранить'}
              onCancel={() => setMode({ kind: 'idle' })}
              onSubmit={(payload) => {
                if (mode.kind === 'create') create.mutate(payload)
                else patch.mutate({ ruleId: mode.rule.id, body: payload })
              }}
            />
          </div>
        </Modal>
      )}

      {mode.kind === 'test' && (
        <TestRuleModal boardId={boardId} rule={mode.rule} onClose={() => setMode({ kind: 'idle' })} />
      )}
    </div>
  )
}

function TestRuleModal({
  boardId,
  rule,
  onClose,
}: {
  boardId: string
  rule: Rule
  onClose: () => void
}) {
  const tasksQuery = useQuery({
    queryKey: ['board', boardId, 'tasks-for-test'],
    queryFn: () => api.getBoardState(boardId),
  })
  const tasks = tasksQuery.data?.tasks ?? []
  const columns = tasksQuery.data?.columns ?? []
  const [taskId, setTaskId] = useState<string>('')
  const [result, setResult] = useState<TestRuleResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const test = useMutation({
    mutationFn: () => api.testRule(boardId, rule.id, taskId),
    onSuccess: (r) => {
      setResult(r)
      setError(null)
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Не удалось протестировать'),
  })

  return (
    <Modal open onClose={onClose}>
      <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: '16px 20px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          Тест: {rule.name}
        </h2>
        <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          Выберите задачу — правило проверит условия, действия НЕ выполнятся.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
        <select
          value={taskId}
          onChange={(e) => {
            setTaskId(e.target.value)
            setResult(null)
          }}
          className="pb-input"
        >
          <option value="">— выберите задачу —</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              [{t.priority}] {t.title}
            </option>
          ))}
        </select>

        {error && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <div
            style={{
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${result.matches ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}`,
              background: result.matches
                ? 'rgba(16,185,129,0.06)'
                : 'rgba(255,255,255,0.02)',
              padding: 14,
              fontSize: 13,
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              {result.matches ? '✅ Все условия выполнены' : '➖ Условия не пройдены'}
            </div>
            {result.evaluatedConditions.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>У правила нет условий.</p>
            )}
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 2, listStyle: 'none' }}>
              {result.evaluatedConditions.map((ec, i) => (
                <li
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                >
                  <span>{ec.result ? '✓' : '✗'}</span>
                  <span>{describeCondition(ec.condition, columns)}</span>
                </li>
              ))}
            </ul>
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid var(--border-subtle)',
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Выполнились бы:
              </span>{' '}
              {result.wouldExecute.length === 0
                ? '— ничего —'
                : result.wouldExecute.map((a) => ACTION_LABELS[a.type]).join(', ')}
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          borderTop: '1px solid var(--border-subtle)',
          padding: '14px 20px',
        }}
      >
        <Button variant="ghost" onClick={onClose}>
          Закрыть
        </Button>
        <Button
          variant="primary"
          onClick={() => test.mutate()}
          disabled={!taskId || test.isPending}
        >
          <FlaskConical size={14} /> Тестировать
        </Button>
      </div>
    </Modal>
  )
}
