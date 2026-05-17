import type { Context } from 'telegraf'
import { ApiError, api } from '../api-client.js'
import { logger } from '../logger.js'

/**
 * Resolves the calling Telegram user to a linked Smart Kanban account.
 * If not linked, replies with the /start hint and returns false so the
 * caller can short-circuit.
 */
export async function requireLinked(
  ctx: Context,
  telegramId: string,
): Promise<boolean> {
  try {
    await api.me(telegramId)
    return true
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      await ctx.reply(
        '🔗 Аккаунт не привязан.\n\nОткройте Smart Kanban → Настройки → Telegram и пришлите сюда `/start <код>`.',
        { parse_mode: 'Markdown' },
      )
      return false
    }
    logger.error({ err }, 'requireLinked failed')
    await ctx.reply('Не удалось проверить привязку. Попробуйте позже.')
    return false
  }
}
