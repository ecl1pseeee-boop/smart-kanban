import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus, Inbox, Settings, Trash2, Check, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useBoardStore } from '@/stores/boardStore'
import { api, ApiError } from '@/lib/api'
import type { Column as ColumnType, TaskCardData } from '@/lib/types'
import { GlassCard } from '../ui/GlassCard'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { TaskCard } from './TaskCard'

const COLOR_PRESETS: readonly string[] = [
  '#8b5cf6',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#64748b',
]

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

interface Props {
  column: ColumnType
  tasks: TaskCardData[]
  boardId: string
  onTaskOpen: (id: string) => void
}

const TITLE_STYLE: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

export function Column({ column, tasks, boardId, onTaskOpen }: Props) {
  const qc = useQueryClient()
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${column.id}`,
    data: { type: 'column', columnId: column.id },
  })
  const apply = useBoardStore((s) => s.applyTaskCreated)
  const [addingTitle, setAddingTitle] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const create = useMutation({
    mutationFn: () =>
      api.createTask(boardId, { title: addingTitle.trim(), columnId: column.id }),
    onSuccess: (t) => {
      apply(t)
      setAddingTitle('')
      setIsAdding(false)
      qc.invalidateQueries({ queryKey: ['boards'] })
    },
  })

  const overLimit = column.wipLimit !== null && tasks.length > column.wipLimit

  return (
    <GlassCard
      radius="var(--radius-xl)"
      style={{
        width: 300,
        minWidth: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        ...(overLimit
          ? {
              border: '1px solid rgba(239,68,68,0.4)',
              boxShadow: '0 0 32px rgba(239,68,68,0.12) inset',
            }
          : null),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 10px',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {column.color && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: column.color,
                flexShrink: 0,
              }}
            />
          )}
          <h3 style={TITLE_STYLE}>{column.name}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Badge
            variant={overLimit ? 'danger' : 'default'}
            dot={false}
            style={overLimit ? { color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' } : undefined}
          >
            {tasks.length}
            {column.wipLimit !== null && ` / ${column.wipLimit}`}
          </Badge>
          <ColumnSettingsButton column={column} boardId={boardId} />
        </div>
      </div>

      <div
        ref={setNodeRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '4px 12px 12px',
          minHeight: 60,
          overflowY: 'auto',
          flex: 1,
          background: isOver ? 'rgba(139,92,246,0.06)' : 'transparent',
          transition: 'background var(--transition-fast)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onOpen={() => onTaskOpen(t.id)} />
          ))}
        </SortableContext>

        {tasks.length === 0 && !isAdding && (
          <EmptyState
            icon={<Inbox size={36} />}
            title="Пока пусто"
            description="Добавьте первую задачу в колонку"
          />
        )}

        {isAdding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Input
              autoFocus
              placeholder="Заголовок задачи"
              value={addingTitle}
              onChange={(e) => setAddingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && addingTitle.trim()) {
                  e.preventDefault()
                  create.mutate()
                }
                if (e.key === 'Escape') {
                  setIsAdding(false)
                  setAddingTitle('')
                }
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="primary"
                size="sm"
                disabled={!addingTitle.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                Добавить
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAdding(false)
                  setAddingTitle('')
                }}
              >
                Отмена
              </Button>
            </div>
            {create.error && (
              <p style={{ fontSize: 12, color: '#fca5a5' }}>
                {create.error instanceof ApiError ? create.error.message : 'Ошибка'}
              </p>
            )}
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            style={{ justifyContent: 'flex-start', color: 'var(--text-subtle)' }}
          >
            <Plus size={14} />
            Добавить задачу
          </Button>
        )}
      </div>
    </GlassCard>
  )
}

interface SettingsProps {
  column: ColumnType
  boardId: string
}

function ColumnSettingsButton({ column, boardId }: SettingsProps) {
  const qc = useQueryClient()
  const applyUpdated = useBoardStore((s) => s.applyColumnUpdated)
  const applyDeleted = useBoardStore((s) => s.applyColumnDeleted)
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const [name, setName] = useState(column.name)
  const [color, setColor] = useState<string | null>(column.color)
  const [wipText, setWipText] = useState(column.wipLimit?.toString() ?? '')
  const [isDefault, setIsDefault] = useState(column.isDefault)

  // Reset form whenever the popover opens, so external updates don't get
  // overwritten by stale local state from a previous session.
  useEffect(() => {
    if (!open) return
    setName(column.name)
    setColor(column.color)
    setWipText(column.wipLimit?.toString() ?? '')
    setIsDefault(column.isDefault)
    setConfirmDelete(false)
  }, [open, column.name, column.color, column.wipLimit, column.isDefault])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        !buttonRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Anchor the popover to the gear button via viewport coordinates. We re-run
  // on open, resize, and scroll so it tracks the button even when the kanban
  // row scrolls horizontally.
  useLayoutEffect(() => {
    if (!open) return
    const POPOVER_W = 280
    const update = () => {
      const btn = buttonRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const margin = 8
      let left = r.right - POPOVER_W
      if (left < margin) left = margin
      if (left + POPOVER_W > window.innerWidth - margin) {
        left = window.innerWidth - POPOVER_W - margin
      }
      setPos({ top: r.bottom + 8, left })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  const patch = useMutation({
    mutationFn: (body: {
      name?: string
      color?: string | null
      wipLimit?: number | null
      isDefault?: boolean
    }) => api.patchColumn(boardId, column.id, body),
    onSuccess: (updated) => {
      applyUpdated(updated.id, updated)
      qc.invalidateQueries({ queryKey: ['boards', boardId] })
      setOpen(false)
    },
  })

  const del = useMutation({
    mutationFn: () => api.deleteColumn(boardId, column.id),
    onSuccess: () => {
      applyDeleted(column.id)
      qc.invalidateQueries({ queryKey: ['boards', boardId] })
      setOpen(false)
    },
  })

  const trimmedName = name.trim()
  const wipTrimmed = wipText.trim()
  const wipParsed: number | null = wipTrimmed === '' ? null : Number(wipTrimmed)
  const wipValid =
    wipParsed === null ||
    (Number.isInteger(wipParsed) && wipParsed >= 1 && wipParsed <= 999)
  const colorValid = color === null || HEX_RE.test(color)

  const hasChanges =
    trimmedName !== column.name ||
    (color ?? null) !== (column.color ?? null) ||
    wipParsed !== column.wipLimit ||
    isDefault !== column.isDefault

  const canSave = trimmedName.length > 0 && wipValid && colorValid && hasChanges

  const save = () => {
    if (!canSave) return
    const body: {
      name?: string
      color?: string | null
      wipLimit?: number | null
      isDefault?: boolean
    } = {}
    if (trimmedName !== column.name) body.name = trimmedName
    if ((color ?? null) !== (column.color ?? null)) body.color = color
    if (wipParsed !== column.wipLimit) body.wipLimit = wipParsed
    if (isDefault !== column.isDefault) body.isDefault = isDefault
    patch.mutate(body)
  }

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        aria-label="Настройки колонки"
        onClick={() => setOpen((v) => !v)}
        style={{ padding: '6px 8px', color: 'var(--text-subtle)' }}
      >
        <Settings size={14} />
      </Button>
      {open && pos && createPortal(
        <GlassCard
          ref={popoverRef}
          glow={false}
          radius="var(--radius-lg)"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 50,
            width: 280,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Field label="Название">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) {
                  e.preventDefault()
                  save()
                }
              }}
            />
          </Field>

          <Field label="Цвет">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COLOR_PRESETS.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  active={color === c}
                  onClick={() => setColor(c)}
                />
              ))}
              <Swatch color={null} active={color === null} onClick={() => setColor(null)} />
            </div>
          </Field>

          <Field
            label="WIP-лимит"
            hint={wipParsed === null ? 'Без ограничений' : `Подсветка при > ${wipParsed}`}
          >
            <Input
              type="number"
              min={1}
              max={999}
              placeholder="—"
              value={wipText}
              onChange={(e) => setWipText(e.target.value)}
              trailing={
                wipText !== '' && (
                  <button
                    type="button"
                    onClick={() => setWipText('')}
                    aria-label="Снять лимит"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-subtle)',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'inline-flex',
                    }}
                  >
                    <X size={12} />
                  </button>
                )
              }
            />
          </Field>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 13,
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <span>
              По умолчанию
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: 'var(--text-subtle)',
                  marginTop: 2,
                }}
              >
                Новые задачи будут попадать сюда
              </span>
            </span>
            <Toggle checked={isDefault} onChange={setIsDefault} />
          </label>

          {patch.error && (
            <p style={{ fontSize: 12, color: '#fca5a5', margin: 0 }}>
              {patch.error instanceof ApiError ? patch.error.message : 'Ошибка сохранения'}
            </p>
          )}
          {del.error && (
            <p style={{ fontSize: 12, color: '#fca5a5', margin: 0 }}>
              {del.error instanceof ApiError ? del.error.message : 'Не удалось удалить'}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="primary"
              size="sm"
              disabled={!canSave || patch.isPending}
              onClick={save}
              style={{ flex: 1 }}
            >
              <Check size={14} />
              Сохранить
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
          </div>

          <div
            style={{
              height: 1,
              background: 'var(--border-subtle)',
              margin: '2px -14px',
            }}
          />

          {confirmDelete ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  margin: 0,
                }}
              >
                Удалить колонку «{column.name}»? Колонка должна быть пустой.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={del.isPending}
                  onClick={() => del.mutate()}
                  style={{
                    flex: 1,
                    borderColor: 'rgba(239,68,68,0.4)',
                    color: '#fca5a5',
                  }}
                >
                  <Trash2 size={14} />
                  Удалить
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              style={{
                justifyContent: 'flex-start',
                color: '#fca5a5',
              }}
            >
              <Trash2 size={14} />
              Удалить колонку
            </Button>
          )}
        </GlassCard>,
        document.body,
      )}
    </>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--text-muted)',
          }}
        >
          {label}
        </span>
        {hint && (
          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{hint}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function Swatch({
  color,
  active,
  onClick,
}: {
  color: string | null
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={color ?? 'Без цвета'}
      aria-pressed={active}
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background:
          color ??
          'repeating-linear-gradient(45deg, transparent 0 4px, rgba(255,255,255,0.15) 4px 6px)',
        border: active
          ? '2px solid var(--text-primary)'
          : '1px solid var(--border-subtle)',
        cursor: 'pointer',
        padding: 0,
        boxShadow: active ? '0 0 0 2px rgba(139,92,246,0.25)' : undefined,
        transition: 'box-shadow var(--transition-fast), border-color var(--transition-fast)',
      }}
    />
  )
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: 36,
        height: 20,
        borderRadius: 999,
        border: '1px solid var(--border-subtle)',
        background: checked ? 'rgba(139,92,246,0.6)' : 'var(--bg-input)',
        cursor: 'pointer',
        padding: 0,
        transition: 'background var(--transition-fast)',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 1,
          left: checked ? 17 : 1,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left var(--transition-fast)',
        }}
      />
    </button>
  )
}
