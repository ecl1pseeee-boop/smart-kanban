import { describe, it, expect } from 'vitest'
import { moveTask } from '../../src/modules/tasks/tasks.service.js'
import { ConflictError } from '../../src/shared/errors/app-error.js'
import { prisma } from '../../src/config/prisma.js'
import { createBoard, createTaskRow, createUser } from '../helpers.js'

describe('TaskService.move()', () => {
  it('recomputes positions when moving within the same column', async () => {
    const { user } = await createUser()
    const { board, columns } = await createBoard(user.id)
    const todo = columns[0]!

    const a = await createTaskRow(user.id, board.id, todo.id, { title: 'A' })
    const b = await createTaskRow(user.id, board.id, todo.id, { title: 'B' })
    const c = await createTaskRow(user.id, board.id, todo.id, { title: 'C' })

    // Move A from position 0 → 2 (end). Expected order: B, C, A.
    await moveTask(user.id, a.id, { columnId: todo.id, position: 2 })

    const after = await prisma.task.findMany({
      where: { columnId: todo.id },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    })
    expect(after.map((t) => t.id)).toEqual([b.id, c.id, a.id])
    expect(after.map((t) => t.position)).toEqual([0, 1, 2])
  })

  it('recomputes positions when moving across columns', async () => {
    const { user } = await createUser()
    const { board, columns } = await createBoard(user.id)
    const [todo, doing] = [columns[0]!, columns[1]!]

    const a = await createTaskRow(user.id, board.id, todo.id, { title: 'A' })
    const b = await createTaskRow(user.id, board.id, todo.id, { title: 'B' })
    const x = await createTaskRow(user.id, board.id, doing.id, { title: 'X' })

    await moveTask(user.id, a.id, { columnId: doing.id, position: 0 })

    const todoNow = await prisma.task.findMany({
      where: { columnId: todo.id },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    })
    const doingNow = await prisma.task.findMany({
      where: { columnId: doing.id },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    })
    // Source column: B alone at position 0.
    expect(todoNow).toEqual([{ id: b.id, position: 0 }])
    // Destination column: A then X.
    expect(doingNow.map((t) => t.id)).toEqual([a.id, x.id])
    expect(doingNow.map((t) => t.position)).toEqual([0, 1])
  })

  it('enforces WIP limit on cross-column moves', async () => {
    const { user } = await createUser()
    const { board, columns } = await createBoard(user.id, { wipLimitDoing: 1 })
    const [todo, doing] = [columns[0]!, columns[1]!]

    // Fill `doing` to its WIP limit.
    await createTaskRow(user.id, board.id, doing.id, { title: 'filler' })
    const t = await createTaskRow(user.id, board.id, todo.id, { title: 'wants in' })

    await expect(
      moveTask(user.id, t.id, { columnId: doing.id, position: 0 }),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('clamps an out-of-range position to the end of the column', async () => {
    const { user } = await createUser()
    const { board, columns } = await createBoard(user.id)
    const todo = columns[0]!
    const a = await createTaskRow(user.id, board.id, todo.id)
    const b = await createTaskRow(user.id, board.id, todo.id)

    // Ask for position 999 — should land at end.
    const moved = await moveTask(user.id, a.id, { columnId: todo.id, position: 999 })
    expect(moved.task.position).toBe(1)

    const after = await prisma.task.findMany({
      where: { columnId: todo.id },
      orderBy: { position: 'asc' },
      select: { id: true },
    })
    expect(after.map((t) => t.id)).toEqual([b.id, a.id])
  })
})
