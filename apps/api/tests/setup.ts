import { afterAll, beforeAll } from 'vitest'
import { prisma } from '../src/config/prisma.js'
import { redis } from '../src/config/redis.js'

/**
 * Each test creates its own users + board with randomized identifiers, so
 * test isolation comes from the data, not from wiping the DB. That keeps
 * the smoke scripts and the test suite friendly to the same dev Postgres.
 *
 * We do nothing in beforeAll except verify the connection — the actual
 * Fastify app is built lazily by the integration tests that need it.
 */
beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`
  await redis.ping()
})

afterAll(async () => {
  await prisma.$disconnect()
  await redis.quit().catch(() => undefined)
})
