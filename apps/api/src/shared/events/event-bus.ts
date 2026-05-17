import { EventEmitter } from 'node:events'
import { logger } from '../logger.js'
import { getRequestContext } from '../context/request-context.js'

type AnyListener<Events extends object> = <K extends keyof Events>(
  name: K,
  payload: Events[K],
) => void | Promise<void>

/**
 * Typed in-process pub/sub. Wraps Node's EventEmitter so:
 *   - listener errors are isolated (logged, never propagate to other listeners
 *     or back to the emit caller — emit-after-DB-commit semantics)
 *   - `originSocketId` is pulled from AsyncLocalStorage transparently
 *   - dispatch is synchronous from the caller's perspective, but async
 *     listeners run independently on their own microtask queue
 */
export class TypedEventBus<Events extends object> {
  private emitter = new EventEmitter({ captureRejections: true })
  private anyListeners: AnyListener<Events>[] = []

  constructor() {
    this.emitter.setMaxListeners(100)
    this.emitter.on('error', (err) => logger.error({ err }, 'event-bus emitter error'))
  }

  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    const ctx = getRequestContext()
    const withOrigin = payload as Events[K] & { originSocketId?: string }
    const enriched =
      ctx?.socketId !== undefined && withOrigin.originSocketId === undefined
        ? ({ ...withOrigin, originSocketId: ctx.socketId } as Events[K])
        : payload

    logger.debug({ event: name as string }, 'bus emit')
    this.emitter.emit(name as string, enriched)
    for (const any of this.anyListeners) {
      Promise.resolve(any(name, enriched)).catch((err) =>
        logger.error({ err, event: String(name) }, 'any-listener threw'),
      )
    }
  }

  on<K extends keyof Events>(
    name: K,
    listener: (payload: Events[K]) => void | Promise<void>,
  ): () => void {
    const wrapped = async (payload: Events[K]) => {
      try {
        await listener(payload)
      } catch (err) {
        logger.error({ err, event: String(name) }, 'event listener threw')
      }
    }
    this.emitter.on(name as string, wrapped)
    return () => this.emitter.off(name as string, wrapped)
  }

  /** Subscribe to every domain event. Useful for diagnostics. */
  onAny(listener: AnyListener<Events>): () => void {
    this.anyListeners.push(listener)
    return () => {
      const idx = this.anyListeners.indexOf(listener)
      if (idx !== -1) this.anyListeners.splice(idx, 1)
    }
  }

  listenerCount<K extends keyof Events>(name: K): number {
    return this.emitter.listenerCount(name as string)
  }
}
