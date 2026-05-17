import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { BoardMemberRole } from '@prisma/client'
import { prisma } from '../../src/config/prisma.js'
import { closeApp, getApp } from './app-fixture.js'
import { createBoard, createUser } from '../helpers.js'
import * as authService from '../../src/modules/auth/auth.service.js'

afterAll(async () => {
  await closeApp()
})

/**
 * Cuts a Bearer token directly via authService rather than going through
 * the HTTP login route (already covered by auth.test). Faster + decoupled.
 */
async function bearerFor(email: string, password: string) {
  const { accessToken } = await authService.login({ email, password })
  return `Bearer ${accessToken}`
}

describe('Tasks integration', () => {
  it('POST /api/boards/:id/tasks creates a task in the DB', async () => {
    const app = await getApp()
    const { user, password, email } = await createUser()
    const { board, columns } = await createBoard(user.id)
    const auth = await bearerFor(email, password)

    const r = await request(app.server)
      .post(`/api/boards/${board.id}/tasks`)
      .set('authorization', auth)
      .send({ title: 'Created via API', columnId: columns[0]!.id, priority: 'HIGH' })

    expect(r.status).toBe(201)
    expect(r.body.title).toBe('Created via API')
    expect(r.body.priority).toBe('HIGH')

    const row = await prisma.task.findUniqueOrThrow({ where: { id: r.body.id } })
    expect(row.columnId).toBe(columns[0]!.id)
    expect(row.creatorId).toBe(user.id)
  })

  it('POST /api/tasks/:id/move updates positions and emits task:moved', async () => {
    const app = await getApp()
    const { user, password, email } = await createUser()
    const { board, columns } = await createBoard(user.id)
    const auth = await bearerFor(email, password)

    // Create two tasks via API
    const a = await request(app.server)
      .post(`/api/boards/${board.id}/tasks`)
      .set('authorization', auth)
      .send({ title: 'A', columnId: columns[0]!.id })
    const b = await request(app.server)
      .post(`/api/boards/${board.id}/tasks`)
      .set('authorization', auth)
      .send({ title: 'B', columnId: columns[0]!.id })
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)

    // Subscribe to the event bus before the move
    const { eventBus } = await import('../../src/shared/events/index.js')
    const observed: Array<{ taskId: string; to: string; pos: number }> = []
    const unsubscribe = eventBus.on('task:moved', (e) =>
      observed.push({ taskId: e.task.id, to: e.toColumnId, pos: e.position }),
    )

    try {
      const r = await request(app.server)
        .post(`/api/tasks/${a.body.id}/move`)
        .set('authorization', auth)
        .send({ columnId: columns[1]!.id, position: 0 })
      expect(r.status).toBe(200)
      expect(r.body.columnId).toBe(columns[1]!.id)
      expect(r.body.position).toBe(0)
    } finally {
      unsubscribe()
    }

    expect(observed).toContainEqual({
      taskId: a.body.id,
      to: columns[1]!.id,
      pos: 0,
    })

    // Source column now has only B at position 0
    const sourceTasks = await prisma.task.findMany({
      where: { columnId: columns[0]!.id },
      orderBy: { position: 'asc' },
    })
    expect(sourceTasks.map((t) => t.id)).toEqual([b.body.id])
    expect(sourceTasks[0]!.position).toBe(0)
  })

  it('POST /api/tasks/:id/lock returns 200 then 409 for another user', async () => {
    const app = await getApp()
    const owner = await createUser()
    const otherUser = await createUser()
    const { board, columns } = await createBoard(owner.user.id, {
      extraMembers: [{ userId: otherUser.user.id, role: BoardMemberRole.MEMBER }],
    })
    const ownerAuth = await bearerFor(owner.email, owner.password)
    const otherAuth = await bearerFor(otherUser.email, otherUser.password)

    // Create a task to lock
    const created = await request(app.server)
      .post(`/api/boards/${board.id}/tasks`)
      .set('authorization', ownerAuth)
      .send({ title: 'lock target', columnId: columns[0]!.id })
    expect(created.status).toBe(201)

    // Owner locks → 200, lockedBy set
    const lock1 = await request(app.server)
      .post(`/api/tasks/${created.body.id}/lock`)
      .set('authorization', ownerAuth)
    expect(lock1.status).toBe(200)
    expect(lock1.body.lockedBy).toBe(owner.user.id)

    // Other user tries to lock → 409
    const lock2 = await request(app.server)
      .post(`/api/tasks/${created.body.id}/lock`)
      .set('authorization', otherAuth)
    expect(lock2.status).toBe(409)
    expect(lock2.body.error.code).toBe('CONFLICT')

    // Owner re-lock is idempotent
    const lock3 = await request(app.server)
      .post(`/api/tasks/${created.body.id}/lock`)
      .set('authorization', ownerAuth)
    expect(lock3.status).toBe(200)
  })
})
