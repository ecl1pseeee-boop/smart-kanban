const BASE = {
  position: 'fixed' as const,
  borderRadius: '50%',
  filter: 'blur(120px)',
  pointerEvents: 'none' as const,
  zIndex: 0,
}

export function AmbientGlow() {
  return (
    <>
      <div
        aria-hidden
        style={{
          ...BASE,
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
          top: -150,
          left: -100,
        }}
      />
      <div
        aria-hidden
        style={{
          ...BASE,
          width: 500,
          height: 500,
          background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)',
          bottom: -100,
          right: -80,
        }}
      />
      <div
        aria-hidden
        style={{
          ...BASE,
          width: 300,
          height: 300,
          background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
          top: '50%',
          right: '30%',
          transform: 'translateY(-50%)',
        }}
      />
    </>
  )
}
