import { io, type Socket } from 'socket.io-client'
import { WS_URL } from './env'
import { setApiSocketId } from './api'

let socket: Socket | null = null

export function connectSocket(accessToken: string): Socket {
  if (socket?.connected) return socket
  socket?.disconnect()
  socket = io(`${WS_URL}/boards`, {
    auth: { token: accessToken },
    // Allow polling fallback in addition to WebSocket — keeps the socket
    // alive even when the dev proxy (or a corporate proxy) doesn't pass
    // the WS upgrade headers cleanly. socket.io auto-upgrades to WS once
    // the initial polling handshake succeeds.
    transports: ['polling', 'websocket'],
    autoConnect: true,
  })
  socket.on('connect', () => {
    setApiSocketId(socket?.id ?? null)
  })
  socket.on('disconnect', () => {
    setApiSocketId(null)
  })
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
  setApiSocketId(null)
}

export function getSocket(): Socket | null {
  return socket
}
