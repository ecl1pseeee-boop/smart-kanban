/* eslint-disable no-console */
import { io } from 'socket.io-client'

const API = 'http://localhost:3001'

async function login(email) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Demo1234!' }),
  })
  return r.json()
}

async function http(method, path, token, body) {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  const r = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch {}
  return { status: r.status, json }
}

const main = async () => {
  const tanya = await login('tanya@demo.com')

  // Subscribe to socket so we can confirm real-time push works
  const socket = io(`${API}/boards`, { auth: { token: tanya.accessToken }, transports: ['websocket'] })
  await new Promise((r) => socket.once('connect', r))
  const pushed = []
  socket.on('notification:new', (p) => pushed.push(p))

  // 1) Trigger overdue/morning/evening to generate notifications for tanya
  //    (admin login required for /admin/cron)
  const admin = await login('admin@demo.com')

  // Clear cron Redis dedupe to allow re-runs
  // (skipping — fresh seed gives clean slate)

  // Create an overdue task assigned to tanya
  const boards = await http('GET', '/api/boards', admin.accessToken)
  const boardId = boards.json[0].id
  const state = await http('GET', `/api/boards/${boardId}`, admin.accessToken)
  const todoCol = state.json.columns.find((c) => c.name === 'To Do').id
  const tanyaId = (await http('GET', '/api/auth/me', tanya.accessToken)).json.id
  await http('POST', `/api/boards/${boardId}/tasks`, admin.accessToken, {
    title: 'просроченная задача от smoke13',
    columnId: todoCol,
    dueDate: new Date(Date.now() - 86400000).toISOString(),
    assigneeId: tanyaId,
  })

  // Trigger cron manually
  await http('POST', '/api/admin/cron/check-deadlines', admin.accessToken)
  await http('POST', '/api/admin/cron/evening-summary', admin.accessToken)

  // Wait a moment for socket events to arrive
  await new Promise((r) => setTimeout(r, 400))

  console.log(`--- 1) socket received ${pushed.length} notification:new events`)
  for (const ev of pushed.slice(0, 5)) {
    console.log(`     ${ev.notification.type} :: ${ev.notification.title}`)
  }

  // 2) GET /api/notifications
  console.log('--- 2) GET /api/notifications ---')
  const list = await http('GET', '/api/notifications?limit=5', tanya.accessToken)
  console.log(`     status=${list.status}  items=${list.json.items.length}  unread=${list.json.unreadCount}  nextCursor=${list.json.nextCursor?.slice(0, 10) ?? null}`)
  for (const n of list.json.items) {
    console.log(`     [${n.isRead ? 'X' : ' '}] ${n.type}: ${n.title}`)
  }

  // 3) GET /api/notifications?filter=unread
  console.log('--- 3) filter=unread ---')
  const unread = await http('GET', '/api/notifications?filter=unread', tanya.accessToken)
  console.log(`     items=${unread.json.items.length}  unreadCount=${unread.json.unreadCount}`)

  // 4) GET /api/notifications/unread-count
  console.log('--- 4) GET /unread-count ---')
  const count = await http('GET', '/api/notifications/unread-count', tanya.accessToken)
  console.log(`     ${count.json.unreadCount}`)

  // 5) PATCH /api/notifications/:id/read
  console.log('--- 5) PATCH :id/read (first unread) ---')
  const firstUnread = list.json.items.find((n) => !n.isRead)
  const marked = await http('PATCH', `/api/notifications/${firstUnread.id}/read`, tanya.accessToken)
  console.log(`     status=${marked.status}  isRead=${marked.json.isRead}`)

  // 5b) idempotent
  const again = await http('PATCH', `/api/notifications/${firstUnread.id}/read`, tanya.accessToken)
  console.log(`     idempotent: status=${again.status}  isRead=${again.json.isRead}`)

  // 6) someone else's notification → 404
  console.log("--- 6) PATCH :id/read for admin's notification → 404 ---")
  const adminNotifs = await http('GET', '/api/notifications?limit=1', admin.accessToken)
  if (adminNotifs.json.items.length > 0) {
    const otherId = adminNotifs.json.items[0].id
    const denied = await http('PATCH', `/api/notifications/${otherId}/read`, tanya.accessToken)
    console.log(`     status=${denied.status}  code=${denied.json.error?.code}`)
  } else {
    console.log('     (admin has no notifications yet — skip)')
  }

  // 7) POST /read-all
  console.log('--- 7) POST /read-all ---')
  const readAll = await http('POST', '/api/notifications/read-all', tanya.accessToken)
  console.log(`     status=${readAll.status}  markedRead=${readAll.json.markedRead}`)

  // 8) verify unread is now 0
  console.log('--- 8) confirm unread=0 after read-all ---')
  const after = await http('GET', '/api/notifications/unread-count', tanya.accessToken)
  console.log(`     unreadCount=${after.json.unreadCount}`)

  socket.disconnect()
  await new Promise((r) => setTimeout(r, 100))
  console.log('\n✓ notifications smoke complete')
}

main().catch((err) => {
  console.error('✗', err)
  process.exit(1)
})
