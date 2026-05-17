import { Queue, type DefaultJobOptions } from 'bullmq'
import { QUEUES } from '@smart-kanban/shared'
import { createRedisConnection } from '../config/redis.js'
import { logger } from '../shared/logger.js'

// BullMQ requires a dedicated Redis connection per Queue/Worker — it issues
// blocking commands that can't share with the rest of the app.
const queueConnection = createRedisConnection()

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
}

/** Strongly-typed Queue factory. Connection and defaults are shared. */
function makeQueue<T = unknown>(name: string): Queue<T> {
  return new Queue<T>(name, {
    connection: queueConnection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  })
}

// ── Job payload types ──────────────────────────────────────────────

export interface IncomingTaskJob {
  incomingTaskId: string
}

export interface NotificationJob {
  userId: string
  channel: 'in_app' | 'telegram'
  payload: unknown
}

export interface AiJob {
  kind: 'decompose' | 'daily_summary' | 'analyze_bug'
  payload: unknown
}

export interface DeadlineCheckJob {
  // No payload — the worker scans the DB on each tick
  scheduledAt: string
}

// ── Queue instances ────────────────────────────────────────────────

export const incomingTasksQueue = makeQueue<IncomingTaskJob>(QUEUES.INCOMING_TASKS)
export const notificationsQueue = makeQueue<NotificationJob>(QUEUES.NOTIFICATIONS)
export const aiJobsQueue = makeQueue<AiJob>(QUEUES.AI_JOBS)
export const deadlineCheckerQueue = makeQueue<DeadlineCheckJob>(QUEUES.DEADLINE_CHECKER)
export const taskEventsQueue = makeQueue<unknown>(QUEUES.TASK_EVENTS)

const allQueues: Queue[] = [
  incomingTasksQueue,
  notificationsQueue,
  aiJobsQueue,
  deadlineCheckerQueue,
  taskEventsQueue,
]

export async function closeAllQueues(): Promise<void> {
  await Promise.allSettled(allQueues.map((q) => q.close()))
  await queueConnection.quit().catch(() => undefined)
  logger.info('all BullMQ queues closed')
}
