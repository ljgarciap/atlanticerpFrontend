import type { Freshness, Urgency } from '@/types/project'

export function getFreshnessClass(freshness: Freshness): string {
  switch (freshness) {
    case 'recent': return 'text-green-700 bg-green-100'
    case 'stale':  return 'text-amber-700 bg-amber-100'
    case 'cold':   return 'text-red-700 bg-red-100'
  }
}

export function getFreshnessDot(freshness: Freshness): string {
  switch (freshness) {
    case 'recent': return '#16a34a'
    case 'stale':  return '#f59e0b'
    case 'cold':   return '#dc2626'
  }
}

export function getUrgencyClass(urgency: Urgency): string {
  switch (urgency) {
    case 'vencido': return 'text-red-700 bg-red-100'
    case 'proximo': return 'text-amber-700 bg-amber-100'
    case 'ok':      return ''
  }
}

export function getUrgencyBorderClass(urgency: Urgency): string {
  switch (urgency) {
    case 'vencido': return 'border-l-red-500'
    case 'proximo': return 'border-l-amber-400'
    case 'ok':      return 'border-l-transparent'
  }
}

/** Returns calendar days until dateStr (negative if past). Null if no date. */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Append T00:00:00 so JS parses as local midnight, not UTC midnight
  const target = new Date(dateStr + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}
