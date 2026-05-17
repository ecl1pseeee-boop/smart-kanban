/* eslint-disable no-console */
// E2E smoke for the Telegram-facing API surface. Drives the same endpoints
// the bot calls: link-code → confirm → me/tasks/boards/summary/analyze-bug/queue.

import { readFile } from 'node:fs/promises'

const API = 'http://localhost:3001'
const BOT_SECRET = process.env.BOT_SECRET ?? 'internal_secret_for_bot_to_api_calls'

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
  if (opts.botSecret) headers['x-bot-secret'] = opts.botSecret
  const r = await fetch(`${API}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const text = await r.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch {}
  return { status: r.status, json }
}

const log = (label, status, extra = '') =>
  console.log(`${label.padEnd(46)} → ${String(status).padStart(3)}  ${extra}`)

const main = async () => {
  console.log('=== Telegram API smoke ===')
  console.log('BOT_SECRET source:', process.env.BOT_SECRET ? 'env' : '(default placeholder)')

  // ── 1) User logs in via web, generates a link code ──────────────
  const tanya = await login('tanya@demo.com')
  const fakeTelegramId = `tg_${Math.random().toString(36).slice(2, 8)}`

  const gen = await http('POST', '/api/telegram/link/generate', { token: tanya.accessToken })
  log('1) POST /link/generate', gen.status,
    `code=${gen.json?.code}  expiresAt=${gen.json?.expiresAt?.slice(0, 19) ?? ''}`)

  // ── 2) Bot confirms the link with the wrong secret → 401 ──────────
  const denied = await http('POST', '/api/telegram/link/confirm', {
    botSecret: 'wrong-secret',
    body: { code: gen.json.code, telegramId: fakeTelegramId },
  })
  log('2) confirm with wrong secret', denied.status, `code=${denied.json?.error?.code}`)

  // ── 3) Bot confirms with the right secret ─────────────────────────
  const confirmed = await http('POST', '/api/telegram/link/confirm', {
    botSecret: BOT_SECRET,
    body: {
      code: gen.json.code,
      telegramId: fakeTelegramId,
      telegramChatId: '777',
      telegramName: 'tanya_dev',
    },
  })
  log('3) confirm with right secret', confirmed.status,
    `linked=${confirmed.json?.user?.email}  tgId=${confirmed.json?.user?.telegramId}`)

  // ── 4) Replay protection: same code should now 404 ────────────────
  const replay = await http('POST', '/api/telegram/link/confirm', {
    botSecret: BOT_SECRET,
    body: { code: gen.json.code, telegramId: 'tg_other' },
  })
  log('4) replay same code', replay.status, `code=${replay.json?.error?.code}`)

  // ── 5) GET /me/:telegramId ────────────────────────────────────────
  const me = await http('GET', `/api/telegram/me/${fakeTelegramId}`, { botSecret: BOT_SECRET })
  log('5) GET /me/:telegramId', me.status, `name=${me.json?.name}`)

  // ── 6) Unknown telegramId → 404 ───────────────────────────────────
  const unknown = await http('GET', '/api/telegram/me/unknown-tg', { botSecret: BOT_SECRET })
  log('6) GET /me/unknown', unknown.status, `code=${unknown.json?.error?.code}`)

  // ── 7) Today tasks ────────────────────────────────────────────────
  const tasks = await http('GET', `/api/telegram/me/${fakeTelegramId}/tasks`, { botSecret: BOT_SECRET })
  log('7) GET /me/:tg/tasks', tasks.status, `items=${tasks.json?.items?.length}`)
  for (const t of (tasks.json?.items ?? []).slice(0, 3)) {
    const overdue = t.isOverdue ? ' [OVERDUE]' : ''
    console.log(`     ${t.priority}  ${t.title}  (${t.boardName} · ${t.columnName})${overdue}`)
  }

  // ── 8) My boards ──────────────────────────────────────────────────
  const boards = await http('GET', `/api/telegram/me/${fakeTelegramId}/boards`, { botSecret: BOT_SECRET })
  log('8) GET /me/:tg/boards', boards.status, `items=${boards.json?.items?.length}`)
  for (const b of (boards.json?.items ?? []).slice(0, 3)) {
    console.log(`     ${b.role.padEnd(7)} ${b.name}  (${b.taskCount} tasks)`)
  }

  // ── 9) Daily summary (first board) ────────────────────────────────
  if ((boards.json?.items ?? []).length > 0) {
    const bid = boards.json.items[0].id
    const sum = await http('POST', `/api/telegram/me/${fakeTelegramId}/boards/${bid}/summary`,
      { botSecret: BOT_SECRET })
    log('9) POST /summary', sum.status, `source=${sum.json?.source}  len=${sum.json?.summary?.length}`)
    console.log('     preview:', (sum.json?.summary ?? '').slice(0, 80).replace(/\n/g, ' ⏎ '))
  }

  // ── 10) Analyze bug from a tiny PNG (text only here, image optional) ─
  const bug = await http('POST', `/api/telegram/me/${fakeTelegramId}/analyze-bug`, {
    botSecret: BOT_SECRET,
    body: { description: 'Кнопка "Сохранить" падает с 500 при двойном клике, продакшен' },
  })
  log('10) POST /analyze-bug', bug.status,
    `priority=${bug.json?.priority}  source=${bug.json?.source}  tags=${(bug.json?.tags ?? []).join(',')}`)
  console.log('     title:', bug.json?.title)

  // ── 11) Submit task on behalf of the user ─────────────────────────
  if ((boards.json?.items ?? []).length > 0) {
    const bid = boards.json.items[0].id
    const submit = await http('POST', `/api/telegram/me/${fakeTelegramId}/queue/tasks`, {
      botSecret: BOT_SECRET,
      body: {
        boardId: bid,
        title: `Smoke bug ${Date.now()}`,
        description: bug.json?.description ?? 'Сгенерировано smoke-тестом',
        metadata: { source: 'telegram-photo', priority: bug.json?.priority, tags: bug.json?.tags },
      },
    })
    log('11) POST /queue/tasks', submit.status, `incoming=${submit.json?.id}  status=${submit.json?.status}`)
  }

  // ── 12) Duplicate link code → 404 (already consumed) ─────────────
  // Generate fresh code → confirm with already-linked telegramId of OTHER user → 409
  const admin = await login('admin@demo.com')
  const gen2 = await http('POST', '/api/telegram/link/generate', { token: admin.accessToken })
  const collide = await http('POST', '/api/telegram/link/confirm', {
    botSecret: BOT_SECRET,
    body: { code: gen2.json.code, telegramId: fakeTelegramId },
  })
  log('12) confirm tgId already on other user', collide.status, `code=${collide.json?.error?.code}`)

  console.log('\n✓ telegram smoke complete')
}

main().catch((err) => {
  console.error('✗', err)
  process.exit(1)
})
