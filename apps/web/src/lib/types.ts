// Hand-written mirrors of the API contracts. We intentionally don't import
// from @smart-kanban/api so the SPA builds without the server source tree.

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type Status = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'ARCHIVED'
export type BoardRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'

export interface UserPublic {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'MEMBER'
  avatarUrl: string | null
  telegramId: string | null
  createdAt: string
}

export interface UserMini {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export interface Board {
  id: string
  name: string
  description: string | null
  slug: string
  isPublic: boolean
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface BoardListItem extends Board {
  role: BoardRole
  memberCount: number
  taskCount: number
}

export interface Column {
  id: string
  boardId: string
  name: string
  color: string | null
  position: number
  wipLimit: number | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface TaskCardData {
  id: string
  boardId: string
  columnId: string
  title: string
  description: string | null
  priority: Priority
  status: Status
  position: number
  tags: string[]
  dueDate: string | null
  assigneeId: string | null
  creatorId: string
  lockedBy: string | null
  lockedAt: string | null
  createdAt: string
  updatedAt: string
  checklistTotal: number
  checklistDone: number
  commentCount: number
}

export interface BoardState {
  board: Board & { role: BoardRole }
  columns: Column[]
  tasks: TaskCardData[]
}

export interface BoardMember {
  id: string
  userId: string
  boardId: string
  role: BoardRole
  joinedAt: string
  user: UserMini
}

export interface ChecklistItem {
  id: string
  taskId: string
  text: string
  done: boolean
  position: number
  createdAt: string
}

export interface Comment {
  id: string
  taskId: string
  authorId: string
  text: string
  createdAt: string
  updatedAt: string
  author: UserMini
}

export interface TaskDetail extends TaskCardData {
  assignee: UserMini | null
  creator: UserMini
  locker: UserMini | null
  checklistItems: ChecklistItem[]
}

export interface AuthResponse {
  user: UserPublic
  accessToken: string
  refreshToken: string
}

export interface PresenceUser {
  socketId: string
  user: { id: string; name: string; avatarUrl: string | null }
  viewingTaskId?: string | null
}

// ── Automation rules ─────────────────────────────────────────────

export type Trigger =
  | 'TASK_CREATED'
  | 'TASK_MOVED'
  | 'TASK_UPDATED'
  | 'TASK_ASSIGNED'
  | 'DUE_DATE_APPROACHING'
  | 'TAG_ADDED'

export type ConditionField = 'tag' | 'priority' | 'columnId' | 'assigneeId' | 'dueDate'
export type ConditionOp =
  | 'equals'
  | 'contains'
  | 'not_equals'
  | 'is_empty'
  | 'before'
  | 'after'

export interface Condition {
  field: ConditionField
  operator: ConditionOp
  value: string | string[] | boolean | null
}

export type ActionParams =
  | { type: 'move_to_column'; params: { columnId: string; position?: number } }
  | { type: 'move_to_top'; params: Record<string, never> }
  | { type: 'set_priority'; params: { priority: Priority } }
  | { type: 'add_tag'; params: { tag: string } }
  | {
      type: 'assign_to'
      params: { target?: 'creator' | 'specific'; userId?: string }
    }
  | {
      type: 'notify_user'
      params: { target: 'creator' | 'assignee' | string; message?: string }
    }
  | {
      type: 'send_telegram'
      params: { target: 'creator' | 'assignee' | string; message?: string }
    }

export type Action = ActionParams

export interface Rule {
  id: string
  boardId: string
  name: string
  isActive: boolean
  trigger: Trigger
  conditions: Condition[]
  actions: Action[]
  createdAt: string
  updatedAt: string
}

export interface TestRuleResult {
  matches: boolean
  evaluatedConditions: { condition: Condition; result: boolean }[]
  wouldExecute: Action[]
}

// ── Notifications ────────────────────────────────────────────────

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_COMMENTED'
  | 'TASK_DUE_SOON'
  | 'TASK_OVERDUE'
  | 'AUTOMATION_TRIGGERED'
  | 'DAILY_SUMMARY'
  | 'SYSTEM'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  payload: unknown
  isRead: boolean
  createdAt: string
}

export interface NotificationsPage {
  items: Notification[]
  nextCursor: string | null
  unreadCount: number
}
