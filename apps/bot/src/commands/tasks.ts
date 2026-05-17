import type { Context } from 'telegraf'
import { ApiError, api, type TodayTask } from '../api-client.js'
import { env } from '../config.js'
import { logger } from '../logger.js'
import { requireLinked } from './_shared.js'

const PRIORITY_EMOJI: Record<TodayTask['priority'], string> = {
  CRITICAL: '🚨',
  HIGH: '🔴',
  MEDIUM: '🟡',
  LOW: '⚪',
}

export async function handleTasks(ctx: Context): Promise<void> {
  if (!ctx.from) return
  const telegramId = String(ctx.from.id)
  if (!(await requireLinked(ctx, telegramId))) return

  try {
    const { items } = await api.myTasks(telegramId)
    if (items.length === 0) {
      await ctx.reply('🎉 На сегодня задач нет. Хорошего дня!')
      return
    }
    const overdue = items.filter((t) => t.isOverdue)
    const today = items.filter((t) => !t.isOverdue)

    const lines: string[] = []
    if (overdue.length > 0) {
      lines.push('*🚨 Просрочено*')
      overdue.forEach((t) => lines.push(formatTask(t)))
      lines.push('')
    }
    if (today.length > 0) {
      lines.push('*📌 На сегодня*')
      today.forEach((t) => lines.push(formatTask(t)))
    }
    await ctx.reply(lines.join('\n'), {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    })
  } catch (err) {
    logger.error({ err }, 'handleTasks failed')
    if (err instanceof ApiError) {
      await ctx.reply(`Не удалось получить задачи: ${err.message}`)
    } else {
      await ctx.reply('Что-то пошло не так. Попробуйте позже.')
    }
  }
}

function formatTask(t: TodayTask): string {
  const emoji = PRIORITY_EMOJI[t.priority]
  const due = t.dueDate
    ? ` — до ${new Date(t.dueDate).toISOString().slice(0, 10)}`
    : ''
  const link = `${env.WEB_URL}/boards/${t.boardId}?task=${t.id}`
  return `${emoji} [${escape(t.title)}](${link})\n   _${escape(t.boardName)} · ${escape(t.columnName)}${due}_`
}

function escape(s: string): string {
  return s.replace(/[_*`[\]()]/g, (m) => `\\${m}`)
}
