import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const SIZE_PADDING: Record<Size, string> = {
  sm: '8px 12px',
  md: '10px 16px',
  lg: '14px 24px',
}

const SIZE_FONT: Record<Size, string> = {
  sm: '13px',
  md: '14px',
  lg: '15px',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, style, children, ...rest },
  ref,
) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 'var(--radius-lg)',
    padding: SIZE_PADDING[size],
    fontSize: SIZE_FONT[size],
    fontWeight: 600,
    letterSpacing: '-0.1px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text-primary)',
    transition:
      'transform var(--transition-fast), opacity var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast)',
    position: 'relative',
    overflow: 'hidden',
    ...style,
  }

  return (
    <button
      ref={ref}
      data-variant={variant}
      className={cn('pb-btn', className)}
      style={base}
      {...rest}
    >
      {children}
    </button>
  )
})
