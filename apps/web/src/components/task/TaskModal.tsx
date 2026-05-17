import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  CheckSquare,
  Loader2,
  MessageSquare,
  Square,
  Tag,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useBoardStore } from '@/stores/boardStore'
import { emitViewing } from '@/hooks/useBoardSocket'
import { Avatar } from '../ui/Avatar'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Badge } from '../ui/Badge'
import type { ChecklistItem, Comment, Priority } from '@/lib/types'

interface Props {
  taskId: string
  boardId: string
  onClose: () => void
}

const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const SECTION_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-muted)',
  marginBottom: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const TITLE_INPUT_STYLE: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid transparent',
  color: 'var(--text-primary)',
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: '-0.3px',
  outline: 'none',
  padding: '4px 0',
  fontFamily: 'inherit',
  transition: 'border-color var(--transition-fast)',
}

const LOCK_NOTICE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: '#f97316',
  background: 'rgba(249,115,22,0.08)',
  border: '1px solid rgba(249,115,22,0.25)',
  borderRadius: 'var(--radius-full)',
  padding: '4px 10px',
  marginBottom: 8,
}

export function TaskModal({ taskId, boardId, onClose }: Props) {
  const qc = useQueryClient()
  const myId = useAuthStore((s) => s.user?.id) ?? null
  const apply = useBoardStore((s) => s.applyTaskUpdated)
  const removeFromStore = useBoardStore((s) => s.applyTaskDeleted)

  const { data: task, refetch } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.getTask(taskId),
  })

  const [lockState, setLockState] = useState<'idle' | 'locking' | 'mine' | 'taken'>('locking')
  useEffect(() => {
    let cancelled = false
    setLockState('locking')
    api.lockTask(taskId).then(
      () => {
        if (!cancelled) setLockState('mine')
      },
      (err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 409) setLockState('taken')
        else setLockState('idle')
      },
    )
    emitViewing(boardId, taskId)
    return () => {
      cancelled = true
      api.unlockTask(taskId).catch(() => undefined)
      emitViewing(boardId, null)
    }
  }, [taskId, boardId])

  const patch = useMutation({
    mutationFn: (changes: Parameters<typeof api.patchTask>[1]) =>
      api.patchTask(taskId, changes),
    onSuccess: (t) => {
      apply(taskId, t)
      qc.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const del = useMutation({
    mutationFn: () => api.deleteTask(taskId),
    onSuccess: () => {
      removeFromStore(taskId)
      onClose()
    },
  })

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description ?? '')
      setTagsInput('')
    }
  }, [task])

  const readonly = lockState === 'taken'

  if (!task) {
    return (
      <Modal open onClose={onClose}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 48,
            color: 'var(--text-muted)',
          }}
        >
          <Loader2 className="animate-spin" size={16} style={{ marginRight: 8 }} />
          Загрузка…
        </div>
      </Modal>
    )
  }

  const blurSaveTitle = () => {
    const next = title.trim()
    if (!next || next === task.title) return
    patch.mutate({ title: next })
  }
  const blurSaveDescription = () => {
    const next = description
    if (next === (task.description ?? '')) return
    patch.mutate({ description: next || null })
  }

  const addTag = () => {
    const v = tagsInput.trim()
    if (!v) return
    if (task.tags.includes(v)) {
      setTagsInput('')
      return
    }
    patch.mutate({ tags: [...task.tags, v] })
    setTagsInput('')
  }
  const removeTag = (tag: string) =>
    patch.mutate({ tags: task.tags.filter((t) => t !== tag) })

  return (
    <Modal open onClose={onClose} maxWidth={720}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* ── Header ────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            borderBottom: '1px solid var(--border-subtle)',
            padding: 24,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            {lockState === 'taken' && task.locker && (
              <div style={LOCK_NOTICE}>
                Редактирует {task.locker.name} — поля только для чтения
              </div>
            )}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={blurSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              disabled={readonly}
              style={TITLE_INPUT_STYLE}
              onFocus={(e) => {
                e.currentTarget.style.borderBottomColor = 'var(--border-input-focus)'
              }}
              onBlurCapture={(e) => {
                e.currentTarget.style.borderBottomColor = 'transparent'
              }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-subtle)' }}>
              создал {task.creator.name} ·{' '}
              {new Date(task.createdAt).toLocaleDateString('ru-RU')}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Закрыть">
            <X size={16} />
          </Button>
        </div>

        {/* ── Body ──────────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr',
            gap: 24,
            padding: 24,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <section>
              <h3 style={SECTION_LABEL}>Описание</h3>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={blurSaveDescription}
                disabled={readonly}
                placeholder="Markdown поддерживается"
                rows={5}
                className="pb-input"
                style={{ minHeight: 120, resize: 'vertical' }}
              />
            </section>

            <ChecklistSection
              taskId={taskId}
              items={task.checklistItems}
              readonly={readonly}
              onChange={() => refetch()}
            />

            <CommentsSection taskId={taskId} canPost={!readonly} myId={myId} />

            {/* AI decompose — primary call-to-action per spec 21.11 */}
            <div style={{ paddingTop: 8 }}>
              <Button variant="primary">
                🤖 Разбить через AI
              </Button>
            </div>
          </div>

          {/* ── Sidebar ─────────────────────────────────────── */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 18, fontSize: 13 }}>
            <Field label="Приоритет" icon={<Tag size={12} />}>
              <select
                value={task.priority}
                onChange={(e) => patch.mutate({ priority: e.target.value as Priority })}
                disabled={readonly}
                className="pb-input"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Дедлайн" icon={<Calendar size={12} />}>
              <input
                type="date"
                value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                onChange={(e) =>
                  patch.mutate({
                    dueDate: e.target.value
                      ? new Date(`${e.target.value}T00:00:00Z`).toISOString()
                      : null,
                  })
                }
                disabled={readonly}
                className="pb-input"
              />
            </Field>

            <Field label="Исполнитель" icon={<UserIcon size={12} />}>
              <AssigneePicker
                boardId={boardId}
                value={task.assigneeId}
                onChange={(id) => patch.mutate({ assigneeId: id })}
                disabled={readonly}
              />
            </Field>

            <Field label="Теги" icon={<Tag size={12} />}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {task.tags.map((t) => (
                  <Badge key={t} dot={false}>
                    {t}
                    {!readonly && (
                      <button
                        onClick={() => removeTag(t)}
                        style={{
                          marginLeft: 6,
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-subtle)',
                          cursor: 'pointer',
                          padding: 0,
                          lineHeight: 1,
                        }}
                        aria-label="убрать тег"
                      >
                        ×
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
              {!readonly && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                  <Input
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                    placeholder="новый тег"
                  />
                  <Button variant="secondary" size="sm" onClick={addTag}>
                    +
                  </Button>
                </div>
              )}
            </Field>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
              <Button
                variant="ghost"
                onClick={() => del.mutate()}
                disabled={del.isPending}
                style={{
                  width: '100%',
                  color: '#fca5a5',
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                <Trash2 size={14} /> Удалить задачу
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </Modal>
  )
}

// ── Sub-sections ────────────────────────────────────────────────

function Field({
  label,
  icon,
  children,
}: {
  label: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <div style={SECTION_LABEL}>
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}

function AssigneePicker({
  boardId,
  value,
  onChange,
  disabled,
}: {
  boardId: string
  value: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
}) {
  const { data: members } = useQuery({
    queryKey: ['members', boardId],
    queryFn: () => api.listMembers(boardId),
  })

  return (
    <select
      className="pb-input"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      disabled={disabled}
    >
      <option value="">— не назначен —</option>
      {(members ?? []).map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.user.name} ({m.role.toLowerCase()})
        </option>
      ))}
    </select>
  )
}

function ChecklistSection({
  taskId,
  items,
  readonly,
  onChange,
}: {
  taskId: string
  items: ChecklistItem[]
  readonly: boolean
  onChange: () => void
}) {
  const qc = useQueryClient()
  const apply = useBoardStore((s) => s.applyTaskUpdated)
  const [draft, setDraft] = useState('')

  const save = useMutation({
    mutationFn: (next: { id?: string; text: string; done: boolean }[]) =>
      api.patchChecklist(taskId, next),
    onSuccess: (saved) => {
      const total = saved.length
      const done = saved.filter((i) => i.done).length
      apply(taskId, { checklistTotal: total, checklistDone: done })
      qc.invalidateQueries({ queryKey: ['task', taskId] })
      onChange()
    },
  })

  const toggle = (id: string) => {
    const next = items.map((i) => ({
      ...(i.id && { id: i.id }),
      text: i.text,
      done: i.id === id ? !i.done : i.done,
    }))
    save.mutate(next)
  }

  const addItem = () => {
    const v = draft.trim()
    if (!v) return
    save.mutate([
      ...items.map((i) => ({ id: i.id, text: i.text, done: i.done })),
      { text: v, done: false },
    ])
    setDraft('')
  }

  const removeItem = (id: string) => {
    save.mutate(items.filter((i) => i.id !== id).map((i) => ({ id: i.id, text: i.text, done: i.done })))
  }

  const total = items.length
  const done = items.filter((i) => i.done).length

  return (
    <section>
      <h3 style={SECTION_LABEL}>
        <CheckSquare size={12} /> Чек-лист {total > 0 && `(${done}/${total})`}
      </h3>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none' }}>
        {items.map((i) => (
          <li
            key={i.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
          >
            <button
              disabled={readonly || save.isPending}
              onClick={() => toggle(i.id)}
              style={{
                background: 'none',
                border: 'none',
                color: i.done ? 'var(--accent-to)' : 'var(--text-subtle)',
                cursor: readonly || save.isPending ? 'not-allowed' : 'pointer',
                padding: 0,
                display: 'inline-flex',
              }}
            >
              {i.done ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
            <span
              style={{
                color: i.done ? 'var(--text-subtle)' : 'var(--text-primary)',
                textDecoration: i.done ? 'line-through' : 'none',
                flex: 1,
              }}
            >
              {i.text}
            </span>
            {!readonly && (
              <button
                onClick={() => removeItem(i.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-subtle)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                удалить
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readonly && (
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addItem()
              }
            }}
            placeholder="Новый пункт"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={addItem}
            disabled={!draft.trim() || save.isPending}
          >
            +
          </Button>
        </div>
      )}
    </section>
  )
}

function CommentsSection({
  taskId,
  canPost,
  myId,
}: {
  taskId: string
  canPost: boolean
  myId: string | null
}) {
  const apply = useBoardStore((s) => s.applyTaskUpdated)
  const { data: comments, refetch } = useQuery({
    queryKey: ['comments', taskId],
    queryFn: () => api.listComments(taskId),
  })

  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const post = useMutation({
    mutationFn: () => api.addComment(taskId, text.trim()),
    onSuccess: () => {
      setText('')
      apply(taskId, { commentCount: (comments?.length ?? 0) + 1 })
      refetch()
      inputRef.current?.focus()
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.deleteComment(taskId, id),
    onSuccess: () => {
      apply(taskId, { commentCount: Math.max(0, (comments?.length ?? 1) - 1) })
      refetch()
    },
  })

  return (
    <section>
      <h3 style={SECTION_LABEL}>
        <MessageSquare size={12} /> Комментарии {comments?.length ?? 0}
      </h3>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 14, listStyle: 'none' }}>
        {(comments ?? []).map((c: Comment) => (
          <li key={c.id} style={{ display: 'flex', gap: 10 }}>
            <Avatar user={c.author} size="sm" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{c.author.name}</span>
                {' · '}
                {new Date(c.createdAt).toLocaleString('ru-RU')}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text-primary)' }}>
                {c.text}
              </div>
            </div>
            {c.authorId === myId && (
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-subtle)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
                onClick={() => del.mutate(c.id)}
              >
                удалить
              </button>
            )}
          </li>
        ))}
      </ul>
      {canPost && (
        <div style={{ marginTop: 12 }}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="pb-input"
            placeholder="Написать комментарий…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) {
                e.preventDefault()
                post.mutate()
              }
            }}
            style={{ resize: 'vertical' }}
          />
          <div
            style={{
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
              Ctrl/⌘ + Enter — отправить
            </span>
            <Button
              variant="primary"
              size="sm"
              disabled={!text.trim() || post.isPending}
              onClick={() => post.mutate()}
            >
              Отправить
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
