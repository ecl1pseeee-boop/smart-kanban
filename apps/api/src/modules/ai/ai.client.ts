import { env } from '../../config/env.js'
import { logger } from '../../shared/logger.js'

/**
 * Unified "LLM that returns JSON" interface. Implemented by Ollama (preferred,
 * no key needed) with a heuristic-friendly fallback at the call site.
 *
 * `chatJson` returns the model's parsed JSON object as `unknown` — the caller
 * validates it with a zod schema. If the model emits non-JSON, we throw and
 * the caller falls back to its heuristic.
 */

let ollamaAvailable: boolean | null = null

/**
 * Probe Ollama once on first use, cache the result. Not blocking on boot to
 * keep dev startup fast.
 */
async function probeOllama(): Promise<boolean> {
  if (ollamaAvailable !== null) return ollamaAvailable
  try {
    const res = await fetch(`${env.OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    })
    ollamaAvailable = res.ok
    if (res.ok) {
      logger.info({ url: env.OLLAMA_URL, model: env.OLLAMA_MODEL }, 'Ollama ready')
    } else {
      logger.warn({ status: res.status }, 'Ollama returned non-OK on /api/tags')
    }
  } catch (err) {
    ollamaAvailable = false
    logger.warn(
      { url: env.OLLAMA_URL, err: err instanceof Error ? err.message : err },
      'Ollama not reachable — AI endpoints will use heuristic fallback',
    )
  }
  return ollamaAvailable
}

export async function aiReady(): Promise<boolean> {
  return probeOllama()
}

export const AI_MODEL = env.OLLAMA_MODEL

interface ChatJsonOpts {
  systemPrompt: string
  userPrompt: string
  /** Approx output budget. Ollama maps this to num_predict. */
  maxTokens?: number
  /** 0..1, default 0.2 for structured output. */
  temperature?: number
}

/**
 * Send a system+user prompt to Ollama with `format: "json"` and return the
 * parsed JSON object. Caller is responsible for shape validation.
 *
 * Throws if Ollama is unreachable, errors out, or returns invalid JSON.
 */
export async function chatJson(opts: ChatJsonOpts): Promise<unknown> {
  if (!(await probeOllama())) {
    throw new Error('Ollama is not reachable')
  }

  const body = {
    model: env.OLLAMA_MODEL,
    stream: false as const,
    format: 'json' as const,
    options: {
      temperature: opts.temperature ?? 0.2,
      num_ctx: 4096,
      num_predict: opts.maxTokens ?? 1024,
    },
    messages: [
      { role: 'system' as const, content: opts.systemPrompt },
      { role: 'user' as const, content: opts.userPrompt },
    ],
  }

  const res = await fetch(`${env.OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(env.OLLAMA_TIMEOUT_MS),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ollama /api/chat ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as { message?: { content?: string } }
  const content = json.message?.content?.trim()
  if (!content) throw new Error('Ollama returned empty content')

  try {
    return JSON.parse(content)
  } catch {
    // Some models occasionally wrap JSON in prose. Salvage the first {...}
    // or [...] balanced block.
    const salvaged = salvageJson(content)
    if (salvaged !== null) return salvaged
    throw new Error(`Ollama returned non-JSON: ${content.slice(0, 200)}`)
  }
}

function salvageJson(text: string): unknown | null {
  for (const open of ['{', '[']) {
    const start = text.indexOf(open)
    if (start === -1) continue
    let depth = 0
    let inStr = false
    let escaped = false
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i]!
      if (inStr) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') {
        inStr = true
        continue
      }
      if (ch === open || (open === '{' && ch === '{') || (open === '[' && ch === '[')) depth += 1
      const close = open === '{' ? '}' : ']'
      if (ch === close) {
        depth -= 1
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1))
          } catch {
            break
          }
        }
      }
    }
  }
  return null
}
