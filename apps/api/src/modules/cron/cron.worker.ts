import { Worker, type Job } from 'bullmq'
import { QUEUES } from '@smart-kanban/shared'
import { createRedisConnection } from '../../config/redis.js'
import { logger } from '../../shared/logger.js'
import { deadlineCheckerQueue, type DeadlineCheckJob } from '../../queue/registry.js'
import { checkDeadlines, eveningSummary, morningDigest } from './cron.service.js'

const JOBS = {
  CHECK_DEADLINES: 'check-deadlines',
  MORNING_DIGEST: 'morning-digest',
  EVENING_SUMMARY: 'evening-summary',
} as const

async function processCronJob(job: Job<DeadlineCheckJob | Record<string, unknown>>) {
  switch (job.name) {
    case JOBS.CHECK_DEADLINES:
      return checkDeadlines()
    case JOBS.MORNING_DIGEST:
      return morningDigest()
    case JOBS.EVENING_SUMMARY:
      return eveningSummary()
    default:
      logger.warn({ jobName: job.name }, 'unknown cron job — skipping')
      return null
  }
}

export function startCronWorker(): Worker {
  const connection = createRedisConnection()
  const worker = new Worker(QUEUES.DEADLINE_CHECKER, processCronJob, {
    connection,
    concurrency: 1, // cron ticks are cheap; running in series simplifies logs
  })
  worker.on('failed', (job, err) => {
    logger.warn({ jobName: job?.name, err: err.message }, 'cron job failed')
  })
  logger.info('cron worker started')
  return worker
}

/**
 * Registers repeatable schedulers. Idempotent — re-invoking only upserts the
 * existing scheduler with the same key, so a restart of the API doesn't
 * create duplicate schedules.
 *
 * Patterns (UTC):
 *   - every 15 min:  deadline scan
 *   - 09:00 daily:   morning digest
 *   - 18:00 daily:   evening AI summary
 */
export async function scheduleCronJobs(): Promise<void> {
  await deadlineCheckerQueue.upsertJobScheduler(
    'cron:check-deadlines',
    { pattern: '*/15 * * * *' },
    { name: JOBS.CHECK_DEADLINES, data: { scheduledAt: new Date().toISOString() } },
  )
  await deadlineCheckerQueue.upsertJobScheduler(
    'cron:morning-digest',
    { pattern: '0 9 * * *' },
    { name: JOBS.MORNING_DIGEST, data: { scheduledAt: new Date().toISOString() } },
  )
  await deadlineCheckerQueue.upsertJobScheduler(
    'cron:evening-summary',
    { pattern: '0 18 * * *' },
    { name: JOBS.EVENING_SUMMARY, data: { scheduledAt: new Date().toISOString() } },
  )
  logger.info('cron schedulers upserted (15min / 09:00 / 18:00 UTC)')
}
