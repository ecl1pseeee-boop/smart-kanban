import { create } from 'zustand'
import type { Notification } from '@/lib/types'

/**
 * Lightweight client-side notification cache.
 *
 * The full paginated list lives in TanStack Query (NotificationsPanel uses
 * `useQuery({queryKey:['notifications']})`). This store only holds the
 * unread badge count and a small ring of "fresh" items so the header bell
 * can flash without a network round-trip when a `notification:new` event
 * arrives over the socket.
 */
interface NotificationsState {
  unreadCount: number
  /** Newest first; capped to RECENT_LIMIT. */
  recent: Notification[]

  setUnreadCount: (n: number) => void
  onIncoming: (n: Notification) => void
  markRead: (id: string) => void
  markAllRead: () => void
  reset: () => void
}

const RECENT_LIMIT = 20

export const useNotificationsStore = create<NotificationsState>((set) => ({
  unreadCount: 0,
  recent: [],

  setUnreadCount: (n) => set({ unreadCount: Math.max(0, n) }),

  onIncoming: (n) =>
    set((s) => {
      if (s.recent.some((r) => r.id === n.id)) return s
      const recent = [n, ...s.recent].slice(0, RECENT_LIMIT)
      return {
        recent,
        unreadCount: n.isRead ? s.unreadCount : s.unreadCount + 1,
      }
    }),

  markRead: (id) =>
    set((s) => {
      const recent = s.recent.map((r) => (r.id === id ? { ...r, isRead: true } : r))
      const wasUnread = s.recent.find((r) => r.id === id && !r.isRead)
      return {
        recent,
        unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      }
    }),

  markAllRead: () =>
    set((s) => ({
      recent: s.recent.map((r) => ({ ...r, isRead: true })),
      unreadCount: 0,
    })),

  reset: () => set({ unreadCount: 0, recent: [] }),
}))
