import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  glow?: boolean
  padding?: string
  radius?: string
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { children, className, glow = false, padding, radius, style, ...rest },
  ref,
) {
  const mergedStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--border-subtle)',
    borderRadius: radius ?? 'var(--radius-2xl)',
    position: 'relative',
    overflow: 'hidden',
    ...(padding ? { padding } : null),
    ...style,
  }

  return (
    <div ref={ref} className={cn('pb-glass-card', className)} style={mergedStyle} {...rest}>
      {glow && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            background:
              'radial-gradient(ellipse at top left, rgba(139,92,246,0.06) 0%, transparent 60%)',
            pointerEvents: 'none',
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  )
})
