import { useState, type CSSProperties } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { LogOut, Search } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { disconnectSocket } from '@/lib/socket'
import { useGlobalSocket } from '@/hooks/useGlobalSocket'
import { useNotificationsStore } from '@/stores/notificationsStore'
import { Avatar } from './ui/Avatar'
import { Logo } from './ui/Logo'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { NotificationsPanel } from './notifications/NotificationsPanel'

const HEADER_STYLE: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 20,
  background: 'rgba(13, 14, 17, 0.8)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderBottom: '1px solid var(--border-subtle)',
}

const AVATAR_RING_STYLE: CSSProperties = {
  padding: 2,
  borderRadius: '50%',
  background: 'var(--gradient-accent)',
  display: 'inline-flex',
}

export function Header() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const onLogin = useRouterState({ select: (s) => s.location.pathname === '/login' })

  // Keeps the socket open + listens for notification:new. No-op when logged out.
  useGlobalSocket()

  const [query, setQuery] = useState('')

  const logout = async () => {
    if (refreshToken) await api.logout(refreshToken).catch(() => undefined)
    useAuthStore.getState().logout()
    useNotificationsStore.getState().reset()
    disconnectSocket()
    navigate({ to: '/login' })
  }

  if (onLogin) return null

  return (
    <header style={HEADER_STYLE}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '12px 24px',
          maxWidth: 1600,
          margin: '0 auto',
        }}
      >
        <Link to="/boards" style={{ textDecoration: 'none' }}>
          <Logo size="md" />
        </Link>

        {user && (
          <div style={{ flex: 1, maxWidth: 420, margin: '0 24px' }}>
            <Input
              placeholder="Поиск задач, досок…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              icon={<Search size={16} />}
            />
          </div>
        )}

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link to="/boards" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="sm">
                Доски
              </Button>
            </Link>
            <NotificationsPanel />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={AVATAR_RING_STYLE}>
                <Avatar user={user} size="sm" />
              </span>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{user.name}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} title="Выйти">
              <LogOut size={16} />
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
