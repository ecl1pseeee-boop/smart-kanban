import { useState, type CSSProperties } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Mail, Lock, User as UserIcon } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { Logo } from '@/components/ui/Logo'

const DEMO = [
  { email: 'admin@demo.com', label: 'Admin (Dev Lead)' },
  { email: 'tanya@demo.com', label: 'Таня (PM)' },
  { email: 'dmitry@demo.com', label: 'Дмитрий (Dev)' },
]

const ERROR_STYLE: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)',
  color: '#fca5a5',
  fontSize: 13,
}

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@demo.com')
  const [password, setPassword] = useState('Demo1234!')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res =
        mode === 'login'
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
        gridTemplateColumns: '1fr 1fr',
        alignItems: 'center',
      }}
    >
      {/* LEFT */}
      <div
        style={{
          padding: '80px 64px 80px 80px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div style={{ marginBottom: 64 }}>
          <Logo size="md" />
        </div>

        <h1
          style={{
            fontSize: 'clamp(38px, 4.5vw, 58px)',
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-2px',
            textTransform: 'uppercase',
            marginBottom: 20,
          }}
        >
          Создавайте
          <br />
          проекты
        </h1>

        <div
          style={{
            fontSize: 'clamp(34px, 4vw, 52px)',
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-1.5px',
            textTransform: 'uppercase',
          }}
        >
          <span className="gradient-text">…без рутины.</span>
        </div>

        <p
          style={{
            marginTop: 32,
            fontSize: 15,
            lineHeight: 1.7,
            color: 'var(--text-muted)',
            maxWidth: 400,
          }}
        >
          Smart Kanban — real-time канбан с AI-автоматизацией, декомпозицией задач и
          Telegram-ботом. Всё, чтобы команда фокусировалась на главном.
        </p>

        <div style={{ marginTop: 40, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Badge>Real-time синхронизация</Badge>
          <Badge>AI-автоматизация</Badge>
          <Badge>Telegram-бот</Badge>
        </div>
      </div>

      {/* RIGHT */}
      <div
        style={{
          padding: '80px 80px 80px 40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GlassCard glow style={{ width: '100%', maxWidth: 400, padding: '40px 36px' }}>
          <div style={{ marginBottom: 28 }}>
            <Tabs
              value={mode}
              onChange={(v) => setMode(v)}
              items={[
                { value: 'login', label: 'Войти' },
                { value: 'register', label: 'Регистрация' },
              ]}
            />
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'register' && (
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
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                icon={<Lock size={16} />}
              />
            </Field>

            {error && <div style={ERROR_STYLE}>{error}</div>}

            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              {busy ? '…' : mode === 'login' ? 'Войти в аккаунт' : 'Создать аккаунт'}
            </Button>
          </form>

          <div
            style={{
              marginTop: 20,
              textAlign: 'center',
              fontSize: 12,
              color: 'rgba(255,255,255,0.22)',
              lineHeight: 1.6,
            }}
          >
            Продолжая, вы соглашаетесь с условиями использования
            <br /> и политикой конфиденциальности
          </div>
        </GlassCard>
      </div>

      <div
        style={{
          gridColumn: '1 / -1',
          padding: '0 40px 32px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 8 }}>
          Демо-аккаунты (пароль Demo1234!)
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          {DEMO.map((d) => (
            <Button
              key={d.email}
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => {
                setEmail(d.email)
                setPassword('Demo1234!')
                setMode('login')
              }}
            >
              {d.label}
            </Button>
          ))}
        </div>
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
