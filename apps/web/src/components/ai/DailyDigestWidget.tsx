import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { request, ApiError } from '@/lib/api'
import { GlassCard } from '@/components/ui/GlassCard'
import type { BoardListItem } from '@/lib/types'

interface Props {
  boards: BoardListItem[]
}

interface DailySummaryResponse {
  summary: string
  source: 'ai' | 'heuristic'
}

/**
 * Clickable "✨ ИИ-выжимка дня" widget on the boards-list page.
 * Picks the first available board (or asks if there are several) and fetches
 * /api/ai/daily-summary, then shows the result in a glass modal.
 */
export function DailyDigestWidget({ boards }: Props) {
  const [open, setOpen] = useState(false)
  const [boardId, setBoardId] = useState<string>(boards[0]?.id ?? '')

  const mutation = useMutation({
    mutationFn: (id: string) =>
      request<DailySummaryResponse>('/api/ai/daily-summary', {
        method: 'POST',
        body: { boardId: id },
      }),
  })

  const run = (id: string) => {
    setBoardId(id)
    mutation.mutate(id)
    setOpen(true)
  }

  const close = () => {
    setOpen(false)
    mutation.reset()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (boards.length === 0) return
          if (boards.length === 1) return run(boards[0]!.id)
          setOpen(true)
        }}
        disabled={boards.length === 0}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 'var(--radius-lg)',
          padding: '18px 20px',
          color: 'inherit',
          cursor: boards.length === 0 ? 'not-allowed' : 'pointer',
          opacity: boards.length === 0 ? 0.5 : 1,
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          transition: 'background var(--transition-normal), border-color var(--transition-normal), box-shadow var(--transition-normal)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(139, 92, 246, 0.07)'
          e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.30)'
          e.currentTarget.style.boxShadow = '0 6px 24px rgba(139, 92, 246, 0.18)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'var(--gradient-accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 6px 22px rgba(139, 92, 246, 0.4)',
          }}
        >
          <Sparkles size={20} color="#fff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
            ✨ ИИ-выжимка дня
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Что произошло за сутки, кто и где застрял, ближайшие дедлайны
          </div>
        </div>
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: 24,
            animation: 'pb-fade-in 0.25s ease both',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <GlassCard glow style={{ width: '100%', maxWidth: 540, padding: '28px 30px' }}>
            <button
              onClick={close}
              aria-label="Закрыть"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                width: 32,
                height: 32,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>

            <div
              className="pb-font-display"
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#fff',
                marginBottom: 16,
                letterSpacing: '-0.01em',
              }}
            >
              ✨ ИИ-выжимка дня
            </div>

            {boards.length > 1 && (
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    fontSize: 12,
                    color: 'var(--text-label)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Доска
                </label>
                <select
                  className="pb-input"
                  value={boardId}
                  onChange={(e) => {
                    setBoardId(e.target.value)
                    mutation.mutate(e.target.value)
                  }}
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {mutation.isPending && (
              <div style={{ padding: '20px 0' }}>
                <div className="pb-neon-bar" />
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                  }}
                >
                  ИИ собирает данные за последние 24 часа…
                </div>
              </div>
            )}

            {mutation.isError && (
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
                {mutation.error instanceof ApiError
                  ? mutation.error.message
                  : 'Не удалось получить выжимку'}
              </div>
            )}

            {mutation.isSuccess && (
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: 'var(--text-primary)',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 'var(--radius-md)',
                  padding: 16,
                  maxHeight: '50vh',
                  overflowY: 'auto',
                }}
              >
                {mutation.data.summary}
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 11,
                    color: 'var(--text-subtle)',
                  }}
                >
                  Источник: {mutation.data.source === 'ai' ? 'Claude' : 'эвристика'}
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      )}
    </>
  )
}
