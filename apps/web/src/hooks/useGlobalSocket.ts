import { useEffect } from 'react'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationsStore } from '@/stores/notificationsStore'
import { api } from '@/lib/api'
import type { Notification } from '@/lib/types'

/**
 * Mounted once at the app shell (Header). Establishes the Socket.IO
 * connection (the same singleton used by useBoardSocket) and subscribes
 * to the user-room `notification:new` event so the bell badge updates
 * even outside of a board page.
 */
export function useGlobalSocket(): void {
  const token = useAuthStore((s) => s.accessToken)
  const setUnread = useNotificationsStore((s) => s.setUnreadCount)
  const onIncoming = useNotificationsStore((s) => s.onIncoming)

  useEffect(() => {
    if (!token) {
      disconnectSocket()
      return
    }
    const sock = connectSocket(token)

    const onNotif = (e: { notification: Notification }) => onIncoming(e.notification)
    sock.on('notification:new', onNotif)

    // Seed the badge from the API on first mount so a refresh shows the
    // correct count even before any new socket event lands.
    void api.unreadNotificationsCount().then((r) => setUnread(r.unreadCount)).catch(() => undefined)

    return () => {
      sock.off('notification:new', onNotif)
    }
  }, [token, onIncoming, setUnread])
}
