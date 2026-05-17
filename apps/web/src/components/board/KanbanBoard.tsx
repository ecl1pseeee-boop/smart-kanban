import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useBoardStore } from '@/stores/boardStore'
import { api } from '@/lib/api'
import type { TaskCardData } from '@/lib/types'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { GlassCard } from '../ui/GlassCard'
import { Column } from './Column'
import { TaskCard } from './TaskCard'

interface Props {
  onTaskOpen: (id: string) => void
}

export function KanbanBoard({ onTaskOpen }: Props) {
  const qc = useQueryClient()
  const board = useBoardStore((s) => s.board)
  const columns = useBoardStore((s) => s.columns)
  const tasks = useBoardStore((s) => s.tasks)
  const tasksByColumn = useBoardStore((s) => s.tasksByColumn)
  const optimisticMove = useBoardStore((s) => s.optimisticMoveTask)
  const applyMove = useBoardStore((s) => s.applyTaskMoved)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const [activeTask, setActiveTask] = useState<TaskCardData | null>(null)
  const moveSnapshot = useMemo(
    () => ({ ref: null as null | { columnId: string; position: number } }),
    [],
  )

  const moveMutation = useMutation({
    mutationFn: (vars: { taskId: string; toColumnId: string; position: number }) =>
      api.moveTask(vars.taskId, vars.toColumnId, vars.position),
    onError: (_e, vars) => {
      if (moveSnapshot.ref) {
        applyMove(vars.taskId, moveSnapshot.ref.columnId, moveSnapshot.ref.position)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['board', board?.id] })
    },
  })

  const onDragStart = (e: DragStartEvent) => {
    const t = tasks[String(e.active.id)]
    if (t) setActiveTask(t)
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null)
    const taskId = String(e.active.id)
    const overId = e.over?.id
    if (!overId) return

    const dragged = tasks[taskId]
    if (!dragged) return
    moveSnapshot.ref = { columnId: dragged.columnId, position: dragged.position }

    let toColumnId: string
    let toPosition: number

    const overIdStr = String(overId)
    if (overIdStr.startsWith('col:')) {
      toColumnId = overIdStr.slice(4)
      toPosition = (tasksByColumn[toColumnId] ?? []).length
    } else {
      const overTask = tasks[overIdStr]
      if (!overTask) return
      toColumnId = overTask.columnId
      const targetCol = tasksByColumn[toColumnId] ?? []
      const overIdx = targetCol.indexOf(overTask.id)
      toPosition = overIdx === -1 ? targetCol.length : overIdx
    }

    if (dragged.columnId === toColumnId && dragged.position === toPosition) return

    optimisticMove(taskId, toColumnId, toPosition)
    moveMutation.mutate({ taskId, toColumnId, position: toPosition })
  }

  const [addColumn, setAddColumn] = useState('')
  const [showAddColumn, setShowAddColumn] = useState(false)
  const createColumn = useMutation({
    mutationFn: () => api.createColumn(board!.id, { name: addColumn.trim() }),
    onSuccess: (c) => {
      useBoardStore.getState().applyColumnCreated(c)
      setAddColumn('')
      setShowAddColumn(false)
    },
  })

  if (!board) return null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div
        style={{
          display: 'flex',
          gap: 16,
          height: '100%',
          overflowX: 'auto',
          padding: 24,
          alignItems: 'flex-start',
        }}
      >
        {columns.map((col) => {
          const ids = tasksByColumn[col.id] ?? []
          const list = ids
            .map((id) => tasks[id])
            .filter((t): t is TaskCardData => Boolean(t))
          return (
            <Column
              key={col.id}
              column={col}
              tasks={list}
              boardId={board.id}
              onTaskOpen={onTaskOpen}
            />
          )
        })}

        <div style={{ width: 300, flexShrink: 0 }}>
          {showAddColumn ? (
            <GlassCard radius="var(--radius-xl)" style={{ padding: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input
                  autoFocus
                  placeholder="Название колонки"
                  value={addColumn}
                  onChange={(e) => setAddColumn(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && addColumn.trim()) createColumn.mutate()
                    if (e.key === 'Escape') {
                      setShowAddColumn(false)
                      setAddColumn('')
                    }
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => createColumn.mutate()}
                    disabled={!addColumn.trim() || createColumn.isPending}
                  >
                    Добавить
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddColumn(false)
                      setAddColumn('')
                    }}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            </GlassCard>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setShowAddColumn(true)}
              style={{ width: '100%' }}
            >
              <Plus size={14} />
              Добавить колонку
            </Button>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeTask && (
          <div style={{ transform: 'rotate(1deg)' }}>
            <TaskCard task={activeTask} onOpen={() => undefined} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
