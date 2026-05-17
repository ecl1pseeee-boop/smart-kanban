import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeVariant =
  | 'default'
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'success'
  | 'warning'
  | 'info'
  | 'danger'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  dot?: boolean
  dotColor?: string
  children: ReactNode
}

const DOT_COLOR: Record<BadgeVariant, string> = {
  default:  '#06b6d4',
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#06b6d4',
  LOW:      'rgba(255,255,255,0.3)',
  success:  '#10b981',
  warning:  '#f97316',
  info:     '#06b6d4',
  danger:   '#ef4444',
}

export function Badge({
  variant = 'default',
  dot = true,
  dotColor,
  children,
  className,
  style,
  ...rest
}: BadgeProps) {
  const dotStyle: CSSProperties = {
    background: dotColor ?? DOT_COLOR[variant],
  }
  return (
    <span className={cn('pb-badge', className)} style={style} {...rest}>
      {dot && <span className="pb-badge-dot" style={dotStyle} />}
      {children}
    </span>
  )
}
