import { useMemo, useState, type CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckSquare, Clock, Lock, MessageSquare } from 'lucide-react'
import { useBoardStore } from '@/stores/boardStore'
import { useAuthStore } from '@/stores/authStore'
import { dueDateClass, formatDate } from '@/lib/format'
import type { TaskCardData } from '@/lib/types'
import { GlassCard } from '../ui/GlassCard'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'

interface Props {
  task: TaskCardData
  onOpen: () => void
}

const META_TEXT: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-subtle)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
}

export function TaskCard({ task, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: 'task', task } })

  const myId = useAuthStore((s) => s.user?.id)
  // Zustand v5 selector equality: pull raw object then derive via useMemo.
  const onlineUsers = useBoardStore((s) => s.onlineUsers)
  const otherViewers = useMemo(
    () =>
      Object.values(onlineUsers).filter(
        (u) => u.viewingTaskId === task.id && u.user.id !== myId,
      ),
    [onlineUsers, task.id, myId],
  )
  const lockedByOther = task.lockedBy && task.lockedBy !== myId

  const [hovered, setHovered] = useState(false)

  const visibleTags = task.tags.slice(0, 3)
  const hiddenTagsCount = task.tags.length - visibleTags.length

  const dueClass = dueDateClass(task.dueDate)
  const dueColor =
    dueClass.includes('red') ? '#ef4444' : dueClass.includes('orange') ? '#f97316' : 'var(--text-subtle)'

  return (
    <GlassCard
      ref={setNodeRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation()
          onOpen()
        }
      }}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        borderColor: hovered ? 'rgba(255,255,255,0.14)' : undefined,
        opacity: isDragging ? 0.5 : 1,
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      radius="var(--radius-lg)"
      {...attributes}
      {...listeners}
    >
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <h4
            style={{
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.35,
              color: 'var(--text-primary)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {task.title}
          </h4>
          {lockedByOther && (
            <Lock
              size={14}
              style={{ color: 'var(--text-subtle)', flexShrink: 0 }}
              aria-label="редактирует другой"
            />
          )}
        </div>

        {visibleTags.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {visibleTags.map((t) => (
              <Badge key={t} dot={false}>
                {t}
              </Badge>
            ))}
            {hiddenTagsCount > 0 && <Badge dot={false}>+{hiddenTagsCount}</Badge>}
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Badge variant={task.priority}>{task.priority}</Badge>
            {task.checklistTotal > 0 && (
              <span style={META_TEXT}>
                <CheckSquare size={12} />
                {task.checklistDone}/{task.checklistTotal}
              </span>
            )}
            {task.commentCount > 0 && (
              <span style={META_TEXT}>
                <MessageSquare size={12} />
                {task.commentCount}
              </span>
            )}
          </div>
          {task.dueDate && (
            <span style={{ ...META_TEXT, color: dueColor, fontWeight: dueColor === '#ef4444' ? 600 : 400 }}>
              <Clock size={12} />
              {formatDate(task.dueDate)}
            </span>
          )}
        </div>

        {(task.assigneeId || otherViewers.length > 0) && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            {task.assigneeId && (
              <Avatar user={{ id: task.assigneeId, name: task.assigneeId }} size="xs" />
            )}
            {otherViewers.length > 0 && (
              <div style={{ marginLeft: 'auto', display: 'flex' }}>
                {otherViewers.slice(0, 3).map((v) => (
                  <span key={v.socketId} style={{ marginLeft: -4 }}>
                    <Avatar
                      user={{ id: v.user.id, name: v.user.name, avatarUrl: v.user.avatarUrl }}
                      size="xs"
                      ring
                    />
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  )
}
