import type { CSSProperties } from 'react'
import { avatarColor, initials } from '@/lib/format'
import { cn } from '@/lib/cn'

interface AvatarProps {
  user: { id: string; name: string; avatarUrl?: string | null }
  size?: 'xs' | 'sm' | 'md'
  ring?: boolean
  className?: string
  style?: CSSProperties
}

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
} as const

export function Avatar({ user, size = 'sm', ring, className, style }: AvatarProps) {
  return (
    <div
      title={user.name}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0',
        SIZES[size],
        avatarColor(user.id),
        className,
      )}
      style={{
        ...(ring ? { boxShadow: '0 0 0 2px var(--bg-base)' } : null),
        ...style,
      }}
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.name}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        initials(user.name)
      )}
    </div>
  )
}
