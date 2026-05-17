import { z } from 'zod'
import { BoardMemberRole, TaskStatus } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../shared/logger.js'
import { requireBoardRole } from '../../shared/access/board-access.js'
import { NotFoundError } from '../../shared/errors/app-error.js'
import { chatJson } from './ai.client.js'
import { heuristicEnrich } from '../queue/queue.worker.js'

type Source = 'ai' | 'heuristic'

// ── Local zod (v3) validators for LLM JSON output ──────────────────

const decomposeOut = z.object({
  steps: z.array(z.string().min(1).max(500)).min(1).max(8),
})

const dailySummaryOut = z.object({
  summary: z.string().min(1).max(4000),
})

const analyzeBugOut = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
})

// ── 1. Decompose task ──────────────────────────────────────────────

export async function decompose(
  userId: string,
  input: { taskId: string },
): Promise<{ checklistItems: string[]; source: Source }> {
  const task = await prisma.task.findUnique({ where: { id: input.taskId } })
  if (!task) throw new NotFoundError('Task')
  await requireBoardRole(userId, task.boardId, BoardMemberRole.MEMBER)

  try {
    const raw = await chatJson({
      systemPrompt:
        'Ты — опытный технический менеджер. Декомпозируй задачу разработки на 3–8 атомарных шагов. ' +
        'Каждый шаг — короткое предложение (действие + результат). Отвечай по-русски. ' +
        'Верни СТРОГО валидный JSON в формате {"steps": ["шаг 1", "шаг 2", ...]}. ' +
        'Никакого текста вне JSON.',
      userPrompt: `Задача: "${task.title}"\n${task.description ?? ''}`,
      maxTokens: 800,
    })
    const parsed = decomposeOut.safeParse(raw)
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'decompose: invalid JSON shape, fallback')
      return {
        checklistItems: heuristicDecompose(task.title, task.description),
        source: 'heuristic',
      }
    }
    return { checklistItems: parsed.data.steps, source: 'ai' }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'decompose: LLM call failed, fallback to heuristic',
    )
    return {
      checklistItems: heuristicDecompose(task.title, task.description),
      source: 'heuristic',
    }
  }
}

// ── 2. Daily summary ───────────────────────────────────────────────

