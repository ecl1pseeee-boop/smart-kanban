import { useEffect, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bell, Check, CheckCheck, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useNotificationsStore } from '@/stores/notificationsStore'
import type { Notification, NotificationType } from '@/lib/types'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'

const TYPE_EMOJI: Record<NotificationType, string> = {
  TASK_ASSIGNED: '👤',
  TASK_COMMENTED: '💬',
  TASK_DUE_SOON: '⏰',
  TASK_OVERDUE: '🚨',
  AUTOMATION_TRIGGERED: '⚙️',
  DAILY_SUMMARY: '📊',
  SYSTEM: '🔔',
}

const TYPE_DOT: Record<NotificationType, string> = {
  TASK_ASSIGNED: '#06b6d4',
  TASK_COMMENTED: '#8b5cf6',
  TASK_DUE_SOON: '#f97316',
  TASK_OVERDUE: '#ef4444',
  AUTOMATION_TRIGGERED: '#0ea5e9',
  DAILY_SUMMARY: '#10b981',
  SYSTEM: 'rgba(255,255,255,0.5)',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  return `${Math.floor(h / 24)} д назад`
}

const OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  zIndex: 30,
}

const DRAWER_STYLE: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: 400,
  maxWidth: '100vw',
  background: 'var(--bg-surface)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderLeft: '1px solid var(--border-subtle)',
  zIndex: 31,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '-24px 0 48px rgba(0,0,0,0.4)',
}

const HEADER_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '16px 18px',
  borderBottom: '1px solid var(--border-subtle)',
  background: 'rgba(13,14,17,0.6)',
}

const BADGE_STYLE: CSSProperties = {
  position: 'absolute',
  right: -2,
  top: -2,
  height: 16,
  minWidth: 16,
  borderRadius: '50%',
  background: 'linear-gradient(135deg, #ef4444, #f97316)',
  color: '#fff',
  fontSize: 10,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
  boxShadow: '0 0 0 2px var(--bg-base)',
}

export function NotificationsPanel() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const setUnread = useNotificationsStore((s) => s.setUnreadCount)
  const markReadLocal = useNotificationsStore((s) => s.markRead)
  const markAllReadLocal = useNotificationsStore((s) => s.markAllRead)
  const recent = useNotificationsStore((s) => s.recent)

  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const { data } = useQuery({
    queryKey: ['notifications', 'panel'],
    queryFn: () => api.listNotifications('all', undefined, 20),
    enabled: open,
    staleTime: 0,
  })

  useEffect(() => {
    if (data) setUnread(data.unreadCount)
  }, [data, setUnread])

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: (n) => {
      markReadLocal(n.id)
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAll = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      markAllReadLocal()
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const items: Notification[] = (() => {
    const seen = new Set<string>()
    const merged: Notification[] = []
    for (const n of [...recent, ...(data?.items ?? [])]) {
      if (seen.has(n.id)) continue
      seen.add(n.id)
      merged.push(n)
    }
    return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)
  })()

  const openTarget = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id)
    const p = n.payload as { boardId?: string; taskId?: string } | null
    if (p?.boardId) {
      navigate({ to: '/boards/$boardId', params: { boardId: p.boardId } })
      setOpen(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Уведомления"
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          padding: 8,
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          transition: 'background var(--transition-fast), color var(--transition-fast)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          e.currentTarget.style.color = 'var(--text-primary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--text-muted)'
        }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={BADGE_STYLE}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <>
          <div style={OVERLAY_STYLE} onClick={() => setOpen(false)} />
          <aside style={DRAWER_STYLE} className="pb-slide-in">
            <div style={HEADER_ROW}>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                Уведомления
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unreadCount === 0 || markAll.isPending}
                  onClick={() => markAll.mutate()}
                  title="Прочитать все"
                >
                  <CheckCheck size={14} />
                  прочитать все
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть"
                >
                  <X size={14} />
                </Button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {items.length === 0 ? (
                <EmptyState
                  icon={<Bell size={48} />}
                  title="Пока тишина"
                  description="Уведомления появятся здесь, как только что-то произойдёт"
                />
              ) : (
                <ul style={{ listStyle: 'none' }}>
                  {items.map((n) => (
                    <li
                      key={n.id}
                      onClick={() => openTarget(n)}
                      style={{
                        cursor: 'pointer',
                        padding: '14px 18px',
                        display: 'flex',
                        gap: 10,
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background var(--transition-fast)',
                        background: n.isRead ? 'transparent' : 'rgba(139,92,246,0.06)',
                        borderLeft: n.isRead
                          ? '2px solid transparent'
                          : '2px solid var(--accent-from)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = n.isRead
                          ? 'rgba(255,255,255,0.03)'
                          : 'rgba(139,92,246,0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = n.isRead
                          ? 'transparent'
                          : 'rgba(139,92,246,0.06)'
                      }}
                    >
                      <span
                        style={{
                          marginTop: 4,
                          width: 8,
                          height: 8,
                          flexShrink: 0,
                          borderRadius: '50%',
                          background: TYPE_DOT[n.type] ?? 'var(--accent-to)',
                        }}
                      />
                      <span
                        style={{ fontSize: 16, lineHeight: 1, marginTop: 2, flexShrink: 0 }}
                      >
                        {TYPE_EMOJI[n.type] ?? '🔔'}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <p
                            style={{
                              fontSize: 13,
                              color: 'var(--text-primary)',
                              fontWeight: n.isRead ? 400 : 600,
                            }}
                          >
                            {n.title}
                          </p>
                          {!n.isRead && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                markRead.mutate(n.id)
                              }}
                              title="Прочитано"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-subtle)',
                                cursor: 'pointer',
                                padding: 0,
                                display: 'inline-flex',
                              }}
                            >
                              <Check size={12} />
                            </button>
                          )}
                        </div>
                        <p
                          style={{
                            marginTop: 2,
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            whiteSpace: 'pre-line',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {n.body}
                        </p>
                        <p style={{ marginTop: 4, fontSize: 11, color: 'var(--text-subtle)' }}>
                          {timeAgo(n.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  )
}
