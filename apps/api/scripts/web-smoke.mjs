// Minimal headless smoke: log in, hit /api/auth/me with the cookie-less token, GET a board, then exercise socket join.
import { io } from 'socket.io-client'

const API = 'http://localhost:3001'

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

const log = (l, s, e='') => console.log(`${l.padEnd(40)} → ${String(s).padStart(3)}  ${e}`)

const main = async () => {
  console.log('=== Web E2E (cli-driven) ===')

  // 1) Login via the API the SPA hits
  const login = await http('POST', '/api/auth/login', { body: { email: 'admin@demo.com', password: 'Demo1234!' } })
  log('1) POST /api/auth/login', login.status, `name=${login.json?.user?.name}`)
  const token = login.json.accessToken

  // 2) /me round-trip (the SPA uses this on app load)
  const me = await http('GET', '/api/auth/me', { token })
  log('2) GET /api/auth/me', me.status, me.json?.email)

  // 3) List boards (BoardsListPage)
  const boards = await http('GET', '/api/boards', { token })
  log('3) GET /api/boards', boards.status, `items=${boards.json?.length}`)
  const boardId = boards.json[0].id

  // 4) Full board state (BoardPage on mount)
  const state = await http('GET', `/api/boards/${boardId}`, { token })
  log('4) GET /api/boards/:id', state.status,
    `cols=${state.json?.columns?.length} tasks=${state.json?.tasks?.length}`)

  // 5) Open a task (TaskModal lock → fetch → unlock)
  const t0 = state.json.tasks[0]
  const lock = await http('POST', `/api/tasks/${t0.id}/lock`, { token })
  log('5) POST /tasks/:id/lock', lock.status, `lockedBy=${lock.json?.lockedBy?.slice(0,8)}`)

  const detail = await http('GET', `/api/tasks/${t0.id}`, { token })
  log('6) GET /tasks/:id (detail)', detail.status,
    `assignee=${detail.json?.assignee?.name ?? 'none'}  cl=${detail.json?.checklistItems?.length}`)

  const unlock = await http('POST', `/api/tasks/${t0.id}/unlock`, { token })
  log('7) POST /tasks/:id/unlock', unlock.status)

  // 6) Move task (KanbanBoard onDragEnd)
  // Find another column to move to
  const otherCol = state.json.columns.find((c) => c.id !== t0.columnId)
  if (otherCol) {
    const moved = await http('POST', `/api/tasks/${t0.id}/move`, {
      token,
      body: { columnId: otherCol.id, position: 0 },
    })
    log('8) POST /tasks/:id/move', moved.status,
      `newCol=${moved.json?.columnId === otherCol.id ? '✓' : '✗'}  pos=${moved.json?.position}`)

    // Move back so smoke is idempotent
    await http('POST', `/api/tasks/${t0.id}/move`, {
      token,
      body: { columnId: t0.columnId, position: t0.position },
    })
  }

  // 7) Socket round-trip — confirm the SPA can receive task:moved
  const sock = io(`${API}/boards`, { auth: { token }, transports: ['websocket'] })
  await new Promise((r) => sock.once('connect', r))
  log('9) socket connected', 'OK', `sid=${sock.id}`)

  // The SPA registers listeners BEFORE emitting board:join. Mirror that here.
  const presPromise = new Promise((res) => {
    sock.once('presence:state', res)
    setTimeout(() => res(null), 2000)
  })
  await new Promise((res) => {
    sock.emit('board:join', { boardId }, (ack) => {
      log('10) socket board:join', ack?.ok ? 'OK' : 'FAIL')
      res()
    })
  })
  const pres = await presPromise
  log('11) presence:state received', pres ? 'OK' : 'TIMEOUT',
    pres ? `boardId=${pres.boardId} users=${pres.users?.length}` : '')

  sock.disconnect()
  console.log('\n✓ web e2e smoke complete')
}

main().catch((e) => { console.error('✗', e); process.exit(1) })
