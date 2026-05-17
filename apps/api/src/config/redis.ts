import { Redis, type RedisOptions } from 'ioredis'
import { env } from './env.js'
import { logger } from '../shared/logger.js'

const baseOptions: RedisOptions = {
  maxRetriesPerRequest: null, // required by BullMQ; safe default for app usage too
  enableReadyCheck: true,
  lazyConnect: false,
}

export const redis = new Redis(env.REDIS_URL, baseOptions)

redis.on('error', (err) => {
  logger.error({ err: err.message }, 'redis connection error')
})

redis.on('ready', () => {
  logger.info('redis ready')
})

/** Separate connection for pub/sub or BullMQ workers (cannot share a normal client). */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, baseOptions)
}
