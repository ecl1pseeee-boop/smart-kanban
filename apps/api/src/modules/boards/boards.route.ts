import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  activityPageSchema,
  activityQuerySchema,
  addMemberBodySchema,
  boardIdParamSchema,
  boardListItemSchema,
  boardSchema,
  boardStateSchema,
  createBoardBodySchema,
  memberIdParamSchema,
  patchBoardBodySchema,
  boardMemberSchema,
} from './boards.schemas.js'
import * as boardsService from './boards.service.js'

export const boardsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get(
    '/',
    {
      schema: {
        tags: ['boards'],
        summary: 'List boards the caller is a member of',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(boardListItemSchema) },
      },
    },
    async (req) => boardsService.listBoardsForUser(req.user!.id),
  )

  app.post(
    '/',
    {
      schema: {
        tags: ['boards'],
        summary: 'Create a new board (caller becomes OWNER)',
        security: [{ bearerAuth: [] }],
        body: createBoardBodySchema,
        response: { 201: boardSchema },
      },
    },
    async (req, reply) => {
      const board = await boardsService.createBoard(req.user!.id, req.body)
      return reply.status(201).send(board)
    },
  )

  app.get(
    '/:boardId',
    {
      schema: {
        tags: ['boards'],
        summary: 'Full board state — board + columns + tasks (one-shot for SPA)',
        security: [{ bearerAuth: [] }],
        params: boardIdParamSchema,
        response: { 200: boardStateSchema },
      },
    },
    async (req) => boardsService.getBoardState(req.user!.id, req.params.boardId),
  )

  app.patch(
    '/:boardId',
    {
      schema: {
        tags: ['boards'],
        summary: 'Update board metadata (ADMIN+)',
        security: [{ bearerAuth: [] }],
        params: boardIdParamSchema,
        body: patchBoardBodySchema,
        response: { 200: boardSchema },
      },
    },
    async (req) => boardsService.updateBoard(req.user!.id, req.params.boardId, req.body),
  )

  app.delete(
    '/:boardId',
    {
      schema: {
        tags: ['boards'],
        summary: 'Delete a board (OWNER only)',
        security: [{ bearerAuth: [] }],
        params: boardIdParamSchema,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await boardsService.deleteBoard(req.user!.id, req.params.boardId)
      return reply.status(204).send()
    },
  )

  // ── Members ───────────────────────────────────────────────────────
  app.get(
    '/:boardId/members',
    {
      schema: {
        tags: ['boards'],
        summary: 'List members of the board',
        security: [{ bearerAuth: [] }],
        params: boardIdParamSchema,
        response: { 200: z.array(boardMemberSchema) },
      },
    },
    async (req) => boardsService.listMembers(req.user!.id, req.params.boardId),
  )

  app.post(
    '/:boardId/members',
    {
      schema: {
        tags: ['boards'],
        summary: 'Add a member by email (ADMIN+)',
        security: [{ bearerAuth: [] }],
        params: boardIdParamSchema,
        body: addMemberBodySchema,
        response: { 201: boardMemberSchema },
      },
    },
    async (req, reply) => {
      const member = await boardsService.addMember(
        req.user!.id,
        req.params.boardId,
        req.body,
      )
      return reply.status(201).send(member)
    },
  )

  app.delete(
    '/:boardId/members/:userId',
    {
      schema: {
        tags: ['boards'],
        summary: 'Remove a member from the board',
        security: [{ bearerAuth: [] }],
        params: memberIdParamSchema,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await boardsService.removeMember(
        req.user!.id,
        req.params.boardId,
        req.params.userId,
      )
      return reply.status(204).send()
    },
  )

  // ── Activity feed (cursor pagination) ─────────────────────────────
  app.get(
    '/:boardId/activity',
    {
      schema: {
        tags: ['boards'],
        summary: 'Recent activity on the board (cursor-paginated)',
        security: [{ bearerAuth: [] }],
        params: boardIdParamSchema,
        querystring: activityQuerySchema,
        response: { 200: activityPageSchema },
      },
    },
    async (req) =>
      boardsService.getActivity(req.user!.id, req.params.boardId, req.query),
  )
}
