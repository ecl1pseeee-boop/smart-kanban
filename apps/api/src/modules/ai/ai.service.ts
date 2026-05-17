import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { BoardMemberRole, TaskPriority, TaskStatus } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../shared/logger.js'
import { requireBoardRole } from '../../shared/access/board-access.js'
import { NotFoundError } from '../../shared/errors/app-error.js'
import { AI_MODEL, aiAvailable, anthropic, parseImagePayload } from './ai.client.js'
import {
  analyzeBugLlmSchema,
  dailySummaryLlmSchema,
  decomposeLlmSchema,
} from './ai.schemas.js'
import { heuristicEnrich } from '../queue/queue.worker.js'

type Source = 'ai' | 'heuristic'

// ── 1. Decompose task ──────────────────────────────────────────────

export async function decompose(
  userId: string,
  input: { taskId: string },
): Promise<{ checklistItems: string[]; source: Source }> {
  const task = await prisma.task.findUnique({ where: { id: input.taskId } })
  if (!task) throw new NotFoundError('Task')
  await requireBoardRole(userId, task.boardId, BoardMemberRole.MEMBER)

  if (!aiAvailable || !anthropic) {
    return { checklistItems: heuristicDecompose(task.title, task.description), source: 'heuristic' }
  }

  try {
    const r = await anthropic.messages.parse({
      model: AI_MODEL,
      max_tokens: 1024,
      system:
        'Ты — опытный технический менеджер. Декомпозируй задачу разработки на конкретные шаги. ' +
        'Каждый шаг — атомарная подзадача (действие + результат). Максимум 8 шагов. Отвечай по-русски.',
      messages: [
        {
          role: 'user',
          content: `Задача: "${task.title}"\n${task.description ?? ''}`,
        },
      ],
      output_config: { format: zodOutputFormat(decomposeLlmSchema) },
    })

    if (r.stop_reason === 'refusal' || !r.parsed_output) {
      logger.warn({ taskId: task.id, stop: r.stop_reason }, 'decompose: AI refused / no parsed_output')
      return {
        checklistItems: heuristicDecompose(task.title, task.description),
        source: 'heuristic',
      }
    }
    return { checklistItems: r.parsed_output.steps, source: 'ai' }
  } catch (err) {
    return handleAiError(err, () => ({
      checklistItems: heuristicDecompose(task.title, task.description),
      source: 'heuristic' as const,
    }))
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

  if (!aiAvailable || !anthropic) {
    return {
      summary: heuristicDailySummary(board.name, counts, upcoming.length, stuck.length),
      source: 'heuristic',
    }
  }

  const activityBrief = activity
    .slice(0, 20)
    .map((a) => `${a.action} by ${a.user.name}`)
    .join('\n')
  const upcomingBrief = upcoming
    .map((t) => `• ${t.title} (${t.assignee?.name ?? 'no assignee'}, due ${t.dueDate?.toISOString().slice(0, 10)})`)
    .join('\n')
  const stuckBrief = stuck.map((t) => `• ${t.title}`).join('\n')

  try {
    const r = await anthropic.messages.parse({
      model: AI_MODEL,
      max_tokens: 2000,
      system:
        'Ты — деловой ассистент, готовящий ежедневную выжимку по проекту. ' +
        'Структура (на русском): "✅ Завершено:\\n⚡ В процессе:\\n🚨 Риски:\\n📅 Скоро дедлайн:". ' +
        'Используй только эмодзи, перечисленные в структуре. Не выдумывай факты — если в данных пусто, скажи "Нет данных".',
      messages: [
        {
          role: 'user',
          content:
            `Доска: ${board.name}\n\n` +
            `Активность за сутки:\n${activityBrief || '(пусто)'}\n\n` +
            `Дедлайны в ближайшие 48 часов:\n${upcomingBrief || '(пусто)'}\n\n` +
            `Задачи, застрявшие >3 дней:\n${stuckBrief || '(пусто)'}\n\n` +
            `Распределение по статусам: ${counts
              .map((c) => `${c.status}=${c._count._all}`)
              .join(', ')}`,
        },
      ],
      output_config: { format: zodOutputFormat(dailySummaryLlmSchema) },
    })

    if (r.stop_reason === 'refusal' || !r.parsed_output) {
      return {
        summary: heuristicDailySummary(board.name, counts, upcoming.length, stuck.length),
        source: 'heuristic',
      }
    }
    return { summary: r.parsed_output.summary, source: 'ai' }
  } catch (err) {
    return handleAiError(err, () => ({
      summary: heuristicDailySummary(board.name, counts, upcoming.length, stuck.length),
      source: 'heuristic' as const,
    }))
  }
}

// ── 3. Analyze bug ─────────────────────────────────────────────────

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
  const image = input.imageBase64 ? parseImagePayload(input.imageBase64) : null
  if (input.imageBase64 && !image) {
    // Invalid image format — fall through to text-only with the description we have
    logger.warn('analyze-bug: imageBase64 unparseable, ignoring image')
  }

  if (!aiAvailable || !anthropic) {
    return analyzeBugHeuristic(input.description)
  }

  // Build user content: image (if any) + text
  const userContent: Anthropic.ContentBlockParam[] = []
  if (image) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
    })
  }
  const textPart = input.description
    ? `Описание проблемы: ${input.description}`
    : 'На скриншоте — баг, который нужно описать. Сформулируй карточку задачи.'
  userContent.push({ type: 'text', text: textPart })

  try {
    const r = await anthropic.messages.parse({
      model: AI_MODEL,
      max_tokens: 1024,
      system:
        'Ты — технический менеджер. По описанию проблемы (текст и/или скриншот) сформулируй карточку бага: ' +
        'короткий заголовок (≤80 символов), описание (что происходит, ожидаемое поведение, шаги воспроизведения если можно вывести), ' +
        'priority (CRITICAL для проблем продакшена, HIGH для блокирующих рабочий поток, MEDIUM по умолчанию, LOW для косметики), ' +
        'и набор тегов (на русском, по теме). Отвечай по-русски.',
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: zodOutputFormat(analyzeBugLlmSchema) },
    })

    if (r.stop_reason === 'refusal' || !r.parsed_output) {
      return analyzeBugHeuristic(input.description)
    }
    const p = r.parsed_output
    return {
      title: p.title,
      description: p.description,
      priority: p.priority,
      tags: p.tags,
      source: 'ai',
    }
  } catch (err) {
    return handleAiError(err, () => analyzeBugHeuristic(input.description))
  }
}

// ── Error funnel ──────────────────────────────────────────────────

function handleAiError<T>(err: unknown, fallback: () => T): T {
  if (err instanceof Anthropic.APIError) {
    logger.warn({ status: err.status, message: err.message }, 'AI call failed, falling back')
    return fallback()
  }
  // Unknown shape — re-throw, the global error handler will return 500.
  throw err
}

// ── Heuristic fallbacks ───────────────────────────────────────────

function heuristicDecompose(title: string, description?: string | null): string[] {
  const t = `${title} ${description ?? ''}`.toLowerCase()
  // Tailor by keyword
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
