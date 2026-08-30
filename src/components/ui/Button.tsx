import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant =
  | 'primary'
  | 'accent'
  | 'secondary'
  | 'outline'
  | 'danger'
  | 'danger-text'
  | 'ghost'
  | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  active?: boolean
  /** Color to show when `active` — defaults to 'primary' (teal). Use 'accent' (lime) for
   *  toggle groups that need to stay visually distinct from teal-active groups, e.g. two
   *  separate chip pickers shown together. */
  activeVariant?: 'primary' | 'accent'
  loading?: boolean
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary hover:bg-primary-dark dark:hover:bg-primary-light text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors',
  accent:
    'bg-accent hover:bg-accent-dark text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors',
  secondary:
    'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-lg px-4 py-2 text-sm transition-colors',
  outline:
    'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-lg px-4 py-2 text-sm transition-colors',
  danger:
    'bg-white hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-semibold rounded-lg px-4 py-2 text-sm transition-colors',
  'danger-text':
    'text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-semibold text-sm transition-colors',
  ghost:
    'text-primary hover:text-primary-dark dark:text-primary-light font-semibold text-sm transition-colors',
  icon: 'p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors',
}

const ACTIVE_CLASSES: Record<'primary' | 'accent', string> = {
  primary: VARIANT_CLASSES.primary,
  accent: VARIANT_CLASSES.accent,
}

function Spinner({ variant }: { variant: ButtonVariant }) {
  const onColorBg = variant === 'primary' || variant === 'accent'
  return (
    <span
      className={cn(
        'inline-block w-4 h-4 rounded-full animate-spin border-2',
        onColorBg ? 'border-white/40 border-t-white' : 'border-slate-300 dark:border-slate-600 border-t-primary'
      )}
    />
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', active, activeVariant = 'primary', loading, disabled, className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        active ? ACTIVE_CLASSES[activeVariant] : VARIANT_CLASSES[variant],
        'disabled:opacity-50 disabled:cursor-not-allowed',
        loading && 'inline-flex items-center justify-center gap-2',
        className
      )}
      {...props}
    >
      {loading && <Spinner variant={active ? activeVariant : variant} />}
      {children}
    </button>
  )
})
