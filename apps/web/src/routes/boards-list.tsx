import { useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, LayoutGrid } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

const ERROR_STYLE: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)',
  color: '#fca5a5',
  fontSize: 13,
}

export function BoardsListPage() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['boards'],
    queryFn: () => api.listBoards(),
  })

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => api.createBoard({ name, description: description || undefined }),
    onSuccess: () => {
      setShowCreate(false)
      setName('')
      setDescription('')
      setErr(null)
      qc.invalidateQueries({ queryKey: ['boards'] })
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Не удалось создать'),
  })

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
      <div
        style={{
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h1
          style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}
          className="gradient-text"
        >
          Мои доски
        </h1>
        <Button variant="primary" onClick={() => setShowCreate((v) => !v)}>
          <Plus size={14} />
          Новая доска
        </Button>
      </div>

      {showCreate && (
        <GlassCard style={{ padding: 20, marginBottom: 24 }} className="pb-fade-in">
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--text-muted)' }}>
            Создать доску
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Input
              autoFocus
              placeholder="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Описание (опционально)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {err && <div style={ERROR_STYLE}>{err}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="primary"
                disabled={!name.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                Создать
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreate(false)
                  setErr(null)
                }}
              >
                Отмена
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {isLoading && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Загрузка…</p>
      )}
      {error && (
        <p style={{ fontSize: 13, color: '#fca5a5' }}>
          {error instanceof ApiError ? error.message : 'Ошибка загрузки'}
        </p>
      )}

      {data && data.length === 0 && (
        <GlassCard>
          <EmptyState
            icon={<LayoutGrid size={48} />}
            title="Пока нет ни одной доски"
            description="Создайте первую, чтобы начать работать с задачами"
            action={{ label: 'Новая доска', onClick: () => setShowCreate(true) }}
          />
        </GlassCard>
      )}

      {data && data.length > 0 && (
        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          }}
        >
          {data.map((b) => (
            <Link
              key={b.id}
              to="/boards/$boardId"
              params={{ boardId: b.id }}
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <GlassCard
                style={{ padding: 20, transition: 'transform var(--transition-fast)' }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {b.name}
                  </h3>
                  <Badge dot={false}>{b.role}</Badge>
                </div>
                {b.description && (
                  <p
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      color: 'var(--text-muted)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {b.description}
                  </p>
                )}
                <div
                  style={{
                    marginTop: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: 'var(--text-subtle)',
                  }}
                >
                  <span>{b.taskCount} задач</span>
                  <span>{b.memberCount} участников</span>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
