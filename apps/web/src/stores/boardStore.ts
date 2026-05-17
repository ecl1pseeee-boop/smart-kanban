import { create } from 'zustand'
import type {
  BoardState,
  Column,
  PresenceUser,
  TaskCardData,
  UserMini,
} from '@/lib/types'

interface BoardStoreState {
  boardId: string | null
  board: BoardState['board'] | null
  columns: Column[]
  /** Flat task lookup by id. */
  tasks: Record<string, TaskCardData>
  /** Per-column ordered task ids. */
  tasksByColumn: Record<string, string[]>
  /** Presence keyed by socketId so multiple tabs from one user coexist. */
  onlineUsers: Record<string, PresenceUser>

  // Hydration
  hydrate: (state: BoardState) => void
  reset: () => void

  // Task sync (from socket events)
  applyTaskCreated: (task: TaskCardData) => void
  applyTaskUpdated: (taskId: string, changes: Partial<TaskCardData>) => void
  applyTaskMoved: (taskId: string, toColumnId: string, position: number) => void
  applyTaskDeleted: (taskId: string) => void
  applyTaskLocked: (taskId: string, lockedBy: UserMini) => void
  applyTaskUnlocked: (taskId: string) => void

  // Column sync
  applyColumnCreated: (column: Column) => void
  applyColumnUpdated: (columnId: string, changes: Partial<Column>) => void
  applyColumnDeleted: (columnId: string) => void

  // Optimistic local mutations
  optimisticMoveTask: (taskId: string, toColumnId: string, position: number) => void

  // Presence
  presenceState: (users: PresenceUser[]) => void
  presenceJoined: (u: PresenceUser) => void
  presenceLeft: (socketId: string) => void
  presenceViewing: (socketId: string, taskId: string | null) => void
}

function placeTaskAt(
  bucket: string[],
  taskId: string,
  position: number,
): string[] {
  const without = bucket.filter((id) => id !== taskId)
  const clamp = Math.max(0, Math.min(position, without.length))
  return [...without.slice(0, clamp), taskId, ...without.slice(clamp)]
}

export const useBoardStore = create<BoardStoreState>((set, get) => ({
  boardId: null,
  board: null,
  columns: [],
  tasks: {},
  tasksByColumn: {},
  onlineUsers: {},

  hydrate: (s) => {
    const tasks: Record<string, TaskCardData> = {}
    const tasksByColumn: Record<string, string[]> = {}
    for (const c of s.columns) tasksByColumn[c.id] = []
    // Stable order by position then createdAt for ties.
    const sorted = [...s.tasks].sort(
      (a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt),
    )
    for (const t of sorted) {
      tasks[t.id] = t
      ;(tasksByColumn[t.columnId] ??= []).push(t.id)
    }
    set({
      boardId: s.board.id,
      board: s.board,
      columns: [...s.columns].sort((a, b) => a.position - b.position),
      tasks,
      tasksByColumn,
    })
  },

  reset: () =>
    set({
      boardId: null,
      board: null,
      columns: [],
      tasks: {},
      tasksByColumn: {},
      onlineUsers: {},
    }),

  applyTaskCreated: (task) => {
    const st = get()
    if (st.tasks[task.id]) return // dedupe — e.g. our own create echo
    set({
      tasks: { ...st.tasks, [task.id]: task },
      tasksByColumn: {
        ...st.tasksByColumn,
        [task.columnId]: placeTaskAt(
          st.tasksByColumn[task.columnId] ?? [],
          task.id,
          task.position,
        ),
      },
    })
  },

  applyTaskUpdated: (taskId, changes) => {
    const st = get()
    const prev = st.tasks[taskId]
    if (!prev) return
    set({ tasks: { ...st.tasks, [taskId]: { ...prev, ...changes } } })
  },

  applyTaskMoved: (taskId, toColumnId, position) => {
    const st = get()
    const prev = st.tasks[taskId]
    if (!prev) return
    const fromColumnId = prev.columnId

    const byCol = { ...st.tasksByColumn }
    if (fromColumnId !== toColumnId) {
      byCol[fromColumnId] = (byCol[fromColumnId] ?? []).filter((id) => id !== taskId)
    }
    byCol[toColumnId] = placeTaskAt(byCol[toColumnId] ?? [], taskId, position)

    set({
      tasks: { ...st.tasks, [taskId]: { ...prev, columnId: toColumnId, position } },
      tasksByColumn: byCol,
    })
  },

  applyTaskDeleted: (taskId) => {
    const st = get()
    const prev = st.tasks[taskId]
    if (!prev) return
    const { [taskId]: _, ...rest } = st.tasks
    void _
    const byCol = { ...st.tasksByColumn }
    byCol[prev.columnId] = (byCol[prev.columnId] ?? []).filter((id) => id !== taskId)
    set({ tasks: rest, tasksByColumn: byCol })
  },

  applyTaskLocked: (taskId, locker) => {
    const st = get()
    const prev = st.tasks[taskId]
    if (!prev) return
    set({
      tasks: {
        ...st.tasks,
        [taskId]: { ...prev, lockedBy: locker.id, lockedAt: new Date().toISOString() },
      },
    })
  },

  applyTaskUnlocked: (taskId) => {
    const st = get()
    const prev = st.tasks[taskId]
    if (!prev) return
    set({
      tasks: { ...st.tasks, [taskId]: { ...prev, lockedBy: null, lockedAt: null } },
    })
  },

  applyColumnCreated: (column) => {
    const st = get()
    if (st.columns.some((c) => c.id === column.id)) return
    set({
      columns: [...st.columns, column].sort((a, b) => a.position - b.position),
      tasksByColumn: { ...st.tasksByColumn, [column.id]: [] },
    })
  },

  applyColumnUpdated: (columnId, changes) => {
    const st = get()
    set({
      columns: st.columns
        .map((c) => (c.id === columnId ? { ...c, ...changes } : c))
        .sort((a, b) => a.position - b.position),
    })
  },

  applyColumnDeleted: (columnId) => {
    const st = get()
    const { [columnId]: _, ...rest } = st.tasksByColumn
    void _
    set({
      columns: st.columns.filter((c) => c.id !== columnId),
      tasksByColumn: rest,
    })
  },

  optimisticMoveTask: (taskId, toColumnId, position) => {
    get().applyTaskMoved(taskId, toColumnId, position)
  },

  presenceState: (users) => {
    const next: Record<string, PresenceUser> = {}
    for (const u of users) next[u.socketId] = u
    set({ onlineUsers: next })
  },
  presenceJoined: (u) =>
    set((s) => ({ onlineUsers: { ...s.onlineUsers, [u.socketId]: u } })),
  presenceLeft: (socketId) =>
    set((s) => {
      const { [socketId]: _, ...rest } = s.onlineUsers
      void _
      return { onlineUsers: rest }
    }),
  presenceViewing: (socketId, taskId) =>
    set((s) => {
      const prev = s.onlineUsers[socketId]
      if (!prev) return s
      return {
        onlineUsers: {
          ...s.onlineUsers,
          [socketId]: { ...prev, viewingTaskId: taskId },
        },
      }
    }),
}))
