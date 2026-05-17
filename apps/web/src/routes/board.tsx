import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useBoardStore } from '@/stores/boardStore'
import { useBoardSocket } from '@/hooks/useBoardSocket'
import { KanbanBoard } from '@/components/board/KanbanBoard'
import { PresenceAvatars } from '@/components/board/PresenceAvatars'
import { TaskModal } from '@/components/task/TaskModal'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'

const TOOLBAR_STYLE: CSSProperties = {
  padding: '14px 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  borderBottom: '1px solid var(--border-subtle)',
  background: 'rgba(13, 14, 17, 0.6)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
}

export function BoardPage() {
  const { boardId } = useParams({ from: '/boards/$boardId' })
  const board = useBoardStore((s) => s.board)
  const hydrate = useBoardStore((s) => s.hydrate)
  const reset = useBoardStore((s) => s.reset)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.getBoardState(boardId),
  })

  useEffect(() => {
    if (data) hydrate(data)
  }, [data, hydrate])
  useEffect(() => () => reset(), [reset, boardId])

  useBoardSocket(data ? boardId : null)

  if (isLoading || !board) {
    return (
      <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
        <div
          style={{
            height: 32,
            width: 240,
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)',
          }}
        />
        <div style={{ marginTop: 24, display: 'flex', gap: 16, overflowX: 'auto' }}>
          {[1, 2, 3].map((i) => (
            <GlassCard
              key={i}
              radius="var(--radius-xl)"
              style={{ height: 320, width: 300, flexShrink: 0 }}
            >
              <span />
            </GlassCard>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: '#fca5a5', fontSize: 14 }}>
        {error instanceof ApiError ? error.message : 'Не удалось загрузить доску'}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <div style={TOOLBAR_STYLE}>
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.3px',
            }}
            className="gradient-text"
          >
            {board.name}
          </h1>
          {board.description && (
            <p style={{ marginTop: 2, fontSize: 13, color: 'var(--text-muted)' }}>
              {board.description}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/boards/$boardId/rules" params={{ boardId }} style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="sm" title="Правила автоматизации">
              <Sparkles size={14} />
              Правила
            </Button>
          </Link>
          <PresenceAvatars />
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <KanbanBoard onTaskOpen={(id) => setActiveTaskId(id)} />
      </div>
      {activeTaskId && (
        <TaskModal
          taskId={activeTaskId}
          onClose={() => setActiveTaskId(null)}
          boardId={boardId}
        />
      )}
    </div>
  )
}
