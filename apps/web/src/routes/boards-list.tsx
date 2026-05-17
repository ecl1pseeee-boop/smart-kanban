import { useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, LayoutGrid, ArrowRight, Users, ListChecks } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { VoiceCallPanel } from '@/components/ai/VoiceCallPanel'
import { DailyDigestWidget } from '@/components/ai/DailyDigestWidget'

const ERROR_STYLE: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)',
  color: '#fca5a5',
  fontSize: 13,
}

const SECTION_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.45)',
  marginBottom: 10,
}

export function BoardsListPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const firstName = (user?.name ?? '').split(' ')[0] || user?.name || 'друг'

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
    <div
      style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px 80px' }}
      className="pb-voice-dim-host"
    >
      {/* Приветствие */}
      <div
        className="pb-font-display pb-fade-in"
        style={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: '#fff',
          marginBottom: 32,
        }}
      >
        Добро пожаловать,{' '}
        <span className="gradient-text" style={{ fontWeight: 800 }}>
          {firstName}
        </span>
        !
      </div>

      {/* ИИ-Пульт: две glassmorphism-колонки */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 48,
        }}
      >
        <GlassCard
          data-voice-host="1"
          style={{
            padding: '24px 24px 22px',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div style={SECTION_LABEL}>Запись и генерация</div>
          <div
            style={{
              fontSize: 15,
              color: 'var(--text-primary)',
              marginBottom: 18,
              lineHeight: 1.5,
            }}
          >
            Запиши созвон, и ИИ сам напишет задачи, распределит их по исполнителям
            и закинет в нужную доску.
          </div>
          <VoiceCallPanel boards={data ?? []} />
        </GlassCard>

        <GlassCard
          style={{
            padding: '24px 24px 22px',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div style={SECTION_LABEL}>Прогресс и аналитика</div>
          <div
            style={{
              fontSize: 15,
              color: 'var(--text-primary)',
              marginBottom: 18,
              lineHeight: 1.5,
            }}
          >
            Посмотри прогресс команды за сегодня: что закрыли, где застряли,
            какие дедлайны на подходе.
          </div>
          <DailyDigestWidget boards={data ?? []} />
        </GlassCard>
      </div>

      {/* МОИ ДОСКИ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
        }}
      >
        <h2
          className="pb-font-display"
          style={{
            fontSize: 'clamp(28px, 3vw, 38px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            color: '#fff',
          }}
        >
          Мои доски
        </h2>
        {!showCreate && (
          <Button variant="ghost" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            Новая доска
          </Button>
        )}
      </div>

      {showCreate && (
        <GlassCard style={{ padding: 22, marginBottom: 18 }} className="pb-fade-in">
          <h3
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 14,
              color: 'var(--text-muted)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Создать доску
          </h3>
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

      {isLoading && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Загрузка…</p>}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.map((b, i) => (
            <Link
              key={b.id}
              to="/boards/$boardId"
              params={{ boardId: b.id }}
              className="pb-monolith pb-slide-up"
              style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
            >
              {/* Название + описание */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="pb-font-display"
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#fff',
                    letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {b.name}
                </div>
                {b.description && (
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text-muted)',
                      marginTop: 4,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {b.description}
                  </div>
                )}
              </div>

              {/* Счётчики */}
              <Counter icon={<ListChecks size={14} />} value={b.taskCount} label="задач" />
              <Counter icon={<Users size={14} />} value={b.memberCount} label="участников" />

              {/* Роль + стрелка */}
              <Badge dot={false}>{b.role}</Badge>
              <ArrowRight
                size={18}
                style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}
              />
            </Link>
          ))}

          {/* "+ Новая доска" в конце списка */}
          {!showCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="pb-slide-up"
              style={{
                marginTop: 6,
                padding: '18px 24px',
                background: 'transparent',
                border: '1px dashed rgba(255,255,255,0.12)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontFamily: 'inherit',
                transition: 'all var(--transition-normal)',
                animationDelay: `${Math.min(data.length, 6) * 60}ms`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)'
                e.currentTarget.style.color = '#fff'
                e.currentTarget.style.background = 'rgba(139,92,246,0.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <Plus size={15} />
              [ + Новая доска ]
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Counter({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: number
  label: string
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        color: 'var(--text-muted)',
        flexShrink: 0,
      }}
    >
      <span style={{ display: 'inline-flex', color: 'rgba(255,255,255,0.4)' }}>{icon}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
      <span style={{ color: 'var(--text-subtle)' }}>{label}</span>
    </div>
  )
}
