export const QUEUES = {
  TASK_EVENTS: 'task-events',
  INCOMING_TASKS: 'incoming-tasks',
  NOTIFICATIONS: 'notifications',
  AI_JOBS: 'ai-jobs',
  DEADLINE_CHECKER: 'deadline-checker',
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]
