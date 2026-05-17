import { describe, it, expect } from 'vitest'
import {
  ConflictError,
  ValidationError,
} from '../../src/shared/errors/app-error.js'
import { computeDedupHash, submit } from '../../src/modules/queue/queue.service.js'
import { prisma } from '../../src/config/prisma.js'
import { createBoard, createUser, rand } from '../helpers.js'

describe('QueueService.submit + dedup', () => {
  it('produces a stable hash for identical inputs within the same hour', () => {
    const now = Date.now()
    const a = computeDedupHash({ title: 't', source: 'telegram', now })
    const b = computeDedupHash({ title: 't', source: 'telegram', now: now + 60_000 })
    expect(a).toEqual(b)
  })

  it('differs by source even with the same title', () => {
    const now = Date.now()
    const a = computeDedupHash({ title: 't', source: 'telegram', now })
    const b = computeDedupHash({ title: 't', source: 'web-form', now })
    expect(a).not.toEqual(b)
  })

  it('changes across hour buckets', () => {
    const now = Date.now()
    const a = computeDedupHash({ title: 't', source: 'telegram', now })
    const b = computeDedupHash({ title: 't', source: 'telegram', now: now + 3_600_000 })
    expect(a).not.toEqual(b)
  })

  it('rejects an unknown source with ValidationError', async () => {
    const { user } = await createUser()
    const { board } = await createBoard(user.id)
    await expect(
      submit({
        userId: user.id,
        boardId: board.id,
        title: 't',
        source: 'rogue-source',
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('accepts a first submit and rejects the second with ConflictError', async () => {
    const { user } = await createUser()
    const { board } = await createBoard(user.id)
    const title = `Dedup ${rand('s')}`

    const first = await submit({
      userId: user.id,
      boardId: board.id,
      title,
      source: 'telegram',
    })
    expect(first.status).toBe('PENDING')

    await expect(
      submit({
        userId: user.id,
        boardId: board.id,
        title,
        source: 'telegram',
      }),
    ).rejects.toBeInstanceOf(ConflictError)

    // The IncomingTask row is present and unique by dedupHash.
    const row = await prisma.incomingTask.findUnique({
      where: { id: first.id },
    })
    expect(row).not.toBeNull()
    expect(row!.dedupHash).toEqual(
      computeDedupHash({ title, source: 'telegram' }),
    )
  })
})
