import type { Context } from 'telegraf'
import { Markup } from 'telegraf'
import { request } from 'undici'
import { ApiError, api } from '../api-client.js'
import { env } from '../config.js'
import { logger } from '../logger.js'
import { clearBug, getState } from '../session.js'
import { requireLinked } from '../commands/_shared.js'

const PRIORITY_EMOJI = { CRITICAL: '🚨', HIGH: '🔴', MEDIUM: '🟡', LOW: '⚪' } as const

export async function handlePhoto(ctx: Context): Promise<void> {
  if (!ctx.from || !ctx.chat) return
  const telegramId = String(ctx.from.id)
  if (!(await requireLinked(ctx, telegramId))) return

  // Telegram delivers an array of size variants; pick the largest.
  if (!('message' in ctx.update) || !ctx.update.message || !('photo' in ctx.update.message)) {
    return
  }
  const photos = ctx.update.message.photo
  if (!photos || photos.length === 0) return
  const best = photos[photos.length - 1]!
  const caption =
    'caption' in ctx.update.message ? ctx.update.message.caption ?? '' : ''

  await ctx.reply('🔍 Анализирую скриншот…')

  let base64: string
  try {
    base64 = await downloadAsBase64(ctx, best.file_id)
  } catch (err) {
    logger.error({ err, fileId: best.file_id }, 'photo download failed')
    await ctx.reply('Не удалось скачать фото из Telegram. Попробуйте ещё раз.')
    return
  }

  let draft
  try {
    draft = await api.analyzeBug(telegramId, {
      ...(caption && { description: caption }),
      imageBase64: base64,
    })
  } catch (err) {
    logger.error({ err }, 'analyzeBug failed')
    if (err instanceof ApiError) {
      await ctx.reply(`AI отказал: ${err.message}`)
    } else {
      await ctx.reply('Что-то пошло не так. Попробуйте позже.')
    }
    return
  }

  // Resolve user boards so the buttons can target them.
  let boards
  try {
    boards = (await api.myBoards(telegramId)).items
  } catch (err) {
    logger.error({ err }, 'myBoards (post-analyze) failed')
    await ctx.reply('Не удалось получить ваши доски — карточку не создаём.')
    return
  }
  if (boards.length === 0) {
    await ctx.reply('У вас нет досок — создайте доску в веб-приложении, потом пришлите фото снова.')
    return
  }

  const state = getState(ctx.chat.id)
  state.pendingBug = { draft, boards }

  const tag = draft.source === 'ai' ? '🤖 AI' : '📊 авто'
  const text = [
    `${tag}  ${PRIORITY_EMOJI[draft.priority]} *${escape(draft.priority)}*`,
    '',
    `*${escape(draft.title)}*`,
    '',
    escape(draft.description),
    '',
    draft.tags.length > 0 ? `_теги:_ ${draft.tags.map(escape).join(', ')}` : '',
    '',
    'Куда создаём карточку?',
  ]
    .filter(Boolean)
    .join('\n')

  const buttons = boards.map((b) =>
    Markup.button.callback(`📋 ${truncate(b.name, 30)}`, `bug:create:${b.id}`),
  )
  buttons.push(Markup.button.callback('❌ Отмена', 'bug:cancel'))

  const sent = await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons, { columns: 1 }),
  })
  if ('message_id' in sent) state.pendingBug.previewMessageId = sent.message_id
}

export async function handleBugCreateCallback(ctx: Context, boardId: string) {
  if (!ctx.from || !ctx.chat) return
  const telegramId = String(ctx.from.id)
  const state = getState(ctx.chat.id)
  const pending = state.pendingBug
  if (!pending) {
    await ctx.answerCbQuery('Превью устарело — пришлите фото ещё раз.')
    return
  }
  await ctx.answerCbQuery('Создаём…')
  try {
    const submit = await api.submitTask(telegramId, {
      boardId,
      title: pending.draft.title,
      description: pending.draft.description,
      metadata: {
        source: 'telegram-photo',
        priority: pending.draft.priority,
        tags: pending.draft.tags,
        aiSource: pending.draft.source,
      },
    })
    clearBug(ctx.chat.id)
    if (submit.status === 'DUPLICATE') {
      await ctx.reply('⚠️ Такая задача уже создавалась за последний час.')
      return
    }
    await ctx.reply(
      `✅ Карточка отправлена в очередь.\nID: \`${submit.id}\`\nСтатус: ${submit.status}`,
      { parse_mode: 'Markdown' },
    )
  } catch (err) {
    logger.error({ err, boardId }, 'submitTask failed')
    if (err instanceof ApiError && err.status === 409) {
      await ctx.reply('⚠️ Такая задача уже создавалась за последний час.')
      clearBug(ctx.chat.id)
      return
    }
    if (err instanceof ApiError) {
      await ctx.reply(`Не удалось создать: ${err.message}`)
    } else {
      await ctx.reply('Что-то пошло не так. Попробуйте позже.')
    }
  }
}

export async function handleBugCancelCallback(ctx: Context) {
  if (!ctx.chat) return
  clearBug(ctx.chat.id)
  await ctx.answerCbQuery('Отменено')
  await ctx.reply('❌ Создание отменено.')
}

// ── helpers ───────────────────────────────────────────────────────

async function downloadAsBase64(ctx: Context, fileId: string): Promise<string> {
  const link = await ctx.telegram.getFileLink(fileId)
  const res = await request(link.toString())
  if (res.statusCode >= 400) {
    throw new Error(`Telegram getFile returned ${res.statusCode}`)
  }
  const chunks: Buffer[] = []
  for await (const chunk of res.body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('base64')
}

function escape(s: string): string {
  return s.replace(/[_*`[\]()]/g, (m) => `\\${m}`)
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Lint silencer for the unused env import (kept for future direct uploads). */
void env
