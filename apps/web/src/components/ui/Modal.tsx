import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { GlassCard } from './GlassCard'
import { cn } from '@/lib/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  maxWidth?: number
  glow?: boolean
}

const OVERLAY: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  background: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: 24,
  overflowY: 'auto',
}

export function Modal({
  open,
  onClose,
  children,
  className,
  maxWidth = 640,
  glow = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={OVERLAY}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <GlassCard
        glow={glow}
        className={cn('pb-fade-in', className)}
        style={{ marginTop: 64, width: '100%', maxWidth }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </GlassCard>
    </div>
  )
}
