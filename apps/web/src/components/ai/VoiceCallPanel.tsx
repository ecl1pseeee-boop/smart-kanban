import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Mic, Square, Sparkles, X } from 'lucide-react'
import { API_URL } from '@/lib/env'
import { useAuthStore } from '@/stores/authStore'
import type { BoardListItem } from '@/lib/types'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'

type Stage = 'idle' | 'requesting' | 'recording' | 'pick-board' | 'loading' | 'done'

interface Props {
  boards: BoardListItem[]
}

interface ProcessVoiceResponse {
  createdTasks: number
  transcript: string
  source: 'ai' | 'heuristic'
}

// ── Minimal Web Speech API typings (it's not in lib.dom.d.ts) ──────

interface SpeechRecognitionResult {
  readonly length: number
  readonly isFinal: boolean
  item(index: number): { transcript: string; confidence: number }
  [index: number]: { transcript: string; confidence: number }
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message?: string
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Browser STT → local LLM (Ollama) flow:
 *   idle → click → recording (SpeechRecognition live transcript)
 *   recording → click → pick-board modal
 *   pick-board → submit → loading (Ollama on the API server)
 *   loading → success → toast + auto-reset
 *
 * Works without API keys: STT runs in the browser, task extraction runs
 * locally on the server via Ollama.
 */
export function VoiceCallPanel({ boards }: Props) {
  const qc = useQueryClient()
  const [stage, setStage] = useState<Stage>('idle')
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [interim, setInterim] = useState('')

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const finalTranscriptRef = useRef('')
  const interimRef = useRef('')
  const sessionActiveRef = useRef(false)
  const recogCtorRef = useRef<SpeechRecognitionCtor | null>(null)

  useEffect(() => {
    return () => {
      sessionActiveRef.current = false
      try {
        recognitionRef.current?.abort()
      } catch {
        /* noop */
      }
    }
  }, [])

  const dim = stage === 'recording' || stage === 'loading' || stage === 'pick-board'

  function spawnRecognition(): void {
    const Ctor = recogCtorRef.current
    if (!Ctor || !sessionActiveRef.current) return

    const recog = new Ctor()
    recog.lang = 'ru-RU'
    recog.continuous = true
    recog.interimResults = true
    recog.maxAlternatives = 1

    recog.onresult = (e) => {
      let interimAcc = ''
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i]!
        const text = r[0]!.transcript
        if (r.isFinal) {
          finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + text.trim()
        } else {
          interimAcc += text
        }
      }
      interimRef.current = interimAcc.trim()
      setLiveTranscript(finalTranscriptRef.current)
      setInterim(interimRef.current)
    }

    recog.onerror = (e) => {
      const code = e.error
      // Soft errors during a session — just let onend respawn us.
      if (code === 'no-speech' || code === 'aborted') return
      // Real errors — stop the session.
      sessionActiveRef.current = false
      const map: Record<string, string> = {
        'not-allowed':
          'Доступ к микрофону отклонён. Разреши его в адресной строке и нажми ещё раз.',
        'service-not-allowed':
          'Сервис распознавания заблокирован (вероятно, iframe без allow="microphone").',
        'audio-capture': 'Не найден микрофон на устройстве.',
        network: 'Ошибка сети распознавания. Проверь интернет и повтори.',
      }
      setError(map[code] ?? `Ошибка распознавания: ${code}`)
      setStage('idle')
    }

    recog.onend = () => {
      if (sessionActiveRef.current) {
        // Browser auto-ended (silence / 60s limit). Respawn a fresh instance
        // after a short delay — restarting the SAME instance throws
        // InvalidStateError in Chrome.
        window.setTimeout(() => spawnRecognition(), 250)
        return
      }
      // User pressed stop → finalize.
      finalize()
    }

