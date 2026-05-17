import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config/env.js'
import { logger } from '../../shared/logger.js'

/**
 * Anthropic client singleton. Resolves to `null` when `ANTHROPIC_API_KEY` is
 * absent — every AI endpoint then falls back to heuristic stubs so the
 * product stays usable end-to-end during dev / demo without an API key.
 */
export const anthropic: Anthropic | null = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null

export const aiAvailable: boolean = anthropic !== null

export const AI_MODEL = env.AI_MODEL

if (aiAvailable) {
  logger.info({ model: AI_MODEL }, 'AI client ready')
} else {
  logger.warn('ANTHROPIC_API_KEY not set — AI endpoints will use heuristic fallback')
}

/**
 * Accepts either a `data:image/png;base64,...` URL or raw base64. Returns a
 * normalized media-type from Anthropic's supported set (or null if unparsable).
 */
export function parseImagePayload(
  input: string,
): { mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } | null {
  const dataUrl = /^data:(image\/(jpeg|png|gif|webp));base64,(.+)$/i.exec(input)
  if (dataUrl) {
    return { mediaType: dataUrl[1]!.toLowerCase() as 'image/png', data: dataUrl[3]! }
  }
  const cleaned = input.replace(/\s/g, '')
  if (cleaned.length > 0 && /^[A-Za-z0-9+/=]+$/.test(cleaned)) {
    return { mediaType: 'image/jpeg', data: cleaned } // best-effort guess
  }
  return null
}
