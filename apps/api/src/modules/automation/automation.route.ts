import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  boardRuleParam,
  createRuleBodySchema,
  patchRuleBodySchema,
  ruleParam,
  ruleSchema,
  testRuleBodySchema,
  testRuleResultSchema,
} from './automation.schemas.js'
import * as service from './automation.service.js'

/**
 * Mounted at `/api/boards/:boardId/rules` from the boards plugin.
 */
export const automationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get(
    '/',
    {
      schema: {
        tags: ['automation'],
        summary: 'List automation rules on a board',
        security: [{ bearerAuth: [] }],
        params: boardRuleParam,
        response: { 200: z.array(ruleSchema) },
      },
    },
    async (req) => service.listRules(req.user!.id, req.params.boardId),
  )

  app.post(
    '/',
    {
      schema: {
        tags: ['automation'],
        summary: 'Create an automation rule (ADMIN+)',
        security: [{ bearerAuth: [] }],
        params: boardRuleParam,
        body: createRuleBodySchema,
        response: { 201: ruleSchema },
      },
    },
    async (req, reply) => {
      const rule = await service.createRule(req.user!.id, req.params.boardId, req.body)
      return reply.status(201).send(rule)
    },
  )

  app.patch(
    '/:ruleId',
    {
      schema: {
        tags: ['automation'],
        summary: 'Update a rule',
        security: [{ bearerAuth: [] }],
        params: ruleParam,
        body: patchRuleBodySchema,
        response: { 200: ruleSchema },
      },
    },
    async (req) =>
      service.patchRule(
        req.user!.id,
        req.params.boardId,
        req.params.ruleId,
        req.body,
      ),
  )

  app.delete(
    '/:ruleId',
    {
      schema: {
        tags: ['automation'],
        summary: 'Delete a rule',
        security: [{ bearerAuth: [] }],
        params: ruleParam,
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await service.deleteRule(req.user!.id, req.params.boardId, req.params.ruleId)
      return reply.status(204).send()
    },
  )

  app.post(
    '/:ruleId/toggle',
    {
      schema: {
        tags: ['automation'],
        summary: 'Toggle isActive',
        security: [{ bearerAuth: [] }],
        params: ruleParam,
        response: { 200: ruleSchema },
      },
    },
    async (req) =>
      service.toggleRule(req.user!.id, req.params.boardId, req.params.ruleId),
  )

  app.post(
    '/:ruleId/test',
    {
      schema: {
        tags: ['automation'],
        summary: 'Dry-run a rule against an existing task',
        security: [{ bearerAuth: [] }],
        params: ruleParam,
        body: testRuleBodySchema,
        response: { 200: testRuleResultSchema },
      },
    },
    async (req) =>
      service.testRule(
        req.user!.id,
        req.params.boardId,
        req.params.ruleId,
        req.body.taskId,
      ),
  )
}
