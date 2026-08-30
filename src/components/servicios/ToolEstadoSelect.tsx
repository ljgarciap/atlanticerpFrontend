import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { TOOL_ESTADOS } from '@/types/servicios'
import type { Tool, ToolEstado } from '@/types/servicios'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  tool:      Tool
  canEdit:   boolean
  onChanged: () => void
}

// SCRUM-779 (rebote Daniela 2026-08-20) — Dañada/Perdida/Desgaste piden el detalle del incidente
// antes de confirmar (mismo patrón que TicketCancelModal — motivo obligatorio, botón deshabilitado
// hasta escribirlo); sin esto el backend igual lo aceptaba pero ninguna acción real de usuario lo
// mandaba nunca, así que el Kardex seguía sin descripción para esos 3 tipos.
const ESTADOS_REQUIRE_DETALLE: ToolEstado[] = ['damaged', 'worn', 'lost']

// REQ-269 — select inline por unidad. El backend resuelve `responsable_incidente`
// server-side (RN — el frontend solo manda el estado nuevo, nunca pide quién es el
// responsable). Mismo patrón de rollback que TicketStatusSelect.tsx.
export default function ToolEstadoSelect({ tool, canEdit, onChanged }: Props) {
  const { t } = useTranslation('servicios')
  const [value, setValue] = useState<ToolEstado>(tool.estado)
  const [error, setError] = useState<string | null>(null)
  const [pendingEstado, setPendingEstado] = useState<ToolEstado | null>(null)
  const [detalle, setDetalle] = useState('')

  useEffect(() => { setValue(tool.estado) }, [tool.estado])

  const mutation = useMutation({
    mutationFn: ({ estado, detalle: d }: { estado: ToolEstado; detalle?: string }) =>
      serviciosApi.tools.changeEstado(tool.id, estado, d),
    onSuccess: () => {
      setError(null)
      setPendingEstado(null)
      setDetalle('')
      onChanged()
    },
    onError: () => {
      setValue(tool.estado)
      setError(t('tools.table.estadoChangeError'))
      setPendingEstado(null)
      setDetalle('')
    },
  })

  if (!canEdit) {
    return (
      <span className="text-xs px-2 py-1 rounded-full font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
        {t(`tools.estados.${tool.estado}`)}
      </span>
    )
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as ToolEstado
    setError(null)
    if (ESTADOS_REQUIRE_DETALLE.includes(next)) {
      // No se aplica todavía — el select vuelve a mostrar el estado actual hasta confirmar en el
      // modal (o cancelarlo, que lo deja exactamente como estaba).
      setPendingEstado(next)
      setDetalle('')
      return
    }
    setValue(next)
    mutation.mutate({ estado: next })
  }

  function confirmPending() {
    if (!pendingEstado) return
    setValue(pendingEstado)
    mutation.mutate({ estado: pendingEstado, detalle: detalle.trim() })
  }

  function cancelPending() {
    setPendingEstado(null)
    setDetalle('')
  }

  return (
    <div>
      <select
        aria-label={t('tools.table.columns.estado')}
        value={value}
        disabled={mutation.isPending}
        onChange={handleChange}
        className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {TOOL_ESTADOS.map(estado => (
          <option key={estado} value={estado}>{t(`tools.estados.${estado}`)}</option>
        ))}
      </select>
      {error && <p className="text-red-600 text-[11px] mt-1 max-w-[160px]">{error}</p>}

      {pendingEstado && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <Card variant="modal" className="w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {t('tools.detalleModal.title', { estado: t(`tools.estados.${pendingEstado}`) })}
              </h2>
              <Button variant="icon" onClick={cancelPending}><IcoClose /></Button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('tools.detalleModal.detalleLabel')}
                </span>
                <textarea
                  value={detalle}
                  onChange={e => setDetalle(e.target.value)}
                  placeholder={t('tools.detalleModal.detallePlaceholder')}
                  rows={3}
                  autoFocus
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </label>
              {detalle.trim() === '' && (
                <p className="text-[11px] text-slate-400">{t('tools.detalleModal.detalleRequired')}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
              <Button variant="secondary" onClick={cancelPending} disabled={mutation.isPending}>
                {t('tools.detalleModal.cancel')}
              </Button>
              <Button onClick={confirmPending} disabled={detalle.trim() === ''} loading={mutation.isPending}>
                {t('tools.detalleModal.confirm')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
