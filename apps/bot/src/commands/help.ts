import type { Context } from 'telegraf'

const HELP = [
  '*Smart Kanban Bot*',
  '',
  '/start <код> — привязать аккаунт',
  '/tasks — мои задачи на сегодня',
  '/summary — AI-выжимка по доске',
  '/boards — мои доски',
  '/help — эта справка',
  '',
  '📸 Пришлите *фото* — я сделаю карточку бага через AI.',
].join('\n')

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(HELP, { parse_mode: 'Markdown' })
}
