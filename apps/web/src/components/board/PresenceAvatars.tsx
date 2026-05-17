import type { CSSProperties } from 'react'
import { useBoardStore } from '@/stores/boardStore'
import { useAuthStore } from '@/stores/authStore'
import { Avatar } from '../ui/Avatar'

const LABEL_STYLE: CSSProperties = { fontSize: 12, color: 'var(--text-subtle)' }

const RING_STYLE: CSSProperties = {
  padding: 2,
  borderRadius: '50%',
  background: 'var(--gradient-accent)',
  display: 'inline-flex',
}

export function PresenceAvatars() {
  const onlineUsers = useBoardStore((s) => s.onlineUsers)
  const myId = useAuthStore((s) => s.user?.id)
  const entries = Object.values(onlineUsers).filter((u) => u.user.id !== myId)
  if (entries.length === 0) {
    return <span style={LABEL_STYLE}>Только вы на доске</span>
  }
  const seen = new Set<string>()
  const unique = entries.filter((e) => {
    if (seen.has(e.user.id)) return false
    seen.add(e.user.id)
    return true
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={LABEL_STYLE}>На доске</span>
      <div style={{ display: 'flex' }}>
        {unique.slice(0, 5).map((u, i) => (
          <span key={u.socketId} style={{ ...RING_STYLE, marginLeft: i === 0 ? 0 : -6 }}>
            <Avatar
              user={{ id: u.user.id, name: u.user.name, avatarUrl: u.user.avatarUrl }}
              size="xs"
            />
          </span>
        ))}
        {unique.length > 5 && (
          <span
            style={{
              ...RING_STYLE,
              marginLeft: -6,
              background: 'rgba(255,255,255,0.08)',
              padding: 4,
              minWidth: 28,
              height: 28,
              borderRadius: '50%',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
            }}
          >
            +{unique.length - 5}
          </span>
        )}
      </div>
    </div>
  )
}
