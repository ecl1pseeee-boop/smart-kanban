import { request } from 'undici'
import { env } from './config.js'
import { logger } from './logger.js'

// ── Types mirroring the API contracts (see apps/api/src/modules/telegram).
// Kept hand-written rather than imported so the bot can be built / deployed
// without depending on the API's source tree.

export interface LinkedUser {
  id: string
  email: string
  name: string
  telegramId: string | null
}

export interface TodayTask {
  id: string
  title: string
  boardId: string
  boardName: string
  columnName: string
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'ARCHIVED'
  dueDate: string | null
  isOverdue: boolean
}

export interface MyBoard {
  id: string
  name: string
  slug: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
  taskCount: number
}

export interface BugDraft {
  title: string
  description: string
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  tags: string[]
  source: 'ai' | 'heuristic'
}

export interface DailySummary {
  summary: string
  source: 'ai' | 'heuristic'
}

export interface SubmitResult {
  id: string
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'DUPLICATE'
  taskId: string | null
}

// ── Transport ─────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  if (!env.BOT_SECRET) {
    throw new ApiError(500, 'CONFIG', 'BOT_SECRET is not configured')
  }
  const url = `${env.API_URL}${path}`
  const res = await request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-bot-secret': env.BOT_SECRET,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.body.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    /* leave as null */
  }

  if (res.statusCode >= 400) {
    const errEnvelope = (payload as { error?: { code?: string; message?: string } } | null)?.error
    const code = errEnvelope?.code ?? 'HTTP_ERROR'
    const msg = errEnvelope?.message ?? `${method} ${path} → ${res.statusCode}`
    logger.warn({ method, path, status: res.statusCode, code, msg }, 'api error')
    throw new ApiError(res.statusCode, code, msg)
  }
  return payload as T
}

// ── Endpoints ─────────────────────────────────────────────────────

export const api = {
  confirmLink: (input: {
    code: string
    telegramId: string
    telegramChatId?: string
    telegramName?: string
  }) => call<{ user: LinkedUser }>('POST', '/api/telegram/link/confirm', input),

  me: (telegramId: string) =>
    call<LinkedUser>('GET', `/api/telegram/me/${encodeURIComponent(telegramId)}`),

  myTasks: (telegramId: string) =>
    call<{ items: TodayTask[] }>(
      'GET',
      `/api/telegram/me/${encodeURIComponent(telegramId)}/tasks`,
    ),

  myBoards: (telegramId: string) =>
    call<{ items: MyBoard[] }>(
      'GET',
      `/api/telegram/me/${encodeURIComponent(telegramId)}/boards`,
    ),

  dailySummary: (telegramId: string, boardId: string) =>
    call<DailySummary>(
      'POST',
      `/api/telegram/me/${encodeURIComponent(telegramId)}/boards/${encodeURIComponent(boardId)}/summary`,
    ),

  analyzeBug: (
    telegramId: string,
    input: { description?: string; imageBase64?: string },
  ) =>
    call<BugDraft>(
      'POST',
      `/api/telegram/me/${encodeURIComponent(telegramId)}/analyze-bug`,
      input,
    ),

  submitTask: (
    telegramId: string,
    input: { boardId: string; title: string; description?: string; metadata?: unknown },
  ) =>
    call<SubmitResult>(
      'POST',
      `/api/telegram/me/${encodeURIComponent(telegramId)}/queue/tasks`,
      input,
    ),
}
