import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type CardVariant = 'modal' | 'modal-auth' | 'drawer' | 'panel' | 'list-item'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  shadow?: boolean
  accentColor?: string
}

const VARIANT_CLASSES: Record<CardVariant, string> = {
  modal: 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl',
  'modal-auth': 'bg-white dark:bg-slate-800 rounded-[18px]',
  drawer: 'bg-white dark:bg-slate-800 shadow-2xl',
  panel: 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl',
  'list-item': 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4',
}

const AUTH_CARD_SHADOW = '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)'

export function Card({ variant = 'panel', shadow, accentColor, className, style, ...props }: CardProps) {
  return (
    <div
      className={cn(
        VARIANT_CLASSES[variant],
        (variant === 'panel' || variant === 'list-item') && shadow && 'shadow-sm',
        variant === 'list-item' && accentColor && 'border-l-[3px]',
        className
      )}
      style={{
        ...(variant === 'modal-auth' ? { boxShadow: AUTH_CARD_SHADOW } : {}),
        ...(accentColor ? { borderLeftColor: accentColor } : {}),
        ...style,
      }}
      {...props}
    />
  )
}
