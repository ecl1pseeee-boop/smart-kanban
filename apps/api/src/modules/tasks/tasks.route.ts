import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  boardIdParam,
  checklistItemSchema,
  checklistPatchBodySchema,
  commentParams,
  commentSchema,
  createCommentBodySchema,
  createTaskBodySchema,
  listTasksQuerySchema,
  moveTaskBodySchema,
  patchTaskBodySchema,
  taskBaseSchema,
  taskDetailSchema,
  taskIdParam,
  taskListPageSchema,
} from './tasks.schemas.js'
import * as tasksService from './tasks.service.js'
import * as commentsService from './comments.service.js'
import * as checklistService from './checklist.service.js'

/**
 * Board-scoped tasks endpoints (list / create).
 * Mounted at `/api/boards/:boardId/tasks` from the boards plugin.
 */
export const boardTasksRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get(
    '/',
    {
      schema: {
        tags: ['tasks'],
        summary: 'List tasks on a board (filters + cursor pagination)',
        security: [{ bearerAuth: [] }],
        params: boardIdParam,
        querystring: listTasksQuerySchema,
        response: { 200: taskListPageSchema },
      },
    },
    async (req) =>
      tasksService.listTasks(req.user!.id, req.params.boardId, req.query),
  )

  app.post(
    '/',
    {
      schema: {
        tags: ['tasks'],
        summary: 'Create a task on the board',
        security: [{ bearerAuth: [] }],
        params: boardIdParam,
        body: createTaskBodySchema,
        response: { 201: taskBaseSchema },
      },
    },
    async (req, reply) => {
      const task = await tasksService.createTask(
        req.user!.id,
        req.params.boardId,
        req.body,
      )
      return reply.status(201).send(task)
    },
  )
}

/**
 * Single-task endpoints. Mounted at `/api/tasks`.
 */
export const tasksRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get(
    '/:taskId',
    {
      schema: {
        tags: ['tasks'],
        summary: 'Task with assignee, creator, checklist and locker',
        security: [{ bearerAuth: [] }],
        params: taskIdParam,
        response: { 200: taskDetailSchema },
      },
    },
    async (req) => tasksService.getTaskDetail(req.user!.id, req.params.taskId),
  )

  app.patch(
    '/:taskId',
    {
      schema: {
        tags: ['tasks'],
        summary: 'Patch task fields (409 if locked by someone else)',
        security: [{ bearerAuth: [] }],
        params: taskIdParam,
        body: patchTaskBodySchema,
        response: { 200: taskBaseSchema },
      },
    },
    async (req) =>
      tasksService.patchTask(req.user!.id, req.params.taskId, req.body),
  )

  app.delete(
    '/:taskId',
    {
      schema: {
        tags: ['tasks'],
        summary: 'Delete a task (creator or board ADMIN+)',
        security: [{ bearerAuth: [] }],
        params: taskIdParam,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await tasksService.deleteTask(req.user!.id, req.params.taskId)
      return reply.status(204).send()
    },
  )

  app.post(
    '/:taskId/move',
    {
      schema: {
        tags: ['tasks'],
        summary: 'Move a task (cross-column respects WIP limit)',
        security: [{ bearerAuth: [] }],
        params: taskIdParam,
        body: moveTaskBodySchema,
        response: { 200: taskBaseSchema },
      },
    },
    async (req) => {
      const { task } = await tasksService.moveTask(
        req.user!.id,
        req.params.taskId,
        req.body,
      )
      return task
    },
  )

  app.post(
    '/:taskId/lock',
    {
      schema: {
        tags: ['tasks'],
        summary: 'Lock a task for exclusive editing (409 if held by another user)',
        security: [{ bearerAuth: [] }],
        params: taskIdParam,
        response: { 200: taskBaseSchema },
      },
    },
    async (req) => tasksService.lockTask(req.user!.id, req.params.taskId),
  )

  app.post(
    '/:taskId/unlock',
    {
      schema: {
        tags: ['tasks'],
        summary: 'Unlock a task (locker or ADMIN+)',
        security: [{ bearerAuth: [] }],
        params: taskIdParam,
        response: { 200: taskBaseSchema },
      },
    },
    async (req) => tasksService.unlockTask(req.user!.id, req.params.taskId),
  )

  // ── Comments ──────────────────────────────────────────────────────
  app.get(
    '/:taskId/comments',
    {
      schema: {
        tags: ['tasks', 'comments'],
        summary: 'List comments of a task (oldest first)',
        security: [{ bearerAuth: [] }],
        params: taskIdParam,
        response: { 200: z.array(commentSchema) },
      },
    },
    async (req) => commentsService.listComments(req.user!.id, req.params.taskId),
  )

  app.post(
    '/:taskId/comments',
    {
      schema: {
        tags: ['tasks', 'comments'],
        summary: 'Add a comment',
        security: [{ bearerAuth: [] }],
        params: taskIdParam,
        body: createCommentBodySchema,
        response: { 201: commentSchema },
      },
    },
    async (req, reply) => {
      const c = await commentsService.createComment(
        req.user!.id,
        req.params.taskId,
        req.body,
      )
      return reply.status(201).send(c)
    },
  )

  app.delete(
    '/:taskId/comments/:commentId',
    {
      schema: {
        tags: ['tasks', 'comments'],
        summary: 'Delete a comment (author or ADMIN+)',
        security: [{ bearerAuth: [] }],
        params: commentParams,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await commentsService.deleteComment(
        req.user!.id,
        req.params.taskId,
        req.params.commentId,
      )
      return reply.status(204).send()
    },
  )

  // ── Checklist ─────────────────────────────────────────────────────
  app.patch(
    '/:taskId/checklist',
    {
      schema: {
        tags: ['tasks', 'checklist'],
        summary: 'Replace the task checklist (full ordered list)',
        security: [{ bearerAuth: [] }],
        params: taskIdParam,
        body: checklistPatchBodySchema,
        response: { 200: z.array(checklistItemSchema) },
      },
    },
    async (req) =>
      checklistService.patchChecklist(req.user!.id, req.params.taskId, req.body),
  )
}
