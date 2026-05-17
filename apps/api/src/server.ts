import { buildApp } from './app.js'
import { env } from './config/env.js'
import { prisma } from './config/prisma.js'
import { redis } from './config/redis.js'
import { logger } from './shared/logger.js'
import { attachSocketServer } from './socket/index.js'

async function start() {
  const app = await buildApp()

  // Socket.IO attaches to Fastify's underlying http.Server, so the API and
  // WebSocket transport share a single port (matches docker-compose & nginx).
  const socket = attachSocketServer(app.server)

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down')
    try {
      await socket.close()
      await app.close()
      await prisma.$disconnect()
      await redis.quit()
      logger.info('shutdown complete')
      process.exit(0)
    } catch (err) {
      logger.error({ err }, 'shutdown failed')
      process.exit(1)
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandledRejection')
  })
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException')
    process.exit(1)
  })

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    logger.info(
      {
        port: env.PORT,
        docs: `http://localhost:${env.PORT}/documentation`,
        websocket: `ws://localhost:${env.PORT}/socket.io (namespace: /boards)`,
      },
      'API + Socket.IO ready',
    )
  } catch (err) {
    logger.fatal({ err }, 'failed to start server')
    await socket.close().catch(() => undefined)
    await prisma.$disconnect().catch(() => undefined)
    await redis.quit().catch(() => undefined)
    process.exit(1)
  }
}

void start()
