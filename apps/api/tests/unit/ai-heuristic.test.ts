import { describe, it, expect } from 'vitest'
import { heuristicEnrich } from '../../src/modules/queue/queue.worker.js'

/**
 * Tests the heuristic fallback used when `ANTHROPIC_API_KEY` is absent or
 * the API returns garbage. SPEC §14 calls these "AI Service parsers"; in
 * our codebase the fallback lives in queue.worker.heuristicEnrich.
 *
 * The classifier is keyword-based on a /u (Unicode) regex — important so
 * Cyrillic words match (JS `\b` is ASCII-only).
 */
describe('heuristicEnrich (AI fallback parser)', () => {
  it('escalates to CRITICAL for production / outage signals', () => {
    // "прод" triggers CRITICAL; "падает" both reinforces CRITICAL and tags it as a bug.
    const r = heuristicEnrich({
      title: 'Прод падает — пользователи не могут залогиниться',
      description: null,
    })
    expect(r.priority).toBe('CRITICAL')
    expect(r.tags).toContain('баг')
  })

  it('also returns CRITICAL for "срочно" markers', () => {
    // The current heuristic treats "срочн*" as CRITICAL (next to "критич",
    // "прод" etc.) — see queue.worker.ts. The test pins that behavior so a
    // future demotion to HIGH is intentional, not accidental.
    const r = heuristicEnrich({ title: 'СРОЧНО проверить отчёт', description: '' })
    expect(r.priority).toBe('CRITICAL')
  })

  it('returns HIGH for "важно"/"asap" cues', () => {
    const r = heuristicEnrich({
      title: 'Важно: добавить asap метрики',
      description: '',
    })
    expect(r.priority).toBe('HIGH')
  })

  it('defaults to MEDIUM when no urgency markers are present', () => {
    const r = heuristicEnrich({
      title: 'Подготовить макет лендинга',
      description: 'Обычная задача без специальных меток',
    })
    expect(r.priority).toBe('MEDIUM')
  })

  it('returns LOW for "потом" / "когда-нибудь"', () => {
    const r = heuristicEnrich({
      title: 'Почистить логи когда-нибудь',
      description: null,
    })
    expect(r.priority).toBe('LOW')
  })

  it('matches Cyrillic-only inputs (proves /u flag is active)', () => {
    const r = heuristicEnrich({
      title: 'критическая ошибка',
      description: undefined,
    })
    expect(r.priority).toBe('CRITICAL')
    expect(r.tags).toContain('баг')
  })

  it('returns the documented shape — priority + tags', () => {
    const r = heuristicEnrich({ title: 'whatever', description: null })
    expect(r).toEqual({ priority: 'MEDIUM', tags: [] })
  })

  it('infers `frontend` / `backend` / `design` tags from keywords', () => {
    expect(heuristicEnrich({ title: 'Покрасить react-кнопку', description: '' }).tags)
      .toContain('frontend')
    expect(heuristicEnrich({ title: 'Сломан api', description: '' }).tags)
      .toContain('backend')
    expect(heuristicEnrich({ title: 'обновить ui', description: '' }).tags)
      .toContain('design')
  })
})
