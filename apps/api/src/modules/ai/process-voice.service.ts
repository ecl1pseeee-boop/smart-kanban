import { z } from 'zod'
import { BoardMemberRole, TaskPriority } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../shared/logger.js'
import { requireBoardRole } from '../../shared/access/board-access.js'
import { ValidationError } from '../../shared/errors/app-error.js'
import { chatJson } from './ai.client.js'
import { createTask } from '../tasks/tasks.service.js'

const tasksOut = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(3).max(200),
        description: z.string().max(2000).default(''),
        priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
        assignee_id: z.string().nullable().default(null),
      }),
    )
    .max(20),
})

export interface ProcessVoiceInput {
  userId: string
  boardId: string
  transcript: string
}

export interface ProcessVoiceResult {
  createdTasks: number
  transcript: string
  source: 'ai' | 'heuristic'
}

export async function processVoice(input: ProcessVoiceInput): Promise<ProcessVoiceResult> {
  await requireBoardRole(input.userId, input.boardId, BoardMemberRole.MEMBER)

  // ── A. Load board members so the LLM can resolve assignees ────────
  const memberships = await prisma.boardMember.findMany({
    where: { boardId: input.boardId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  const boardUsers = memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
  }))

  const transcript = input.transcript.trim()
  if (!transcript) {
    return { createdTasks: 0, transcript: '', source: 'heuristic' }
  }

  // ── B. Extract tasks via local LLM (structured JSON) ─────────────
  const extracted = await extractTasksFromText(transcript, boardUsers)
  const validUserIds = new Set(boardUsers.map((u) => u.id))

  // ── C. Persist tasks ──────────────────────────────────────────────
  let created = 0
  for (const t of extracted.tasks) {
    const assigneeId = resolveAssignee(t, boardUsers, validUserIds, transcript)
    try {
      await createTask(input.userId, input.boardId, {
        title: t.title.slice(0, 200),
        description: t.description || '',
        priority: t.priority as TaskPriority,
        ...(assigneeId !== undefined && { assigneeId }),
      })
      created += 1
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err, title: t.title },
        'process-voice: failed to create task, skipping',
      )
    }
  }

  return { createdTasks: created, transcript, source: extracted.source }
}

const norm = (s: string) => s.toLowerCase().replace(/[ёЁ]/g, 'е').trim()

/**
 * Maps the LLM's `assignee_id` field to a real user id.
 *
 * Tries in order:
 *   1. assignee_id is already a valid board user id → use it.
 *   2. Treat assignee_id as a name hint, substring-match against board users.
 *   3. Find the transcript clause closest to the task title (max word overlap),
 *      and look for a board user's first name inside that clause. This handles
 *      the case where the model returned null/garbage but the transcript
 *      clearly addressed someone.
 */
function resolveAssignee(
  t: { title: string; description: string; assignee_id: string | null },
  boardUsers: { id: string; name: string }[],
  validIds: Set<string>,
  transcript: string,
): string | undefined {
  if (t.assignee_id && validIds.has(t.assignee_id)) return t.assignee_id

  // (2) name hint
  const hint = norm(t.assignee_id ?? '')
  if (hint) {
    const matches = boardUsers.filter((u) => {
      const full = norm(u.name)
      const first = norm(u.name.split(/\s+/)[0] ?? '')
      return (
        full.includes(hint) || hint.includes(first) || first.includes(hint) || hint.includes(full)
      )
    })
    if (matches.length >= 1) return matches[0]!.id
  }

  // (3) per-task transcript clause match
  // Split on sentence boundaries only — keep "Дмитрий, починим…" together so
  // the addressee stays in the same clause as the action.
  const clauses = transcript
    .split(/[.!?\n]+/u)
    .map((c) => c.trim())
    .filter((c) => c.length >= 4)
  const titleTokens = tokenize(t.title)
  let bestClause = ''
  let bestScore = 0
  for (const c of clauses) {
    const ct = tokenize(c)
    const overlap = countOverlap(titleTokens, ct)
    if (overlap > bestScore) {
      bestScore = overlap
      bestClause = c
    }
  }
  if (bestScore >= 1) {
    const hay = norm(bestClause)
    const candidates = boardUsers.filter((u) => {
      const first = norm(u.name.split(/\s+/)[0] ?? '')
      return first.length >= 3 && hay.includes(first)
    })
    if (candidates.length === 1) return candidates[0]!.id
  }

  return undefined
}