export async function dailySummary(
  userId: string,
  input: { boardId: string },
): Promise<{ summary: string; source: Source }> {
  await requireBoardRole(userId, input.boardId, BoardMemberRole.VIEWER)

  const board = await prisma.board.findUniqueOrThrow({ where: { id: input.boardId } })
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const upcomingHorizon = new Date(Date.now() + 48 * 60 * 60 * 1000)
  const stuckSince = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

  const [activity, upcoming, stuck, counts] = await Promise.all([
    prisma.activityLog.findMany({
      where: { boardId: input.boardId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: {
        boardId: input.boardId,
        dueDate: { lte: upcomingHorizon, gte: new Date() },
        status: { notIn: [TaskStatus.DONE, TaskStatus.ARCHIVED] },
      },
      take: 20,
      orderBy: { dueDate: 'asc' },
      include: { assignee: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: {
        boardId: input.boardId,
        updatedAt: { lt: stuckSince },
        status: { notIn: [TaskStatus.DONE, TaskStatus.ARCHIVED] },
      },
      take: 10,
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.task.groupBy({
      by: ['status'],
      where: { boardId: input.boardId },
      _count: { _all: true },
    }),
  ])

  const activityBrief = activity
    .slice(0, 20)
    .map((a) => `${a.action} by ${a.user.name}`)
    .join('\n')
  const upcomingBrief = upcoming
    .map((t) => `• ${t.title} (${t.assignee?.name ?? 'no assignee'}, due ${t.dueDate?.toISOString().slice(0, 10)})`)
    .join('\n')
  const stuckBrief = stuck.map((t) => `• ${t.title}`).join('\n')

  try {
    const raw = await chatJson({
      systemPrompt:
        'Ты — деловой ассистент, готовящий ежедневную выжимку по проекту. ' +
        'Сделай краткую сводку по-русски в формате: ' +
        '"✅ Завершено: ...\\n⚡ В процессе: ...\\n🚨 Риски: ...\\n📅 Скоро дедлайн: ...". ' +
        'Используй ТОЛЬКО эти четыре эмодзи. Не выдумывай факты — если в данных пусто, пиши "Нет данных". ' +
        'Верни СТРОГО JSON {"summary": "...строки сводки..."}. Без текста вне JSON.',
      userPrompt:
        `Доска: ${board.name}\n\n` +
        `Активность за сутки:\n${activityBrief || '(пусто)'}\n\n` +
        `Дедлайны в ближайшие 48 часов:\n${upcomingBrief || '(пусто)'}\n\n` +
        `Задачи, застрявшие >3 дней:\n${stuckBrief || '(пусто)'}\n\n` +
        `Распределение по статусам: ${counts.map((c) => `${c.status}=${c._count._all}`).join(', ')}`,
      maxTokens: 1024,
    })
    const parsed = dailySummaryOut.safeParse(raw)
    if (!parsed.success) {
      return {
        summary: heuristicDailySummary(board.name, counts, upcoming.length, stuck.length),
        source: 'heuristic',
      }
    }
    return { summary: parsed.data.summary, source: 'ai' }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'dailySummary: LLM call failed, fallback to heuristic',
    )
    return {
      summary: heuristicDailySummary(board.name, counts, upcoming.length, stuck.length),
      source: 'heuristic',
    }
  }
}

// ── 3. Analyze bug ─────────────────────────────────────────────────
// Note: Ollama with qwen2.5:1.5b is text-only. Image input is ignored here.

export async function analyzeBug(input: {
  description?: string | undefined
  imageBase64?: string | undefined
}): Promise<{
  title: string
  description: string
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  tags: string[]
  source: Source
}> {
  if (input.imageBase64 && !input.description) {
    // Without vision, we can't analyze image-only bugs — heuristic stub.
    return analyzeBugHeuristic('Скриншот бага (изображение не разобрано локальной моделью)')
  }

  try {
    const raw = await chatJson({
      systemPrompt:
        'Ты — технический менеджер. По описанию проблемы сформулируй карточку бага: ' +
        'title (≤80 символов, по-русски), description (что происходит, ожидаемое поведение, шаги воспроизведения если выводимы), ' +
        'priority (CRITICAL — прод-инцидент, HIGH — блокирует работу, MEDIUM — обычный баг, LOW — косметика), ' +
        'tags — массив из 1–5 ключевых тегов на русском. ' +
        'Верни СТРОГО JSON {"title": ..., "description": ..., "priority": ..., "tags": [...]}. Без текста вне JSON.',
      userPrompt: `Описание проблемы:\n${input.description ?? '(нет)'}`,
      maxTokens: 1024,
    })
    const parsed = analyzeBugOut.safeParse(raw)
    if (!parsed.success) {
      return analyzeBugHeuristic(input.description)
    }
    return { ...parsed.data, source: 'ai' }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'analyzeBug: LLM call failed, fallback to heuristic',
    )
    return analyzeBugHeuristic(input.description)
  }
}

// ── Heuristic fallbacks ───────────────────────────────────────────

function heuristicDecompose(title: string, description?: string | null): string[] {
  const t = `${title} ${description ?? ''}`.toLowerCase()
  if (/(api|endpoint|роут)/u.test(t)) {
    return [
      'Спроектировать API: схема входа и выхода',
      'Реализовать handler',
      'Добавить валидацию входных данных',
      'Покрыть юнит- и интеграционными тестами',
      'Обновить документацию (Swagger)',
    ]
  }
  if (/(дизайн|ui|вёрстка|frontend)/u.test(t)) {
    return [
      'Согласовать дизайн с командой',
      'Сделать каркас компонента',
      'Применить стили (Tailwind)',
      'Подключить состояние / API',
      'Проверить адаптив и a11y',
    ]
  }
  if (/(баг|ошибк|падает|не работает)/u.test(t)) {
    return [
      'Воспроизвести проблему',
      'Локализовать причину',
      'Написать тест, фиксирующий баг',
      'Реализовать исправление',
      'Проверить на проде / staging',
    ]
  }
  return [
    'Уточнить требования',
    'Разбить на подзадачи',
    'Реализовать ключевую часть',
    'Протестировать',
    'Сдать в код-ревью',
  ]
}

function heuristicDailySummary(
  boardName: string,
  counts: { status: string; _count: { _all: number } }[],
  upcomingCount: number,
  stuckCount: number,
): string {
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]))
  return (
    `📊 Дайджест: ${boardName}\n\n` +
    `✅ Завершено: ${byStatus.DONE ?? 0}\n` +
    `⚡ В процессе: ${byStatus.IN_PROGRESS ?? 0}\n` +
    `🚨 Риски: ${stuckCount} зависших задач (>3 дней без движения)\n` +
    `📅 Скоро дедлайн: ${upcomingCount}`
  )
}

function analyzeBugHeuristic(description?: string): {
  title: string
  description: string
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  tags: string[]
  source: 'heuristic'
} {
  const text = description ?? 'Баг'
  const enriched = heuristicEnrich({ title: text, description })
  const title = text.split(/[.!?\n]/)[0]!.slice(0, 80) || 'Сообщение о баге'
  return {
    title,
    description: description ?? 'Баг сообщён без описания (например, через скриншот).',
    priority: enriched.priority,
    tags: enriched.tags.length > 0 ? enriched.tags : ['баг'],
    source: 'heuristic',
  }
}
