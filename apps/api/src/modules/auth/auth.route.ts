import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  authResponseSchema,
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  registerBodySchema,
  tokenPairSchema,
  userPublicSchema,
} from './auth.schemas.js'
import * as authService from './auth.service.js'

const AUTH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/register',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Register a new user',
        body: registerBodySchema,
        response: { 201: authResponseSchema },
      },
    },
    async (req, reply) => {
      const result = await authService.register(req.body)
      return reply.status(201).send(result)
    },
  )

  app.post(
    '/login',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Login with email + password',
        body: loginBodySchema,
        response: { 200: authResponseSchema },
      },
    },
    async (req) => {
      return authService.login(req.body)
    },
  )

  app.post(
    '/refresh',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Rotate access + refresh tokens',
        body: refreshBodySchema,
        response: { 200: tokenPairSchema },
      },
    },
    async (req) => {
      return authService.refresh(req.body)
    },
  )

  app.post(
    '/logout',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      preHandler: [app.authenticate],
      schema: {
        tags: ['auth'],
        summary: 'Revoke the supplied refresh token (or all sessions if omitted)',
        security: [{ bearerAuth: [] }],
        body: logoutBodySchema,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await authService.logout({
        userId: req.user!.id,
        refreshToken: req.body.refreshToken,
      })
      return reply.status(204).send()
    },
  )

  app.get(
    '/me',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['auth'],
        summary: 'Current authenticated user',
        security: [{ bearerAuth: [] }],
        response: { 200: userPublicSchema },
      },
    },
    async (req) => {
      return req.user!
    },
  )
}
