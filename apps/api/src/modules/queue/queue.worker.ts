import { Worker, type Job } from 'bullmq'
import {
  IncomingTaskStatus,
  Prisma,
  TaskPriority,
  type IncomingTask,
} from '@prisma/client'
import { QUEUES } from '@smart-kanban/shared'
import { prisma } from '../../config/prisma.js'
import { createRedisConnection } from '../../config/redis.js'
import { logger } from '../../shared/logger.js'
import { createTask } from '../tasks/tasks.service.js'
import type { IncomingTaskJob } from '../../queue/registry.js'

/**
 * Heuristic enrichment used until Step 12 wires the real Anthropic API.
 * Looks at the title + description and guesses priority + tags.
 */
export function heuristicEnrich(raw: { title: string; description?: string | null }): {
  priority: TaskPriority
  tags: string[]
} {
  // JS regex `\b` is ASCII-only, so it never triggers on Cyrillic. We use
  // `\p{L}`-aware boundaries instead, or just `contains` (case-insensitive)
  // since these are short lexical cues, not exact-word matches.
  const text = `${raw.title} ${raw.description ?? ''}`.toLowerCase()
  const has = (re: RegExp) => re.test(text)

  let priority: TaskPriority = TaskPriority.MEDIUM
  if (has(/(критич|срочн|пожар|выпал|упал|падает|прод|prod)/u)) {
    priority = TaskPriority.CRITICAL
  } else if (has(/(важн|asap|приоритет)/u)) {
    priority = TaskPriority.HIGH
  } else if (has(/(потом|когда-нибудь|неважн|low)/u)) {
    priority = TaskPriority.LOW
  }

  const tags: string[] = []
  if (has(/(баг|bug|ошибк|падает|не работает|сломал)/u)) tags.push('баг')
  if (has(/(дизайн|ui|ux)/u)) tags.push('design')
  if (has(/(api|бэкенд|backend|сервер)/u)) tags.push('backend')
  if (has(/(фронт|frontend|react)/u)) tags.push('frontend')
  return { priority, tags }
}

interface EnrichedData {
  title: string
  description: string | null
  priority: TaskPriority
  tags: string[]
}

async function processIncomingTask(job: Job<IncomingTaskJob>): Promise<void> {
  const { incomingTaskId } = job.data
  logger.info({ incomingTaskId, attempt: job.attemptsMade + 1 }, 'processing incoming task')

  const inc = await prisma.incomingTask.findUnique({ where: { id: incomingTaskId } })
  if (!inc) {
    logger.warn({ incomingTaskId }, 'incoming task vanished — skipping')
    return
  }
  if (inc.status === IncomingTaskStatus.DONE) {
    logger.debug({ incomingTaskId }, 'already done, skipping')
    return
  }

  await prisma.incomingTask.update({
    where: { id: incomingTaskId },
    data: {
      status: IncomingTaskStatus.PROCESSING,
      attempts: { increment: 1 },
    },
  })

  try {
    const enriched = await enrichAndValidate(inc)

    // Decide: auto-create or wait for admin approval.
    const raw = inc.rawPayload as Record<string, unknown>
    const boardId = String(raw.boardId ?? '')
    const submitterId = typeof raw.submittedBy === 'string' ? raw.submittedBy : null

    if (!boardId || !submitterId) {
      // Cannot auto-create — leave for admin review.
      await prisma.incomingTask.update({
        where: { id: incomingTaskId },
        data: {
          enrichedData: enriched as unknown as Prisma.InputJsonValue,
          error: 'Missing boardId or submitter — awaiting approval',
        },
      })
      logger.info({ incomingTaskId }, 'enriched, awaiting admin approval')
      return
    }

    const task = await createTask(submitterId, boardId, {
      title: enriched.title,
      description: enriched.description ?? undefined,
      priority: enriched.priority,
      tags: enriched.tags,
    })

    await prisma.incomingTask.update({
      where: { id: incomingTaskId },
      data: {
        enrichedData: { ...enriched, createdTaskId: task.id } as unknown as Prisma.InputJsonValue,
        status: IncomingTaskStatus.DONE,
        processedAt: new Date(),
        error: null,
      },
    })
    logger.info({ incomingTaskId, taskId: task.id }, 'incoming task → real Task created')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ err: msg, incomingTaskId }, 'incoming task processing failed')
    // Throw so BullMQ retries (up to defaultJobOptions.attempts). Final
    // failure is marked in the `failed` listener below.
    throw err
  }
}

async function enrichAndValidate(inc: IncomingTask): Promise<EnrichedData> {
  const raw = inc.rawPayload as Record<string, unknown>
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) throw new Error('title is empty')

  const description = typeof raw.description === 'string' ? raw.description : null
  const enriched = heuristicEnrich({ title, description })
  return { title, description, priority: enriched.priority, tags: enriched.tags }
}

// ── Worker bootstrap ───────────────────────────────────────────────

export function startIncomingTasksWorker(): Worker<IncomingTaskJob> {
  const connection = createRedisConnection()
  const worker = new Worker<IncomingTaskJob>(QUEUES.INCOMING_TASKS, processIncomingTask, {
    connection,
    concurrency: 5,
  })

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'incoming-tasks job completed')
  })
  worker.on('failed', async (job, err) => {
    if (!job) return
    const attemptsUsed = job.attemptsMade
    const attemptsTotal = job.opts.attempts ?? 3
    logger.warn(
      { jobId: job.id, attemptsUsed, attemptsTotal, err: err.message },
      'incoming-tasks job failed',
    )
    if (attemptsUsed >= attemptsTotal) {
      // Final failure: mark row FAILED so admin can investigate (DLQ).
      const incomingTaskId = job.data?.incomingTaskId
      if (incomingTaskId) {
        await prisma.incomingTask
          .update({
            where: { id: incomingTaskId },
            data: {
              status: IncomingTaskStatus.FAILED,
              error: err.message.slice(0, 500),
              processedAt: new Date(),
            },
          })
          .catch(() => undefined)
      }
    }
  })

  logger.info('incoming-tasks worker started')
  return worker
}
