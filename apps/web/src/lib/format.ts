export type DueState = 'normal' | 'soon' | 'overdue'

export function dueDateState(due: string | null): DueState {
  if (!due) return 'normal'
  const ts = new Date(due).getTime()
  const now = Date.now()
  if (ts < now) return 'overdue'
  if (ts - now < 24 * 60 * 60 * 1000) return 'soon'
  return 'normal'
}

/** Back-compat wrapper kept so older callers still resolve.
 *  The TaskCard now reads the state directly; this returns a marker string. */
export function dueDateClass(due: string | null): string {
  const s = dueDateState(due)
  return s === 'overdue' ? 'overdue red' : s === 'soon' ? 'soon orange' : 'normal'
}

export function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

const PALETTE = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-sky-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-fuchsia-500',
]
export function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}
