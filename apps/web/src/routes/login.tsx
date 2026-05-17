import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Mail, Lock, User as UserIcon, ArrowLeft } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Logo } from '@/components/ui/Logo'

const DEMO = [
  { email: 'admin@demo.com', label: 'Admin (Dev Lead)' },
  { email: 'tanya@demo.com', label: 'Таня (PM)' },
  { email: 'dmitry@demo.com', label: 'Дмитрий (Dev)' },
]

const TYPEWRITER_PHRASES = ['…без рутины.', '…на автопилоте.', '…в один клик.']
const CHAR_DELAY_MS = 95
const HOLD_DELAY_MS = 2000
const ERASE_DELAY_MS = 35

const ERROR_STYLE: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)',
  color: '#fca5a5',
  fontSize: 13,
}

type View = 'choice' | 'login' | 'register'

export function LoginPage() {
  const navigate = useNavigate()
  const [view, setView] = useState<View>('choice')
  const [email, setEmail] = useState('admin@demo.com')
  const [password, setPassword] = useState('Demo1234!')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const typed = useTypewriter()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res =
        view === 'login'
          ? await api.login(email, password)
          : await api.register(email, name || email.split('@')[0]!, password)
      useAuthStore.getState().setSession(res.user, res.accessToken, res.refreshToken)
      navigate({ to: '/boards' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1fr)',
        alignItems: 'center',
      }}
      className="pb-login-grid"
    >
      {/* LEFT — Контентная колонка */}
      <div
        style={{
          padding: '72px 56px 72px 80px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minWidth: 0,
        }}
      >
        <div style={{ marginBottom: 56 }}>
          <Logo size="md" />
        </div>

        <h1
          className="pb-font-display"
          style={{
            fontSize: 'clamp(40px, 4.8vw, 64px)',
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: '-0.025em',
            textTransform: 'uppercase',
            marginBottom: 18,
            color: '#fff',
          }}
        >
          Создавайте
          <br />
          проекты
        </h1>

        <div
          className="pb-font-display"
          style={{
            fontSize: 'clamp(34px, 4vw, 54px)',
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            minHeight: '1.2em',
          }}
        >
          <span className="gradient-text" style={{ whiteSpace: 'pre' }}>
            {typed}
          </span>
          <span className="pb-caret" aria-hidden />
        </div>

        <p
          style={{
            marginTop: 32,
            fontSize: 15,
            lineHeight: 1.7,
            color: 'var(--text-muted)',
            maxWidth: 440,
          }}
        >
          PromptBoard — ИИ-канбан, который превращает созвоны в задачи, автоматизирует рутину
          и распределяет работу между участниками команды.
        </p>
      </div>

      {/* RIGHT — Карточка-форма */}
      <div
        style={{
          padding: '72px 80px 72px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 0,
        }}
      >
        <GlassCard
          glow
          style={{
            width: '100%',
            maxWidth: 420,
            padding: view === 'choice' ? '44px 36px' : '36px 36px',
          }}
        >
          {view === 'choice' ? (
            <div className="pb-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ textAlign: 'center', marginBottom: 10 }}>
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
                  Добро пожаловать
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Войдите или создайте аккаунт, чтобы начать
                </div>
              </div>

              <Button
                variant="primary"
                size="lg"
                onClick={() => setView('login')}
                style={{ height: 52, fontSize: 15 }}
              >
                Войти
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setView('register')}
                style={{ height: 52, fontSize: 15 }}
              >
                Зарегистрироваться
              </Button>

              <div
                style={{
                  marginTop: 18,
                  paddingTop: 18,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-subtle)',
                    textAlign: 'center',
                    marginBottom: 10,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Демо-аккаунты
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    justifyContent: 'center',
                  }}
                >
                  {DEMO.map((d) => (
                    <Button
                      key={d.email}
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => {
                        setEmail(d.email)
                        setPassword('Demo1234!')
                        setView('login')
                      }}
                    >
                      {d.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="pb-fade-in">
              <button
                onClick={() => {
                  setView('choice')
                  setError(null)
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  marginBottom: 18,
                  fontFamily: 'inherit',
                }}
              >
                <ArrowLeft size={13} />
                Назад
              </button>

              <div
                className="pb-font-display"
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#fff',
                  marginBottom: 20,
                  letterSpacing: '-0.01em',
                }}
              >
                {view === 'login' ? 'Вход в PromptBoard' : 'Создание аккаунта'}
              </div>

              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {view === 'register' && (
                  <Field label="Имя">
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Иван Иванов"
                      autoComplete="name"
                      icon={<UserIcon size={16} />}
                    />
                  </Field>
                )}

                <Field label="Email">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@company.com"
                    autoComplete="email"
                    icon={<Mail size={16} />}
                  />
                </Field>

                <Field label="Пароль">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="••••••••"
                    autoComplete={view === 'login' ? 'current-password' : 'new-password'}
                    icon={<Lock size={16} />}
                  />
                </Field>

                {error && <div style={ERROR_STYLE}>{error}</div>}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={busy}
                  style={{ height: 48, marginTop: 4 }}
                >
                  {busy ? '…' : view === 'login' ? 'Войти в аккаунт' : 'Создать аккаунт'}
                </Button>
              </form>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, color: 'var(--text-label)', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  )
}

/**
 * Cycles through TYPEWRITER_PHRASES: types each phrase character-by-character,
 * holds for HOLD_DELAY_MS, then erases backwards.
 */
function useTypewriter(): string {
  const [text, setText] = useState('')
  const phraseIdxRef = useRef(0)
  const charIdxRef = useRef(0)
  const phaseRef = useRef<'typing' | 'holding' | 'erasing'>('typing')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      const phrase = TYPEWRITER_PHRASES[phraseIdxRef.current]!
      const phase = phaseRef.current

      if (phase === 'typing') {
        if (charIdxRef.current < phrase.length) {
          charIdxRef.current += 1
          setText(phrase.slice(0, charIdxRef.current))
          timer = setTimeout(tick, CHAR_DELAY_MS)
        } else {
          phaseRef.current = 'holding'
          timer = setTimeout(tick, HOLD_DELAY_MS)
        }
      } else if (phase === 'holding') {
        phaseRef.current = 'erasing'
        timer = setTimeout(tick, ERASE_DELAY_MS)
      } else {
        if (charIdxRef.current > 0) {
          charIdxRef.current -= 1
          setText(phrase.slice(0, charIdxRef.current))
          timer = setTimeout(tick, ERASE_DELAY_MS)
        } else {
          phaseRef.current = 'typing'
          phraseIdxRef.current = (phraseIdxRef.current + 1) % TYPEWRITER_PHRASES.length
          timer = setTimeout(tick, 200)
        }
      }
    }

    timer = setTimeout(tick, 400)
    return () => clearTimeout(timer)
  }, [])

  return text
}
