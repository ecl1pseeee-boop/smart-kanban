/* eslint-disable no-console */
import { io } from 'socket.io-client'

const API = 'http://localhost:3001'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function login(email) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Demo1234!' }),
  })
  if (!r.ok) throw new Error(`login failed ${r.status}`)
  return r.json()
}

async function http(method, path, token, body, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...extraHeaders }
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch {}
  return { status: r.status, json }
}

function connect(token, label) {
  const socket = io(`${API}/boards`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  })
  socket.on('connect', () => console.log(`[${label}] connected sid=${socket.id}`))
  socket.on('connect_error', (e) => console.error(`[${label}] connect_error: ${e.message}`))
  return socket
}

function waitEvent(socket, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs)
    socket.once(event, (payload) => { clearTimeout(t); resolve(payload) })
  })
}

const main = async () => {
  // Authenticate two users
  const admin = await login('admin@demo.com')
  const tanya = await login('tanya@demo.com')

  // Fetch demo board + columns
  const boards = await http('GET', '/api/boards', admin.accessToken)
  const boardId = boards.json[0].id
  const state = await http('GET', `/api/boards/${boardId}`, admin.accessToken)
  const todo = state.json.columns.find(c => c.name === 'To Do').id
  const review = state.json.columns.find(c => c.name === 'Review').id
  console.log(`board=${boardId} todo=${todo} review=${review}`)

  // Connect both users
  const a = connect(admin.accessToken, 'admin')
  const t = connect(tanya.accessToken, 'tanya')
  await Promise.all([
    new Promise(r => a.once('connect', r)),
    new Promise(r => t.once('connect', r)),
  ])

  // ── 1) board:join ─────────────────────────────────────────────────
  const adminJoined = await new Promise((res) => a.emit('board:join', { boardId }, res))
  console.log(`admin board:join ack=`, adminJoined)

  // Tanya joins after — admin should receive presence:joined
  const presenceJoined = waitEvent(a, 'presence:joined', 2000)
  const tanyaJoined = await new Promise((res) => t.emit('board:join', { boardId }, res))
  console.log(`tanya board:join ack=`, tanyaJoined)
  const pj = await presenceJoined
  console.log(`admin saw presence:joined → ${pj.name} sid=${pj.socketId.slice(0,8)}`)

  // ── 2) board:join for a board the user has no access to → ack ok:false ──
  const denied = await new Promise((res) => t.emit('board:join', { boardId: 'cnonexistent' }, res))
  console.log(`tanya join non-existent board → ack=`, denied)

  // ── 3) presence:viewing ───────────────────────────────────────────
  const viewing = waitEvent(a, 'presence:viewing', 2000)
  t.emit('presence:viewing', { boardId, taskId: 'task-mock-1' })
  const vw = await viewing
  console.log(`admin saw presence:viewing → user=${vw.userId.slice(0,8)} task=${vw.taskId}`)

  // ── 4) HTTP-triggered events broadcast ────────────────────────────

  // 4a. task:created — admin creates, tanya should see
  const taskCreated = waitEvent(t, 'task:created', 2000)
  const created = await http('POST', `/api/boards/${boardId}/tasks`, admin.accessToken,
    { title: 'socket-smoke task', columnId: todo },
    { 'x-socket-id': a.id })
  const tc = await taskCreated
  console.log(`tanya saw task:created → "${tc.task.title}" originSocketId=${tc.originSocketId === a.id ? 'matches admin' : tc.originSocketId}`)

  // 4b. task:moved — admin moves it, tanya should see
  const taskMoved = waitEvent(t, 'task:moved', 2000)
  await http('POST', `/api/tasks/${created.json.id}/move`, admin.accessToken,
    { columnId: review, position: 0 },
    { 'x-socket-id': a.id })
  const tm = await taskMoved
  console.log(`tanya saw task:moved → ${tm.fromColumnId.slice(0,8)} → ${tm.toColumnId.slice(0,8)} pos=${tm.position}`)

  // 4c. originSocketId opt-out: when admin (initiator) is the originSocketId,
  // a smart client would ignore the echo. Demonstrate that admin too receives
  // the event, but with originSocketId === admin.id.
  const adminEcho = waitEvent(a, 'task:locked', 2000)
  await http('POST', `/api/tasks/${created.json.id}/lock`, admin.accessToken, {}, { 'x-socket-id': a.id })
  const ae = await adminEcho
  console.log(`admin sees own task:locked echo → originSocketId === own? ${ae.originSocketId === a.id}`)

  // 4d. column:reordered — admin reorders, both see
  const reorderSeen = waitEvent(t, 'column:reordered', 2000)
  const cols = state.json.columns.map((c, i) => ({ id: c.id, position: i }))
  await http('POST', `/api/boards/${boardId}/columns/reorder`, admin.accessToken, { order: cols })
  const ro = await reorderSeen
  console.log(`tanya saw column:reordered → ${ro.columns.length} cols`)

  // 4e. comment:added
  const commentSeen = waitEvent(t, 'comment:added', 2000)
  await http('POST', `/api/tasks/${created.json.id}/comments`, admin.accessToken, { text: 'hi from admin' })
  const cm = await commentSeen
  console.log(`tanya saw comment:added → ${cm.comment.author.name}: "${cm.comment.text}"`)

  // ── 5) disconnect → presence:left ─────────────────────────────────
  const leftSeen = waitEvent(a, 'presence:left', 2000)
  t.disconnect()
  const lft = await leftSeen
  console.log(`admin saw presence:left → userId=${lft.userId.slice(0,8)}`)

  // ── cleanup ───────────────────────────────────────────────────────
  await http('DELETE', `/api/tasks/${created.json.id}`, admin.accessToken)
  a.disconnect()

  // give socket close time to flush
  await sleep(100)
  console.log('\n✓ all socket smoke tests passed')
}

main().catch((err) => {
  console.error('✗', err)
  process.exit(1)
})
