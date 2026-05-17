import { API_URL } from './env'
import { useAuthStore } from '@/stores/authStore'
import type {
  AuthResponse,
  Board,
  BoardListItem,
  BoardMember,
  BoardState,
  Column,
  Comment,
  ChecklistItem,
  Notification,
  NotificationsPage,
  Priority,
  Rule,
  TaskCardData,
  TaskDetail,
  TestRuleResult,
} from './types'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Body = unknown
interface ReqOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: Body
  /**
   * Suppress the X-Socket-Id header even when a socket id is registered.
   * Used for requests where echo-suppression doesn't apply (e.g. login).
   */
  noSocket?: boolean
}

let socketId: string | null = null
export function setApiSocketId(id: string | null): void {
  socketId = id
}

async function rawRequest<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const token = useAuthStore.getState().accessToken
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (token) headers.authorization = `Bearer ${token}`
  if (socketId && !opts.noSocket) headers['x-socket-id'] = socketId

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  if (res.status === 204) return undefined as T
  const text = await res.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    /* leave as null */
  }

  if (res.ok) return payload as T

  const errEnvelope = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error
  throw new ApiError(
    res.status,
    errEnvelope?.code ?? 'HTTP_ERROR',
    errEnvelope?.message ?? `${opts.method ?? 'GET'} ${path} → ${res.status}`,
    errEnvelope?.details,
  )
}

/**
 * Wraps rawRequest with a single-shot refresh-on-401 retry. If the access
 * token expired we silently refresh and replay the request once.
 */
export async function request<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, opts)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && useAuthStore.getState().refreshToken) {
      const refreshed = await tryRefresh()
      if (refreshed) return rawRequest<T>(path, opts)
      // Refresh failed → drop session and bubble up.
      useAuthStore.getState().logout()
    }
    throw err
  }
}

let refreshPromise: Promise<boolean> | null = null
async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const refreshToken = useAuthStore.getState().refreshToken
      if (!refreshToken) return false
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) return false
      const json = (await res.json()) as { accessToken: string; refreshToken: string }
      useAuthStore.getState().setTokens(json.accessToken, json.refreshToken)
      return true
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

// ── Endpoints ─────────────────────────────────────────────────────

export const api = {
  // Auth
  login: (email: string, password: string) =>
    rawRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      noSocket: true,
    }),
  register: (email: string, name: string, password: string) =>
    rawRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: { email, name, password },
      noSocket: true,
    }),
  me: () => request<import('./types').UserPublic>('/api/auth/me'),
  logout: (refreshToken?: string) =>
    request<void>('/api/auth/logout', {
      method: 'POST',
      ...(refreshToken !== undefined && { body: { refreshToken } }),
    }),

  // Boards
  listBoards: () => request<BoardListItem[]>('/api/boards'),
  createBoard: (input: { name: string; description?: string; slug?: string }) =>
    request<Board>('/api/boards', { method: 'POST', body: input }),
  getBoardState: (boardId: string) =>
    request<BoardState>(`/api/boards/${boardId}`),
  listMembers: (boardId: string) =>
    request<BoardMember[]>(`/api/boards/${boardId}/members`),

  // Tasks
  createTask: (
    boardId: string,
    input: { title: string; columnId?: string; priority?: Priority; description?: string },
  ) =>
    request<TaskCardData>(`/api/boards/${boardId}/tasks`, { method: 'POST', body: input }),
  getTask: (taskId: string) => request<TaskDetail>(`/api/tasks/${taskId}`),
  patchTask: (taskId: string, body: Partial<{
    title: string
    description: string | null
    priority: Priority
    status: import('./types').Status
    tags: string[]
    dueDate: string | null
    assigneeId: string | null
  }>) => request<TaskCardData>(`/api/tasks/${taskId}`, { method: 'PATCH', body }),
  deleteTask: (taskId: string) =>
    request<void>(`/api/tasks/${taskId}`, { method: 'DELETE' }),
  moveTask: (taskId: string, columnId: string, position: number) =>
    request<TaskCardData>(`/api/tasks/${taskId}/move`, {
      method: 'POST',
      body: { columnId, position },
    }),
  lockTask: (taskId: string) =>
    request<TaskCardData>(`/api/tasks/${taskId}/lock`, { method: 'POST' }),
  unlockTask: (taskId: string) =>
    request<TaskCardData>(`/api/tasks/${taskId}/unlock`, { method: 'POST' }),

  // Comments + checklist
  listComments: (taskId: string) =>
    request<Comment[]>(`/api/tasks/${taskId}/comments`),
  addComment: (taskId: string, text: string) =>
    request<Comment>(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      body: { text },
    }),
  deleteComment: (taskId: string, commentId: string) =>
    request<void>(`/api/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),
  patchChecklist: (
    taskId: string,
    items: { id?: string; text: string; done: boolean }[],
  ) =>
    request<ChecklistItem[]>(`/api/tasks/${taskId}/checklist`, {
      method: 'PATCH',
      body: { items },
    }),

  // Columns
  createColumn: (boardId: string, input: { name: string; color?: string; wipLimit?: number }) =>
    request<Column>(`/api/boards/${boardId}/columns`, { method: 'POST', body: input }),
  patchColumn: (
    boardId: string,
    columnId: string,
    body: { name?: string; color?: string | null; wipLimit?: number | null; isDefault?: boolean },
  ) =>
    request<Column>(`/api/boards/${boardId}/columns/${columnId}`, {
      method: 'PATCH',
      body,
    }),
  deleteColumn: (boardId: string, columnId: string) =>
    request<void>(`/api/boards/${boardId}/columns/${columnId}`, { method: 'DELETE' }),

  // ── Automation rules ──────────────────────────────────────────
  listRules: (boardId: string) =>
    request<Rule[]>(`/api/boards/${boardId}/rules`),
  createRule: (
    boardId: string,
    body: Pick<Rule, 'name' | 'trigger' | 'conditions' | 'actions'> & { isActive?: boolean },
  ) => request<Rule>(`/api/boards/${boardId}/rules`, { method: 'POST', body }),
  patchRule: (
    boardId: string,
    ruleId: string,
    body: Partial<Pick<Rule, 'name' | 'trigger' | 'conditions' | 'actions' | 'isActive'>>,
  ) => request<Rule>(`/api/boards/${boardId}/rules/${ruleId}`, { method: 'PATCH', body }),
  toggleRule: (boardId: string, ruleId: string) =>
    request<Rule>(`/api/boards/${boardId}/rules/${ruleId}/toggle`, { method: 'POST' }),
  testRule: (boardId: string, ruleId: string, taskId: string) =>
    request<TestRuleResult>(`/api/boards/${boardId}/rules/${ruleId}/test`, {
      method: 'POST',
      body: { taskId },
    }),
  deleteRule: (boardId: string, ruleId: string) =>
    request<void>(`/api/boards/${boardId}/rules/${ruleId}`, { method: 'DELETE' }),

  // ── Notifications ─────────────────────────────────────────────
  listNotifications: (filter: 'all' | 'unread' = 'all', cursor?: string, limit = 20) => {
    const q = new URLSearchParams({ filter, limit: String(limit) })
    if (cursor) q.set('cursor', cursor)
    return request<NotificationsPage>(`/api/notifications?${q.toString()}`)
  },
  unreadNotificationsCount: () =>
    request<{ unreadCount: number }>('/api/notifications/unread-count'),
  markNotificationRead: (id: string) =>
    request<Notification>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    request<{ markedRead: number }>('/api/notifications/read-all', { method: 'POST' }),
}