function tokenize(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(/[^a-zа-я0-9]+/iu)
      .filter((w) => w.length >= 3),
  )
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const w of a) if (b.has(w)) n += 1
  return n
}

// ── LLM task extraction ───────────────────────────────────────────

interface ExtractedTask {
  title: string
  description: string
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  assignee_id: string | null
}

async function extractTasksFromText(
  meetingText: string,
  boardUsers: { id: string; name: string; email: string }[],
): Promise<{ tasks: ExtractedTask[]; source: 'ai' | 'heuristic' }> {
  const usersList = boardUsers
    .map((u) => `- id: "${u.id}", name: "${u.name}"`)
    .join('\n')

  const systemPrompt =
    'Ты — ИИ-проджект-менеджер PromptBoard. Перед тобой транскрипт созвона и список участников доски (id + имя).\n' +
    'Задача:\n' +
    '1. Вычлени конкретные поручения (фразы вроде "Коля, изучи LLM" — это задача).\n' +
    '2. Для каждой сделай title (≤100 симв.) и description.\n' +
    '3. assignee_id — ТОЧНО строка из колонки "id" таблицы ниже, чьё имя упомянуто в поручении. Если человека нет в списке — null. НЕ ВЫДУМЫВАЙ id.\n' +
    '4. priority: CRITICAL/HIGH/MEDIUM/LOW (MEDIUM по умолчанию).\n' +
    'Отвечай по-русски. Если конкретных задач нет — верни {"tasks": []}.\n' +
    'Верни СТРОГО JSON {"tasks": [{"title": ..., "description": ..., "priority": ..., "assignee_id": ...}]}. Без текста вне JSON.\n\n' +
    `Участники доски (используй ровно эти id):\n${usersList || '(пусто)'}`

  try {
    const raw = await chatJson({
      systemPrompt,
      userPrompt: `Текст созвона:\n\n${meetingText}`,
      maxTokens: 2048,
    })
    const parsed = tasksOut.safeParse(raw)
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'process-voice: bad JSON shape, fallback')
      return { tasks: heuristicExtract(meetingText), source: 'heuristic' }
    }
    return { tasks: parsed.data.tasks, source: 'ai' }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'process-voice: LLM call failed, fallback to heuristic',
    )
    return { tasks: heuristicExtract(meetingText), source: 'heuristic' }
  }
}

function heuristicExtract(text: string): ExtractedTask[] {
  const sentences = text
    .split(/[.!?\n]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 6 && s.length < 220)

  // JS `\b` is ASCII-only, so we don't use it — match imperative verb stems
  // anywhere in the sentence.
  const verbRe =
    /(сделай|сделат|нужно|надо|давайте|подготов|реализуй|реализова|изучи|изучит|напиши|написат|проверь|проверит|обнови|обновит|внедри|внедрит|почин|разбер|посмотри|посмотр|настрой|настроит)/iu

  return sentences
    .filter((s) => verbRe.test(s))
    .slice(0, 8)
    .map((s) => ({
      title: s.replace(/\s+/g, ' ').slice(0, 100),
      description: `Поручение из созвона: ${s}`,
      priority: 'MEDIUM' as const,
      assignee_id: null,
    }))
}

// ── Validation helper used by the route ───────────────────────────

export function assertTranscript(transcript: string): void {
  if (transcript.length < 3) {
    throw new ValidationError([
      { path: ['transcript'], message: 'transcript is too short or empty' },
    ])
  }
  if (transcript.length > 30_000) {
    throw new ValidationError([
      { path: ['transcript'], message: 'transcript exceeds 30k chars' },
    ])
  }
}
