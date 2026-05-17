import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem<T extends string = string> {
  value: T
  label: ReactNode
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  orientation = 'horizontal',
  className,
}: TabsProps<T>) {
  return (
    <div className={cn('pb-tabs', className)} data-orientation={orientation} role="tablist">
      {items.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            className="pb-tab"
            data-active={active ? 'true' : undefined}
            onClick={() => onChange(t.value)}
            type="button"
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
