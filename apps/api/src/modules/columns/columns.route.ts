import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { boardIdParamSchema } from '../boards/boards.schemas.js'
import {
  columnPathParamsSchema,
  columnSchema,
  createColumnBodySchema,
  patchColumnBodySchema,
  reorderBodySchema,
  reorderedListSchema,
} from './columns.schemas.js'
import * as columnsService from './columns.service.js'

/**
 * Mounted as `/api/boards/:boardId/columns` from the parent boards plugin.
 * Routes here are relative to that prefix.
 */
export const columnsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get(
    '/',
    {
      schema: {
        tags: ['columns'],
        summary: 'List columns of a board',
        security: [{ bearerAuth: [] }],
        params: boardIdParamSchema,
        response: { 200: z.array(columnSchema) },
      },
    },
    async (req) => columnsService.listColumns(req.user!.id, req.params.boardId),
  )

  app.post(
    '/',
    {
      schema: {
        tags: ['columns'],
        summary: 'Create a column (ADMIN+); appended to the end',
        security: [{ bearerAuth: [] }],
        params: boardIdParamSchema,
        body: createColumnBodySchema,
        response: { 201: columnSchema },
      },
    },
    async (req, reply) => {
      const column = await columnsService.createColumn(
        req.user!.id,
        req.params.boardId,
        req.body,
      )
      return reply.status(201).send(column)
    },
  )

  app.patch(
    '/:columnId',
    {
      schema: {
        tags: ['columns'],
        summary: 'Update a column (name/color/wipLimit/isDefault)',
        security: [{ bearerAuth: [] }],
        params: columnPathParamsSchema,
        body: patchColumnBodySchema,
        response: { 200: columnSchema },
      },
    },
    async (req) =>
      columnsService.updateColumn(
        req.user!.id,
        req.params.boardId,
        req.params.columnId,
        req.body,
      ),
  )

  app.delete(
    '/:columnId',
    {
      schema: {
        tags: ['columns'],
        summary: 'Delete a column (409 if it still has tasks)',
        security: [{ bearerAuth: [] }],
        params: columnPathParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await columnsService.deleteColumn(
        req.user!.id,
        req.params.boardId,
        req.params.columnId,
      )
      return reply.status(204).send()
    },
  )

  app.post(
    '/reorder',
    {
      schema: {
        tags: ['columns'],
        summary: 'Atomically reorder all columns of the board (ADMIN+)',
        security: [{ bearerAuth: [] }],
        params: boardIdParamSchema,
        body: reorderBodySchema,
        response: { 200: reorderedListSchema },
      },
    },
    async (req) =>
      columnsService.reorderColumns(req.user!.id, req.params.boardId, req.body.order),
  )
}
