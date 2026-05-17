import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

/**
 * Single Fastify instance shared across the integration suite. We don't
 * `listen()` — Supertest can drive `app.server` directly via `app.ready()`.
 */
let appPromise: Promise<FastifyInstance> | null = null

export async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      const app = await buildApp()
      await app.ready()
      return app
    })()
  }
  return appPromise
}

export async function closeApp(): Promise<void> {
  if (!appPromise) return
  const app = await appPromise
  await app.close()
  appPromise = null
}
