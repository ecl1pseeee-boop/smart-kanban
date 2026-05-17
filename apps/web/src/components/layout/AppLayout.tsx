import type { ReactNode } from 'react'
import { AmbientGlow } from '../ui/AmbientGlow'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <AmbientGlow />
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>{children}</div>
    </div>
  )
}
