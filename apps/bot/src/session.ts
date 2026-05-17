import type { BugDraft, MyBoard } from './api-client.js'

/**
 * Per-chat in-memory state. The only multi-step flows in v1 are:
 *  • a pending bug draft awaiting board-selection + confirmation
 *  • a pending /summary awaiting board-selection (when the user has >1 board)
 *
 * Stored in process memory because we run a single bot instance. If we ever
 * scale to multiple bot replicas this should move to Redis with a TTL.
 */

export interface PendingBug {
  draft: BugDraft
  boards: MyBoard[]
  /** Initial Telegram message id holding the preview — we edit it on confirm. */
  previewMessageId?: number
}

export interface PendingSummary {
  boards: MyBoard[]
}

interface ChatState {
  pendingBug?: PendingBug
  pendingSummary?: PendingSummary
}

const store = new Map<number, ChatState>()

export function getState(chatId: number): ChatState {
  let s = store.get(chatId)
  if (!s) {
    s = {}
    store.set(chatId, s)
  }
  return s
}

export function clearBug(chatId: number) {
  const s = store.get(chatId)
  if (s) delete s.pendingBug
}

export function clearSummary(chatId: number) {
  const s = store.get(chatId)
  if (s) delete s.pendingSummary
}
