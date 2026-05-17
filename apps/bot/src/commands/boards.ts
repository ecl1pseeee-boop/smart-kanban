import type { Context } from 'telegraf'
import { ApiError, api } from '../api-client.js'
import { env } from '../config.js'
import { logger } from '../logger.js'
import { requireLinked } from './_shared.js'

export async function handleBoards(ctx: Context): Promise<void> {
  if (!ctx.from) return
  const telegramId = String(ctx.from.id)
  if (!(await requireLinked(ctx, telegramId))) return

  try {
    const { items } = await api.myBoards(telegramId)
    if (items.length === 0) {
      await ctx.reply('У вас пока нет досок. Создайте первую в веб-приложении.')
      return
    }
    const lines = items.map(
      (b) =>
        `• [${escape(b.name)}](${env.WEB_URL}/boards/${b.id}) — _${b.role.toLowerCase()}, ${b.taskCount} задач_`,
    )
    await ctx.reply(`*Ваши доски (${items.length})*\n\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    })
  } catch (err) {
    logger.error({ err }, 'handleBoards failed')
    if (err instanceof ApiError) {
      await ctx.reply(`Не удалось получить доски: ${err.message}`)
    } else {
      await ctx.reply('Что-то пошло не так. Попробуйте позже.')
    }
  }
}

function escape(s: string): string {
  return s.replace(/[_*`[\]()]/g, (m) => `\\${m}`)
}
