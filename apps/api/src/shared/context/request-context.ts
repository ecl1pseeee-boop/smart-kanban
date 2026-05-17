import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  requestId: string
  userId?: string
  /** Originating Socket.IO connection — used to suppress echo on the initiator. */
  socketId?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId
}
