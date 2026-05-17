import { useState, type CSSProperties } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus, Inbox } from 'lucide-react'
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
        <Badge
          variant={overLimit ? 'danger' : 'default'}
          dot={false}
          style={overLimit ? { color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' } : undefined}
        >
          {tasks.length}
          {column.wipLimit !== null && ` / ${column.wipLimit}`}
        </Badge>
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
