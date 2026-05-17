import { createHash } from 'node:crypto'
import {
  BoardMemberRole,
  IncomingTaskStatus,
  Prisma,
  TaskPriority,
} from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../shared/logger.js'
import { ROLE_LEVEL, requireBoardRole } from '../../shared/access/board-access.js'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/app-error.js'
import { incomingTasksQueue } from '../../queue/registry.js'
import { createTask } from '../tasks/tasks.service.js'

/** Sources we accept verbatim. Anything else is rejected at validation time. */
const SOURCE_WHITELIST = new Set(['telegram', 'web-form', 'email', 'api', 'ai'])

/**
 * Dedup hash: title + source + hourly bucket. Two identical submissions
 * within the same hour collide; beyond that we let them through as fresh.
 */
export function computeDedupHash(input: {
  title: string
  source: string
  now?: number
}): string {
  const bucket = Math.floor((input.now ?? Date.now()) / 3_600_000)
  return createHash('sha256')
    .update(`${input.title}|${input.source}|${bucket}`)
    .digest('hex')
}

export interface SubmitInput {
  boardId: string
  title: string
  description?: string | undefined
  source: string
  metadata?: unknown
  userId: string
}

export interface SubmitResult {
  id: string
  status: IncomingTaskStatus
  taskId: string | null
}

export async function submit(input: SubmitInput): Promise<SubmitResult> {
  if (!SOURCE_WHITELIST.has(input.source)) {
    throw new ValidationError(
      { allowed: [...SOURCE_WHITELIST] },
      `Unknown source "${input.source}"`,
    )
  }

  // Authorize: the caller must be at least MEMBER of the target board.
  await requireBoardRole(input.userId, input.boardId, BoardMemberRole.MEMBER)

  const dedupHash = computeDedupHash({ title: input.title, source: input.source })

  // Dedup probe: if an active (non-terminal/non-duplicate) record exists, 409.
  const existing = await prisma.incomingTask.findUnique({ where: { dedupHash } })
  if (existing) {
    throw new ConflictError('Duplicate task submission for the current hour', {
      existingIncomingTaskId: existing.id,
      existingStatus: existing.status,
    })
  }

  const rawPayload = {
    boardId: input.boardId,
    title: input.title,
    description: input.description ?? null,
    source: input.source,
    metadata: input.metadata ?? null,
    submittedBy: input.userId,
  }

  const incoming = await prisma.incomingTask.create({
    data: {
      source: input.source,
      rawPayload: rawPayload as Prisma.InputJsonValue,
      status: IncomingTaskStatus.PENDING,
      dedupHash,
    },
  })

  await incomingTasksQueue.add(
    'enrich-and-create',
    { incomingTaskId: incoming.id },
    { jobId: incoming.id }, // idempotent: re-enqueueing the same incoming is a no-op
  )

  return { id: incoming.id, status: incoming.status, taskId: null }
}

// ── Admin operations ──────────────────────────────────────────────

export async function listIncoming(
  userId: string,
  params: { status?: IncomingTaskStatus; cursor?: string; limit: number },
) {
  await requireAdmin(userId)
  const take = params.limit
  const items = await prisma.incomingTask.findMany({
    where: { ...(params.status && { status: params.status }) },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(params.cursor && { cursor: { id: params.cursor }, skip: 1 }),
  })
  const hasMore = items.length > take
  const page = hasMore ? items.slice(0, take) : items
  const last = page[page.length - 1]
  return { items: page, nextCursor: hasMore && last ? last.id : null }
}

/**
 * Approves an incoming task: creates a real Task from its enrichedData
 * (or rawPayload if enrichment hasn't run) and marks the row DONE.
 */
export async function approveIncoming(adminId: string, incomingId: string) {
  await requireAdmin(adminId)
  const inc = await prisma.incomingTask.findUnique({ where: { id: incomingId } })
  if (!inc) throw new NotFoundError('IncomingTask')
  if (inc.status === IncomingTaskStatus.DONE) {
    throw new ConflictError('IncomingTask already processed')
  }

  const enriched = (inc.enrichedData ?? {}) as Record<string, unknown>
  const raw = (inc.rawPayload ?? {}) as Record<string, unknown>
  const boardId = String(raw.boardId ?? '')
  const title = String(enriched.title ?? raw.title ?? '')
  if (!boardId || !title) {
    throw new ValidationError(null, 'IncomingTask is missing boardId or title')
  }

  const submitterId = typeof raw.submittedBy === 'string' ? raw.submittedBy : adminId
  const task = await createTask(submitterId, boardId, {
    title,
    description: typeof enriched.description === 'string'
      ? enriched.description
      : typeof raw.description === 'string'
        ? raw.description
        : undefined,
    priority: parsePriority(enriched.priority) ?? TaskPriority.MEDIUM,
    tags: Array.isArray(enriched.tags)
      ? (enriched.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
  })

  await prisma.incomingTask.update({
    where: { id: incomingId },
    data: { status: IncomingTaskStatus.DONE, processedAt: new Date() },
  })
  logger.info({ incomingId, taskId: task.id }, 'incoming approved → task created')
  return { incoming: inc, task }
}

export async function rejectIncoming(adminId: string, incomingId: string, reason?: string) {
  await requireAdmin(adminId)
  const inc = await prisma.incomingTask.findUnique({ where: { id: incomingId } })
  if (!inc) throw new NotFoundError('IncomingTask')
  if (inc.status === IncomingTaskStatus.DONE) {
    throw new ConflictError('IncomingTask already completed — cannot reject')
  }
  return prisma.incomingTask.update({
    where: { id: incomingId },
    data: {
      status: IncomingTaskStatus.FAILED,
      error: reason ?? 'Rejected by admin',
      processedAt: new Date(),
    },
  })
}

async function requireAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  if (!user || user.role !== 'ADMIN') {
    throw new ForbiddenError('Admin role required')
  }
}

function parsePriority(v: unknown): TaskPriority | null {
  if (typeof v !== 'string') return null
  if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(v)) return v as TaskPriority
  return null
}
