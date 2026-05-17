import { Telegraf } from 'telegraf'
import { botSecretConfigured, env, isStubMode } from './config.js'
import { logger } from './logger.js'
import { handleStart } from './commands/start.js'
import { handleHelp } from './commands/help.js'
import { handleTasks } from './commands/tasks.js'
import { handleBoards } from './commands/boards.js'
import { handleSummary, handleSummaryCallback } from './commands/summary.js'
import {
  handleBugCancelCallback,
  handleBugCreateCallback,
  handlePhoto,
} from './handlers/photo.js'

async function main() {
  if (!botSecretConfigured) {
    logger.warn('BOT_SECRET is not set — API calls would fail. The bot will not start.')
    return
  }
  if (isStubMode) {
    logger.info(
      {
        commands: ['/start', '/tasks', '/summary', '/boards', '/help'],
        photoHandler: 'enabled (AI analyze-bug → preview → submit to queue)',
        apiUrl: env.API_URL,
      },
      'TELEGRAM_BOT_TOKEN is not set — running in STUB mode. ' +
        'Wire a real token and re-run to start the Telegraf polling loop.',
    )
    return
  }

  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN!)

  // Commands
  bot.start(handleStart)
  bot.command('help', handleHelp)
  bot.command('tasks', handleTasks)
  bot.command('boards', handleBoards)
  bot.command('summary', handleSummary)

  // Photo handler — bug from screenshot.
  bot.on('photo', handlePhoto)

  // Inline callback buttons (bug preview + summary picker).
  bot.action(/^bug:create:(.+)$/, (ctx) => handleBugCreateCallback(ctx, ctx.match[1]!))
  bot.action('bug:cancel', handleBugCancelCallback)
  bot.action(/^summary:(.+)$/, (ctx) => handleSummaryCallback(ctx, ctx.match[1]!))

  // Centralized error log — Telegraf swallows handler errors otherwise.
  bot.catch((err, ctx) => {
    logger.error({ err, updateType: ctx.updateType }, 'unhandled bot error')
  })

  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Привязать аккаунт' },
    { command: 'tasks', description: 'Мои задачи на сегодня' },
    { command: 'summary', description: 'AI-выжимка по доске' },
    { command: 'boards', description: 'Мои доски' },
    { command: 'help', description: 'Справка' },
  ])

  await bot.launch()
  logger.info({ apiUrl: env.API_URL }, 'Smart Kanban bot started (long-polling)')

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

main().catch((err) => {
  logger.fatal({ err }, 'Bot failed to start')
  process.exit(1)
})
