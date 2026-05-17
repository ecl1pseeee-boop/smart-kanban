import { z } from 'zod'
import { columnSchema } from '../boards/boards.schemas.js'

export { columnSchema }

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'color must be a #RGB or #RRGGBB hex')

export const columnPathParamsSchema = z.object({
  boardId: z.string().min(1),
  columnId: z.string().min(1),
})

export const createColumnBodySchema = z.object({
  name: z.string().min(1).max(80),
  color: hexColor.optional(),
  wipLimit: z.number().int().positive().max(999).optional(),
})

export const patchColumnBodySchema = z
  .object({
    name: z.string().min(1).max(80),
    color: hexColor.nullable(),
    wipLimit: z.number().int().positive().max(999).nullable(),
    isDefault: z.boolean(),
  })
  .partial()

export const reorderBodySchema = z.object({
  order: z
    .array(
      z.object({
        id: z.string().min(1),
        position: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(100),
})

export const reorderedListSchema = z.array(columnSchema)
