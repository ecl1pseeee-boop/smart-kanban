import type { CSSProperties } from 'react'

type Size = 'sm' | 'md' | 'lg'

interface LogoProps {
  size?: Size
  showName?: boolean
  className?: string
  style?: CSSProperties
}

const MARK_SIZE: Record<Size, number> = { sm: 24, md: 32, lg: 40 }
const NAME_SIZE: Record<Size, number> = { sm: 14, md: 16, lg: 20 }

export function Logo({ size = 'md', showName = true, className, style }: LogoProps) {
  const mark = MARK_SIZE[size]
  const name = NAME_SIZE[size]
  const inner = Math.round(mark * 0.56)

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        ...style,
      }}
    >
      <div
        aria-hidden
        style={{
          width: mark,
          height: mark,
          background: 'var(--gradient-accent)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg
          viewBox="0 0 18 18"
          fill="none"
          style={{ width: inner, height: inner }}
        >
          <path
            d="M3 5C3 3.895 3.895 3 5 3h8c1.105 0 2 .895 2 2v2c0 1.105-.895 2-2 2H5c-1.105 0-2-.895-2-2V5z"
            fill="white"
            fillOpacity="0.9"
          />
          <path
            d="M3 12c0-.552.448-1 1-1h5c.552 0 1 .448 1 1s-.448 1-1 1H4c-.552 0-1-.448-1-1z"
            fill="white"
            fillOpacity="0.6"
          />
          <path
            d="M3 15c0-.552.448-1 1-1h3c.552 0 1 .448 1 1s-.448 1-1 1H4c-.552 0-1-.448-1-1z"
            fill="white"
            fillOpacity="0.35"
          />
        </svg>
      </div>
      {showName && (
        <span
          style={{
            fontSize: name,
            fontWeight: 600,
            letterSpacing: '-0.3px',
            color: 'var(--text-primary)',
          }}
        >
          PromptBoard
        </span>
      )}
    </div>
  )
}
