import type { ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: { label: string; onClick: () => void }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      {icon && (
        <div
          aria-hidden
          style={{
            color: 'var(--text-subtle)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ color: 'var(--text-muted)', fontSize: 15, fontWeight: 600 }}>{title}</div>
      {description && (
        <div style={{ color: 'var(--text-subtle)', fontSize: 13, maxWidth: 320 }}>
          {description}
        </div>
      )}
      {action && (
        <div style={{ marginTop: 8 }}>
          <Button variant="primary" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  )
}
