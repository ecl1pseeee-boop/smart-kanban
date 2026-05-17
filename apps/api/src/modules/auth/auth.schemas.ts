import { z } from 'zod'

export const userPublicSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['ADMIN', 'MEMBER']),
  avatarUrl: z.string().nullable(),
  telegramId: z.string().nullable(),
  createdAt: z.coerce.date(),
})

export const authResponseSchema = z.object({
  user: userPublicSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
})

export const registerBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  password: z
    .string()
    .min(8, 'password must be at least 8 chars')
    .max(128)
    .regex(/[A-Za-z]/, 'password must contain a letter')
    .regex(/[0-9]/, 'password must contain a digit'),
})

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
})

export const logoutBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
})

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})

export type UserPublic = z.infer<typeof userPublicSchema>
export type RegisterBody = z.infer<typeof registerBodySchema>
export type LoginBody = z.infer<typeof loginBodySchema>
