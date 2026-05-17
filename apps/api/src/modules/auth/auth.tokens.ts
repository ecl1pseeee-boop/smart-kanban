import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'
import { UnauthorizedError } from '../../shared/errors/app-error.js'

const accessSecret = new TextEncoder().encode(env.JWT_SECRET)
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET)

const ISSUER = 'smart-kanban'
const AUDIENCE = 'smart-kanban-api'

export interface AccessTokenPayload extends JWTPayload {
  sub: string
  email: string
  role: 'ADMIN' | 'MEMBER'
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string
  jti: string
}

export async function signAccessToken(payload: {
  userId: string
  email: string
  role: 'ADMIN' | 'MEMBER'
}): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRES)
    .sign(accessSecret)
}

export async function signRefreshToken(payload: { userId: string }): Promise<{
  token: string
  jti: string
  expiresAt: Date
}> {
  const jti = randomUUID()
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setJti(jti)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_REFRESH_EXPIRES)
    .sign(refreshSecret)

  const decoded = decodeJwtExp(token)
  return { token, jti, expiresAt: new Date(decoded * 1000) }
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, accessSecret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    })
    if (!payload.sub || typeof payload.email !== 'string' || typeof payload.role !== 'string') {
      throw new UnauthorizedError('Invalid token payload')
    }
    return payload as AccessTokenPayload
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err
    throw new UnauthorizedError('Invalid or expired access token')
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    })
    if (!payload.sub || typeof payload.jti !== 'string') {
      throw new UnauthorizedError('Invalid refresh token payload')
    }
    return payload as RefreshTokenPayload
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err
    throw new UnauthorizedError('Invalid or expired refresh token')
  }
}

function decodeJwtExp(token: string): number {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) throw new Error('malformed jwt')
  const json = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  if (typeof json.exp !== 'number') throw new Error('jwt missing exp')
  return json.exp
}
