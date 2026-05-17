import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { closeApp, getApp } from './app-fixture.js'
import { createBoard, createUser, rand } from '../helpers.js'
import * as authService from '../../src/modules/auth/auth.service.js'

afterAll(async () => {
  await closeApp()
})

async function bearerFor(email: string, password: string) {
  const { accessToken } = await authService.login({ email, password })
  return `Bearer ${accessToken}`
}

describe('POST /api/queue/tasks', () => {
  it('accepts a submission with status PENDING and persists IncomingTask', async () => {
    const app = await getApp()
    const { user, email, password } = await createUser()
    const { board } = await createBoard(user.id)
    const auth = await bearerFor(email, password)

    const r = await request(app.server)
      .post('/api/queue/tasks')
      .set('authorization', auth)
      .send({
        boardId: board.id,
        title: `Q ${rand('s')}`,
        source: 'telegram',
      })

    expect(r.status).toBe(202)
    expect(r.body.status).toBe('PENDING')
    expect(r.body.taskId).toBeNull()
    expect(typeof r.body.id).toBe('string')
  })

  it('rejects a duplicate (same hour bucket) with 409 CONFLICT', async () => {
    const app = await getApp()
    const { user, email, password } = await createUser()
    const { board } = await createBoard(user.id)
    const auth = await bearerFor(email, password)
    const title = `dup ${rand('s')}`

    const first = await request(app.server)
      .post('/api/queue/tasks')
      .set('authorization', auth)
      .send({ boardId: board.id, title, source: 'telegram' })
    expect(first.status).toBe(202)

    const second = await request(app.server)
      .post('/api/queue/tasks')
      .set('authorization', auth)
      .send({ boardId: board.id, title, source: 'telegram' })

    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe('CONFLICT')
    expect(second.body.error.details?.existingIncomingTaskId).toBe(first.body.id)
  })

  it('returns 400 for an unknown source', async () => {
    const app = await getApp()
    const { user, email, password } = await createUser()
    const { board } = await createBoard(user.id)
    const auth = await bearerFor(email, password)

    const r = await request(app.server)
      .post('/api/queue/tasks')
      .set('authorization', auth)
      .send({ boardId: board.id, title: 'whatever', source: 'rogue' })

    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
  })
})
