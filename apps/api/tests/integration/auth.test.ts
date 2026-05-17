import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { closeApp, getApp } from './app-fixture.js'
import { rand } from '../helpers.js'

afterAll(async () => {
  await closeApp()
})

describe('POST /api/auth', () => {
  it('register + login flow returns access + refresh tokens', async () => {
    const app = await getApp()
    const email = `${rand('auth')}@test.local`

    // Register
    const reg = await request(app.server).post('/api/auth/register').send({
      email,
      name: 'Test User',
      password: 'TestPass123!',
    })
    expect(reg.status).toBe(201)
    expect(reg.body.user.email).toBe(email)
    expect(typeof reg.body.accessToken).toBe('string')
    expect(typeof reg.body.refreshToken).toBe('string')

    // Login with the correct password
    const ok = await request(app.server).post('/api/auth/login').send({
      email,
      password: 'TestPass123!',
    })
    expect(ok.status).toBe(200)
    expect(ok.body.user.email).toBe(email)
    expect(typeof ok.body.accessToken).toBe('string')
    expect(typeof ok.body.refreshToken).toBe('string')
    void reg.body.accessToken // intentionally not compared — JWT iat is per-second

    // /me with the issued bearer
    const me = await request(app.server)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${ok.body.accessToken}`)
    expect(me.status).toBe(200)
    expect(me.body.email).toBe(email)
  })

  it('returns 401 on wrong password', async () => {
    const app = await getApp()
    const email = `${rand('auth')}@test.local`
    await request(app.server).post('/api/auth/register').send({
      email,
      name: 'Test User',
      password: 'TestPass123!',
    })

    const bad = await request(app.server).post('/api/auth/login').send({
      email,
      password: 'WrongPass456!',
    })
    expect(bad.status).toBe(401)
    expect(bad.body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 on unknown email', async () => {
    const app = await getApp()
    const bad = await request(app.server).post('/api/auth/login').send({
      email: `${rand('nobody')}@test.local`,
      password: 'TestPass123!',
    })
    expect(bad.status).toBe(401)
    expect(bad.body.error.code).toBe('UNAUTHORIZED')
  })
})
