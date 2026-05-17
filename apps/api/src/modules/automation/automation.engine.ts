import { AutomationTrigger } from '@prisma/client'
import { eventBus } from '../../shared/events/index.js'
import { logger } from '../../shared/logger.js'
import { processTrigger } from './automation.service.js'

/**
 * Wires EventBus → AutomationEngine. Subscriptions must be registered once
 * during app bootstrap (see app.ts). Mapping rules:
 *
 *   task:created   → TASK_CREATED
 *   task:moved     → TASK_MOVED
 *   task:updated   → TASK_UPDATED
 *     + diff(tags)        → TAG_ADDED
 *     + diff(assigneeId)  → TASK_ASSIGNED (if new assignee is non-null)
 *
 * DUE_DATE_APPROACHING is emitted by the cron job in Step 11.
 */
export function startAutomationEngine(): void {
  eventBus.on('task:created', async ({ task, actorId }) => {
    await processTrigger(AutomationTrigger.TASK_CREATED, task, actorId)
  })

  eventBus.on('task:moved', async ({ task, actorId }) => {
    await processTrigger(AutomationTrigger.TASK_MOVED, task, actorId)
  })

  eventBus.on('task:updated', async ({ task, previous, actorId }) => {
    await processTrigger(AutomationTrigger.TASK_UPDATED, task, actorId)

    const newTags = task.tags.filter((t) => !previous.tags.includes(t))
    if (newTags.length > 0) {
      await processTrigger(AutomationTrigger.TAG_ADDED, task, actorId)
    }

    if (task.assigneeId && task.assigneeId !== previous.assigneeId) {
      await processTrigger(AutomationTrigger.TASK_ASSIGNED, task, actorId)
    }
  })

  logger.info('AutomationEngine subscribed to EventBus')
}
