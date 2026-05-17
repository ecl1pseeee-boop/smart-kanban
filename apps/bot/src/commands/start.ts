import type { Context } from 'telegraf'
import { ApiError, api } from '../api-client.js'
import { logger } from '../logger.js'

const HELP = [
  'Привет 👋',
  '',
  'Чтобы привязать аккаунт Smart Kanban, получите код в веб-приложении',
  '(Настройки → Telegram), затем отправьте сюда:',
  '`/start ВАШ_КОД`',
  '',
  'Команды:',
  '/tasks — мои задачи на сегодня',
  '/summary — AI-выжимка дня по доске',
  '/boards — мои доски',
  '/help — справка',
].join('\n')

export async function handleStart(ctx: Context): Promise<void> {
  const text = 'message' in ctx.update && ctx.update.message && 'text' in ctx.update.message
    ? ctx.update.message.text
    : ''
  const arg = text.replace(/^\/start(@\w+)?\s*/i, '').trim()

  if (!arg) {
    await ctx.reply(HELP, { parse_mode: 'Markdown' })
    return
  }

  if (!ctx.from) {
    await ctx.reply('Не удалось определить ваш Telegram ID. Попробуйте ещё раз.')
    return
  }

  try {
    const { user } = await api.confirmLink({
      code: arg.toUpperCase(),
      telegramId: String(ctx.from.id),
      ...(ctx.chat?.id !== undefined && { telegramChatId: String(ctx.chat.id) }),
      ...(ctx.from.username && { telegramName: ctx.from.username }),
    })
    await ctx.reply(
      `✅ Аккаунт привязан!\n\nДобро пожаловать, *${escapeMd(user.name)}* (${escapeMd(user.email)}).\nТеперь доступны команды /tasks, /summary, /boards.`,
      { parse_mode: 'Markdown' },
    )
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      await ctx.reply('❌ Код не найден или истёк. Сгенерируйте новый в веб-приложении.')
      return
    }
    if (err instanceof ApiError && err.status === 409) {
      await ctx.reply('⚠️ Этот Telegram уже привязан к другому аккаунту.')
      return
    }
    logger.error({ err }, 'handleStart failed')
    await ctx.reply('Что-то пошло не так. Попробуйте позже.')
  }
}

function escapeMd(s: string): string {
  return s.replace(/[_*`[\]()]/g, (m) => `\\${m}`)
}
