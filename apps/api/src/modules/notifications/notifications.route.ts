import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  listNotificationsQuerySchema,
  listNotificationsResponseSchema,
  notificationIdParam,
  notificationSchema,
  readAllResponseSchema,
  unreadCountResponseSchema,
} from './notifications.schemas.js'
import * as notificationsService from './notifications.service.js'

export const notificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get(
    '/',
    {
      schema: {
        tags: ['notifications'],
        summary: 'List notifications for the current user (newest first)',
        security: [{ bearerAuth: [] }],
        querystring: listNotificationsQuerySchema,
        response: { 200: listNotificationsResponseSchema },
      },
    },
    async (req) => notificationsService.list(req.user!.id, req.query),
  )

  app.get(
    '/unread-count',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Quick badge count of unread notifications',
        security: [{ bearerAuth: [] }],
        response: { 200: unreadCountResponseSchema },
      },
    },
    async (req) => ({ unreadCount: await notificationsService.unreadCount(req.user!.id) }),
  )

  app.post(
    '/read-all',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Mark every unread notification as read',
        security: [{ bearerAuth: [] }],
        response: { 200: readAllResponseSchema },
      },
    },
    async (req) => notificationsService.markAllRead(req.user!.id),
  )

  app.patch(
    '/:id/read',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Mark a single notification as read (idempotent)',
        security: [{ bearerAuth: [] }],
        params: notificationIdParam,
        response: { 200: notificationSchema },
      },
    },
    async (req) => notificationsService.markRead(req.user!.id, req.params.id),
  )
}
