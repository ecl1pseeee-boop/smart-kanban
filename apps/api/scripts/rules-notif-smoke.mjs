/* eslint-disable no-console */
// E2E smoke for rules + notifications — drives every endpoint the SPA hits
// from the rules page + NotificationsPanel + global socket subscription.

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

async function http(method, path, opts = {}) {
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) }
  if (opts.token) headers.authorization = `Bearer ${opts.token}`
  const r = await fetch(`${API}${path}`, {
    method, headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const t = await r.text()
  let j = null; try { j = t ? JSON.parse(t) : null } catch {}
  return { status: r.status, json: j }
}

const log = (l, s, e = '') => console.log(`${l.padEnd(48)} → ${String(s).padStart(3)}  ${e}`)

const main = async () => {
  console.log('=== Rules + Notifications smoke ===')
  const admin = await login('admin@demo.com')
  const tanya = await login('tanya@demo.com')

  // Find a board where admin has access
  const boards = await http('GET', '/api/boards', { token: admin.accessToken })
  log('1) GET /api/boards (admin)', boards.status, `items=${boards.json?.length}`)
  const board = boards.json.find((b) => b.role === 'OWNER' || b.role === 'ADMIN')
  const boardId = board.id

  const state = await http('GET', `/api/boards/${boardId}`, { token: admin.accessToken })
  const targetCol = state.json.columns.find((c) => c.name === 'In Progress')

  // ── Rules CRUD ───────────────────────────────────────────────
  const create = await http('POST', `/api/boards/${boardId}/rules`, {
    token: admin.accessToken,
    body: {
      name: `Smoke: CRITICAL → In Progress (${Date.now()})`,
      trigger: 'TASK_CREATED',
      conditions: [{ field: 'priority', operator: 'equals', value: 'CRITICAL' }],
      actions: [{ type: 'move_to_column', params: { columnId: targetCol.id } }],
    },
  })
  log('2) POST /rules (create)', create.status,
    `id=${create.json?.id?.slice(0, 8)}…  isActive=${create.json?.isActive}`)
  const ruleId = create.json.id

  const list = await http('GET', `/api/boards/${boardId}/rules`, { token: admin.accessToken })
  log('3) GET /rules', list.status, `items=${list.json?.length}`)
  const mine = list.json.find((r) => r.id === ruleId)
  console.log(`     trigger=${mine?.trigger}  conds=${mine?.conditions?.length}  actions=${mine?.actions?.length}`)

  // Toggle off
  const off = await http('POST', `/api/boards/${boardId}/rules/${ruleId}/toggle`, { token: admin.accessToken })
  log('4) POST /rules/:id/toggle (off)', off.status, `isActive=${off.json?.isActive}`)
  // Toggle on
  const on = await http('POST', `/api/boards/${boardId}/rules/${ruleId}/toggle`, { token: admin.accessToken })
  log('5) POST /rules/:id/toggle (on)', on.status, `isActive=${on.json?.isActive}`)

  // Patch (rename)
  const patched = await http('PATCH', `/api/boards/${boardId}/rules/${ruleId}`, {
    token: admin.accessToken,
    body: { name: `${mine.name} (renamed)` },
  })
  log('6) PATCH /rules/:id', patched.status, `name="${patched.json?.name?.slice(0, 40)}…"`)

  // Test against an existing task
  const taskCandidate = state.json.tasks.find((t) => t.priority === 'CRITICAL') ?? state.json.tasks[0]
  const test = await http('POST', `/api/boards/${boardId}/rules/${ruleId}/test`, {
    token: admin.accessToken,
    body: { taskId: taskCandidate.id },
  })
  log('7) POST /rules/:id/test', test.status,
    `matches=${test.json?.matches}  evalConds=${test.json?.evaluatedConditions?.length}  wouldExec=${test.json?.wouldExecute?.length}`)

  // ── Notifications ─────────────────────────────────────────────
  const unread0 = await http('GET', '/api/notifications/unread-count', { token: tanya.accessToken })
  log('8) GET /notifications/unread-count (tanya)', unread0.status,
    `unread=${unread0.json?.unreadCount}`)

  // Open a global socket for tanya — verifies the notification:new push path.
  const sock = io(`${API}/boards`, {
    auth: { token: tanya.accessToken },
    transports: ['websocket'],
  })
  await new Promise((r) => sock.once('connect', r))
  log('9) socket connected (tanya)', 'OK', `sid=${sock.id}`)

  // Listen first, then trigger. We use a fresh notify_user rule rather than
  // the daily-deduped cron so the smoke is repeatable.
  const tanyaId = (await http('GET', '/api/auth/me', { token: tanya.accessToken })).json.id

  const notifyRule = await http('POST', `/api/boards/${boardId}/rules`, {
    token: admin.accessToken,
    body: {
      name: `Smoke notify (${Date.now()})`,
      trigger: 'TASK_CREATED',
      conditions: [],
      actions: [{ type: 'notify_user', params: { target: tanyaId, message: 'smoke ping' } }],
    },
  })

  const pushPromise = new Promise((res) => {
    sock.once('notification:new', res)
    setTimeout(() => res(null), 4000)
  })
  await http('POST', `/api/boards/${boardId}/tasks`, {
    token: admin.accessToken,
    body: { title: `Smoke trigger ${Date.now()}`, priority: 'MEDIUM' },
  })

  const pushed = await pushPromise
  // Clean up the notify rule regardless of outcome.
  await http('DELETE', `/api/boards/${boardId}/rules/${notifyRule.json.id}`, { token: admin.accessToken })
  log('10) notification:new pushed', pushed ? 'OK' : 'TIMEOUT',
    pushed ? `type=${pushed.notification?.type} title="${pushed.notification?.title}"` : '')

  // List notifications via the panel's endpoint
  const listN = await http('GET', '/api/notifications?filter=all&limit=10', { token: tanya.accessToken })
  log('11) GET /notifications', listN.status,
    `items=${listN.json?.items?.length}  unread=${listN.json?.unreadCount}`)

  // Mark first unread read
  const firstUnread = listN.json.items.find((n) => !n.isRead)
  if (firstUnread) {
    const markOne = await http('PATCH', `/api/notifications/${firstUnread.id}/read`, { token: tanya.accessToken })
    log('12) PATCH /notifications/:id/read', markOne.status, `isRead=${markOne.json?.isRead}`)
  } else {
    log('12) PATCH /notifications/:id/read', '— ', '(нет непрочитанных)')
  }

  // Read all
  const readAll = await http('POST', '/api/notifications/read-all', { token: tanya.accessToken })
  log('13) POST /notifications/read-all', readAll.status, `markedRead=${readAll.json?.markedRead}`)

  // Confirm zero
  const final = await http('GET', '/api/notifications/unread-count', { token: tanya.accessToken })
  log('14) GET /notifications/unread-count (final)', final.status,
    `unread=${final.json?.unreadCount}`)

  sock.disconnect()

  // ── Cleanup the test rule ────────────────────────────────────
  const del = await http('DELETE', `/api/boards/${boardId}/rules/${ruleId}`, { token: admin.accessToken })
  log('15) DELETE /rules/:id', del.status)

  console.log('\n✓ rules + notifications smoke complete')
}

main().catch((e) => { console.error('✗', e); process.exit(1) })
