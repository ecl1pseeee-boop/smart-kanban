import 'dotenv/config'
import { z } from 'zod'

// "Optional secret" — treat both "missing" and "" as undefined. .env files
// often carry placeholder lines like `TELEGRAM_BOT_TOKEN=` which we want to
// behave like an unset variable, not fail validation.
const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined))

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /** API base URL the bot calls. */
  API_URL: z.string().url().default('http://localhost:3001'),
  /** Shared secret sent as `X-Bot-Secret` to /api/telegram/* routes. */
  BOT_SECRET: optionalSecret,
  /**
   * Telegram bot token. Absent → "stub mode": we don't start a Telegraf
   * instance, we just log that the bot would have started and exit 0.
   * Useful for CI and for the hackathon dev workflow.
   */
  TELEGRAM_BOT_TOKEN: optionalSecret,
  /** Public web UI URL — used to build deep links sent to chats. */
  WEB_URL: z.string().url().default('http://localhost:3000'),
})

function loadEnv() {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    console.error(`❌ Invalid environment configuration:\n${issues}`)
    process.exit(1)
  }
  return parsed.data
}

export const env = loadEnv()

export const isStubMode = !env.TELEGRAM_BOT_TOKEN
export const botSecretConfigured = Boolean(env.BOT_SECRET)
