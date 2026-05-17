import type { User } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { redis } from '../../config/redis.js'
import { ConflictError, UnauthorizedError } from '../../shared/errors/app-error.js'
import { hashPassword, verifyPassword } from '../../shared/utils/password.js'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './auth.tokens.js'
import type { UserPublic } from './auth.schemas.js'

const USER_CACHE_TTL_SECONDS = 60
const userCacheKey = (id: string) => `auth:user:${id}`

export function toPublicUser(u: User): UserPublic {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    avatarUrl: u.avatarUrl,
    telegramId: u.telegramId,
    createdAt: u.createdAt,
  }
}

async function issueTokens(user: User) {
  const accessToken = await signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  })
  const refresh = await signRefreshToken({ userId: user.id })

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refresh.token,
      expiresAt: refresh.expiresAt,
    },
  })

  return { accessToken, refreshToken: refresh.token }
}

export async function register(input: { email: string; name: string; password: string }) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } })
  if (exists) throw new ConflictError('Email already registered')

  const passwordHash = await hashPassword(input.password)
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
    },
  })

  const tokens = await issueTokens(user)
  return { user: toPublicUser(user), ...tokens }
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } })
  if (!user) throw new UnauthorizedError('Invalid email or password')

  const ok = await verifyPassword(user.passwordHash, input.password)
  if (!ok) throw new UnauthorizedError('Invalid email or password')

  const tokens = await issueTokens(user)
  return { user: toPublicUser(user), ...tokens }
}

/** Rotates refresh token — old one is invalidated, fresh pair issued. */
export async function refresh(input: { refreshToken: string }) {
  const payload = await verifyRefreshToken(input.refreshToken)

  const stored = await prisma.refreshToken.findUnique({
    where: { token: input.refreshToken },
  })
  if (!stored) throw new UnauthorizedError('Refresh token revoked')
  if (stored.expiresAt.getTime() < Date.now()) {
    await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => undefined)
    throw new UnauthorizedError('Refresh token expired')
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user) throw new UnauthorizedError('User no longer exists')

  // Rotation: delete the consumed token, then issue a fresh pair.
  await prisma.refreshToken.delete({ where: { id: stored.id } })
  await invalidateUserCache(user.id)

  const tokens = await issueTokens(user)
  return tokens
}

export async function logout(input: { userId: string; refreshToken?: string }) {
  if (input.refreshToken) {
    await prisma.refreshToken
      .deleteMany({ where: { userId: input.userId, token: input.refreshToken } })
      .catch(() => undefined)
  } else {
    // No specific token supplied → revoke all sessions for this user.
    await prisma.refreshToken.deleteMany({ where: { userId: input.userId } })
  }
  await invalidateUserCache(input.userId)
}

/** Loads a user with Redis read-through cache (TTL 60s — Section 11 of SPEC.md). */
export async function getUserById(userId: string): Promise<UserPublic | null> {
  const cached = await redis.get(userCacheKey(userId)).catch(() => null)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as UserPublic & { createdAt: string }
      return { ...parsed, createdAt: new Date(parsed.createdAt) }
    } catch {
      // fall through to DB
    }
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null

  const pub = toPublicUser(user)
  await redis
    .set(userCacheKey(userId), JSON.stringify(pub), 'EX', USER_CACHE_TTL_SECONDS)
    .catch(() => undefined)
  return pub
}

export async function invalidateUserCache(userId: string): Promise<void> {
  await redis.del(userCacheKey(userId)).catch(() => undefined)
}