    try {
      recog.start()
      recognitionRef.current = recog
    } catch (err) {
      // Most common: tried to start while another instance is still alive.
      // Treat as a soft error and try again on next tick.
      if (sessionActiveRef.current) {
        window.setTimeout(() => spawnRecognition(), 300)
        return
      }
      setError(err instanceof Error ? err.message : 'Не удалось запустить распознавание')
      setStage('idle')
    }
  }

  function startRecording() {
    setError(null)

    if (!window.isSecureContext) {
      setError(
        'Браузер блокирует распознавание вне HTTPS. Открой страницу через HTTPS (Codespaces forwarded URL) или localhost.',
      )
      return
    }
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setError('Браузер не поддерживает Web Speech API. Используй Chrome или Edge.')
      return
    }
    recogCtorRef.current = Ctor
    finalTranscriptRef.current = ''
    interimRef.current = ''
    setLiveTranscript('')
    setInterim('')
    sessionActiveRef.current = true
    setStage('recording')
    spawnRecognition()
  }

  function finalize() {
    const transcript = (finalTranscriptRef.current + ' ' + interimRef.current).trim()
    setLiveTranscript(transcript)
    setInterim('')
    if (!transcript) {
      setError(
        'Запись остановлена без распознанной речи. Проверь, что микрофон работает (значок в адресной строке), и попробуй ещё раз.',
      )
      setStage('idle')
      return
    }
    setStage('pick-board')
    if (boards.length === 1) setSelectedBoardId(boards[0]!.id)
  }

  function stopRecording() {
    sessionActiveRef.current = false
    try {
      recognitionRef.current?.stop()
    } catch {
      /* noop */
    }
  }

  async function submitForProcessing() {
    const transcript = liveTranscript.trim()
    if (!transcript || !selectedBoardId) return
    setStage('loading')
    setError(null)
    try {
      const token = useAuthStore.getState().accessToken
      const res = await fetch(`${API_URL}/api/ai/process-voice`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : null),
        },
        body: JSON.stringify({ transcript, boardId: selectedBoardId }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Сервер вернул ${res.status}: ${text.slice(0, 200) || 'неизвестная ошибка'}`)
      }
      const json = (await res.json()) as ProcessVoiceResponse
      setResultMsg(
        `✨ Успешно! ИИ создал ${plural(json.createdTasks, 'задачу', 'задачи', 'задач')}` +
          (json.source === 'heuristic' ? ' (эвристикой)' : '') +
          '.',
      )
      setStage('done')
      qc.invalidateQueries({ queryKey: ['boards'] })
      qc.invalidateQueries({ queryKey: ['board', selectedBoardId] })
      setTimeout(() => {
        setStage('idle')
        setResultMsg(null)
        finalTranscriptRef.current = ''
        setLiveTranscript('')
      }, 4500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать запись')
      setStage('pick-board')
    }
  }

  function cancelFlow() {
    sessionActiveRef.current = false
    try {
      recognitionRef.current?.abort()
    } catch {
      /* noop */
    }
    finalTranscriptRef.current = ''
    interimRef.current = ''
    setLiveTranscript('')
    setInterim('')
    setStage('idle')
    setError(null)
  }

  const isRecording = stage === 'recording'
  const isRequesting = stage === 'requesting'

  return (
    <>
      {dim && createPortal(<div className="pb-voice-dim-overlay" aria-hidden />, document.body)}

      {(isRecording || isRequesting) &&
        createPortal(
          <RecordingHUD
            onStop={stopRecording}
            transcript={liveTranscript}
            interim={interim}
            requesting={isRequesting}
          />,
          document.body,
        )}

      <Button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isRequesting}
        size="lg"
        className={`pb-ai-cta ${isRecording ? 'pb-recording' : ''}`}
        style={{
          width: '100%',
          height: 56,
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '0.01em',
          ...(isRecording
            ? {
                background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
                border: '1px solid rgba(255,255,255,0.2)',
              }
            : null),
        }}
      >
        {isRecording ? <Square size={18} fill="#fff" /> : <Mic size={18} />}
        {isRecording
          ? 'Остановить запись'
          : isRequesting
            ? 'Запрашиваем доступ…'
            : '[ Начать созвон ]'}
      </Button>

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: '#fca5a5',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {stage === 'pick-board' &&
        createPortal(
          <ModalShell onClose={cancelFlow}>
            <div
              className="pb-font-display"
              style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#fff' }}
            >
              ✨ Куда отправить задачи?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
              Локальная нейронка проанализирует транскрипт и автоматически создаст карточки
              для участников выбранной доски.
            </div>

            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                marginBottom: 18,
                maxHeight: 140,
                overflowY: 'auto',
                fontSize: 12.5,
                lineHeight: 1.55,
                color: 'rgba(255,255,255,0.78)',
                whiteSpace: 'pre-wrap',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-subtle)',
                  marginBottom: 6,
                }}
              >
                Транскрипт
              </div>
              {liveTranscript || '(пусто)'}
            </div>

            <label
              style={{
                fontSize: 12,
                color: 'var(--text-label)',
                fontWeight: 500,
                marginBottom: 6,
                display: 'block',
              }}
            >
              Доска
            </label>
            <select
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              className="pb-input"
              style={{ width: '100%', marginBottom: 18 }}
            >
              <option value="" disabled>
                Выберите доску…
              </option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.memberCount} участников
                </option>
              ))}
            </select>

            {error && (
              <div
                style={{
                  marginBottom: 14,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#fca5a5',
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="ghost" onClick={cancelFlow}>
                Отмена
              </Button>
              <Button
                variant="primary"
                size="lg"
                disabled={!selectedBoardId}
                onClick={submitForProcessing}
                className="pb-ai-cta"
                style={{ flex: 1, height: 48 }}
              >
                <Sparkles size={16} />
                [ Сгенерировать задачи через ИИ ]
              </Button>
            </div>
          </ModalShell>,
          document.body,
        )}

      {stage === 'loading' &&
        createPortal(
          <FullscreenLoader
            title="ИИ анализирует созвон"
            subtitle="и распределяет задачи по команде…"
          />,
          document.body,
        )}

      {stage === 'done' &&
        resultMsg &&
        createPortal(<div className="pb-toast">{resultMsg}</div>, document.body)}
    </>
  )
}

function RecordingHUD({
  onStop,
  transcript,
  interim,
  requesting,
}: {
  onStop: () => void
  transcript: string
  interim: string
  requesting: boolean
}) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (requesting) return
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [requesting])
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  const transcriptRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [transcript, interim])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        pointerEvents: 'none',
        animation: 'pb-fade-in 0.3s ease both',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          width: '100%',
          maxWidth: 520,
          padding: '30px 30px 26px',
          background: 'rgba(20, 22, 28, 0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: 'var(--radius-2xl)',
          boxShadow: '0 20px 60px rgba(239, 68, 68, 0.25), 0 0 0 1px rgba(239,68,68,0.15)',
          color: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 18,
          }}
        >
          <div
            className="pb-recording"
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Mic size={26} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="pb-font-display"
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                marginBottom: 4,
              }}
            >
              {requesting ? 'Готовимся к записи…' : 'Идёт распознавание речи'}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 16,
                fontWeight: 500,
                color: '#fca5a5',
                letterSpacing: '0.04em',
              }}
            >
              {requesting ? '—' : `${mm}:${ss}`}
            </div>
          </div>
        </div>

        <div
          ref={transcriptRef}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 16px',
            minHeight: 90,
            maxHeight: 220,
            overflowY: 'auto',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.85)',
            marginBottom: 18,
            whiteSpace: 'pre-wrap',
          }}
        >
          {!transcript && !interim && (
            <span style={{ color: 'var(--text-subtle)', fontStyle: 'italic' }}>
              Говори в микрофон — текст будет появляться здесь в реальном времени…
            </span>
          )}
          {transcript}
          {interim && (
            <span style={{ color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>
              {transcript ? ' ' : ''}
              {interim}
            </span>
          )}
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={onStop}
          disabled={requesting}
          style={{
            width: '100%',
            height: 50,
            background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
            border: '1px solid rgba(255,255,255,0.2)',
            boxShadow: '0 8px 28px rgba(239, 68, 68, 0.4)',
          }}
        >
          <Square size={16} fill="#fff" />
          Остановить и отправить ИИ
        </Button>
        <div
          style={{
            marginTop: 12,
            fontSize: 11.5,
            color: 'rgba(255,255,255,0.45)',
            lineHeight: 1.5,
            textAlign: 'center',
          }}
        >
          Распознавание идёт в браузере (Web Speech API). Текст уйдёт на локальную нейронку
          для разбора на задачи.
        </div>
      </div>
    </div>
  )
}

function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: 24,
        animation: 'pb-fade-in 0.25s ease both',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <GlassCard glow style={{ width: '100%', maxWidth: 520, padding: '32px 32px' }}>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={14} />
        </button>
        {children}
      </GlassCard>
    </div>
  )
}

function FullscreenLoader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(8, 9, 12, 0.7)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: 24,
        animation: 'pb-fade-in 0.3s ease both',
      }}
    >
      <div style={{ width: '100%', maxWidth: 460, textAlign: 'center' }}>
        <div
          className="pb-font-display"
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#fff',
            marginBottom: 6,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
          {subtitle}
        </div>
        <div className="pb-neon-bar" />
      </div>
    </div>
  )
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return `${n} ${many}`
  if (mod10 === 1) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`
  return `${n} ${many}`
}
