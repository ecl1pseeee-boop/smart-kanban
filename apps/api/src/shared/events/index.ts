import { TypedEventBus } from './event-bus.js'
import type { DomainEvents } from './types.js'

export const eventBus = new TypedEventBus<DomainEvents>()
export type { DomainEvents, DomainEventName, UserMeta, CommentWithAuthor } from './types.js'
