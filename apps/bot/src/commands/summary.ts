import type { Context } from 'telegraf'
import { Markup } from 'telegraf'
import { ApiError, api } from '../api-client.js'
import { logger } from '../logger.js'
import { clearSummary, getState } from '../session.js'
import { requireLinked } from './_shared.js'

export async function handleSummary(ctx: Context): Promise<void> {
  if (!ctx.from || !ctx.chat) return
  const telegramId = String(ctx.from.id)
  if (!(await requireLinked(ctx, telegramId))) return

  try {
    const { items } = await api.myBoards(telegramId)
    if (items.length === 0) {
      await ctx.reply('У вас пока нет досок. Создайте первую в веб-приложении.')
      return
    }
    if (items.length === 1) {
      await deliverSummary(ctx, telegramId, items[0]!.id, items[0]!.name)
      return
    }

    // >1 board → ask which one.
    const state = getState(ctx.chat.id)
    state.pendingSummary = { boards: items }
    const buttons = items.map((b) =>
      Markup.button.callback(b.name, `summary:${b.id}`),
    )
    await ctx.reply(
      'Выберите доску для AI-выжимки:',
      Markup.inlineKeyboard(buttons, { columns: 1 }),
    )
  } catch (err) {
    logger.error({ err }, 'handleSummary failed')
    if (err instanceof ApiError) {
      await ctx.reply(`Не удалось: ${err.message}`)
    } else {
      await ctx.reply('Что-то пошло не так. Попробуйте позже.')
    }
  }
}

export async function handleSummaryCallback(ctx: Context, boardId: string) {
  if (!ctx.from || !ctx.chat) return
  const telegramId = String(ctx.from.id)
  const state = getState(ctx.chat.id)
  const pick = state.pendingSummary?.boards.find((b) => b.id === boardId)
  clearSummary(ctx.chat.id)
  await ctx.answerCbQuery()
  await deliverSummary(ctx, telegramId, boardId, pick?.name ?? 'доска')
}

async function deliverSummary(
  ctx: Context,
  telegramId: string,
  boardId: string,
  boardName: string,
) {
  await ctx.reply(`⏳ Готовлю выжимку для «${boardName}»…`)
  try {
    const { summary, source } = await api.dailySummary(telegramId, boardId)
    const tag = source === 'ai' ? '🤖 AI' : '📊 авто'
    await ctx.reply(`${tag}\n\n${summary}`)
  } catch (err) {
    logger.error({ err, boardId }, 'deliverSummary failed')
    if (err instanceof ApiError) {
      await ctx.reply(`Не удалось получить выжимку: ${err.message}`)
    } else {
      await ctx.reply('Что-то пошло не так. Попробуйте позже.')
    }
  }
}
