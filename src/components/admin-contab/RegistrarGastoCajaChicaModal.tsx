import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { autocompleteApi } from '@/api/autocompleteApi'
import { useCreatePettyCashExpenses } from '@/hooks/useAdminContab'
import type { PettyCashNewExpenseLine } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPaperclip } from '@/components/icons'

const FOTO_MAX_BYTES = 10 * 1024 * 1024
const FOTO_ACCEPTED  = ['image/jpeg', 'image/png', 'application/pdf']

interface Props {
  onClose: () => void
  onSaved: () => void
}

function emptyLine(): PettyCashNewExpenseLine {
  return { fecha: '', solicitante_id: null, proveedor: '', descripcion: '', monto_bruto: '', itbms: '', foto: null }
}

interface LineErrors {
  campos?: boolean
  foto?: boolean
}

/**
 * REQ-535 (SCRUM-612) — formulario "Nuevo gasto", multi-línea, incluso de distintos solicitantes
 * a la vez (RN1-RN5). Cada línea es completamente independiente — no hay estado compartido más
 * allá de la lista misma, para que agregar/quitar una línea nunca reordene los índices de otra.
 */
export default function RegistrarGastoCajaChicaModal({ onClose, onSaved }: Props) {
  const { t } = useTranslation('adminContab')
  const [lineas, setLineas] = useState<PettyCashNewExpenseLine[]>([emptyLine()])
  const [errors, setErrors] = useState<Record<number, LineErrors>>({})
  const [error, setError]   = useState<string | null>(null)

  const { data: solicitantes = [] } = useQuery({
    queryKey: ['autocomplete-users'],
    queryFn:  () => autocompleteApi.users(''),
  })
  const createMutation = useCreatePettyCashExpenses()

  function updateLine(index: number, patch: Partial<PettyCashNewExpenseLine>) {
    setLineas(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLineas(prev => [...prev, emptyLine()])
  }

  function removeLine(index: number) {
    setLineas(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function pickFoto(index: number, file: File | undefined | null) {
    if (!file) return
    if (!FOTO_ACCEPTED.includes(file.type)) {
      setError(t('cajaChica.nuevoGastoModal.fotoInvalidType'))
      return
    }
    if (file.size > FOTO_MAX_BYTES) {
      setError(t('cajaChica.nuevoGastoModal.fotoTooLarge'))
      return
    }
    setError(null)
    updateLine(index, { foto: file })
  }

  function validate(): boolean {
    const nextErrors: Record<number, LineErrors> = {}
    let ok = true
    lineas.forEach((l, i) => {
      const camposCompletos = l.fecha !== '' && l.solicitante_id !== null && l.proveedor.trim() !== ''
        && l.descripcion.trim() !== '' && l.monto_bruto !== '' && l.itbms !== ''
      const lineErrors: LineErrors = {}
      if (!camposCompletos) { lineErrors.campos = true; ok = false }
      if (!l.foto) { lineErrors.foto = true; ok = false }
      if (lineErrors.campos || lineErrors.foto) nextErrors[i] = lineErrors
    })
    setErrors(nextErrors)
    return ok
  }

  function handleSubmit() {
    setError(null)
    if (!validate()) return
    createMutation.mutate(lineas, {
      onSuccess: onSaved,
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setError(msg ?? t('cajaChica.nuevoGastoModal.error'))
      },
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('cajaChica.nuevoGastoModal.title')}</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('cajaChica.nuevoGastoModal.subtitle')}</p>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[65vh] overflow-y-auto">
          {lineas.map((linea, i) => (
            <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {t('cajaChica.nuevoGastoModal.lineaTitle', { numero: i + 1 })}
                </span>
                {lineas.length > 1 && (
                  <button type="button" onClick={() => removeLine(i)} className="text-[11px] font-medium text-red-500 hover:text-red-700">
                    {t('cajaChica.nuevoGastoModal.quitarLinea')}
                  </button>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('cajaChica.nuevoGastoModal.fecha')}
                  </span>
                  <input
                    type="date" value={linea.fecha} onChange={e => updateLine(i, { fecha: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('cajaChica.nuevoGastoModal.solicitante')}
                  </span>
                  <select
                    value={linea.solicitante_id ?? ''}
                    onChange={e => updateLine(i, { solicitante_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  >
                    <option value="">{t('cajaChica.nuevoGastoModal.solicitantePlaceholder')}</option>
                    {solicitantes.map(s => (
                      <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('cajaChica.nuevoGastoModal.proveedor')}
                  </span>
                  <input
                    type="text" value={linea.proveedor} onChange={e => updateLine(i, { proveedor: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('cajaChica.nuevoGastoModal.descripcion')}
                  </span>
                  <input
                    type="text" value={linea.descripcion} onChange={e => updateLine(i, { descripcion: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('cajaChica.nuevoGastoModal.montoBruto')}
                  </span>
                  <input
                    type="number" step="0.01" min="0" value={linea.monto_bruto}
                    onChange={e => updateLine(i, { monto_bruto: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('cajaChica.nuevoGastoModal.itbms')}
                  </span>
                  <input
                    type="number" step="0.01" min="0" value={linea.itbms}
                    onChange={e => updateLine(i, { itbms: e.target.value })}
                    placeholder={t('cajaChica.nuevoGastoModal.itbmsHint')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              {errors[i]?.campos && (
                <p className="text-[11px] text-red-500 mt-2">{t('cajaChica.nuevoGastoModal.camposRequeridos')}</p>
              )}

              <div className="mt-3">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('cajaChica.nuevoGastoModal.foto')}
                </span>
                <label
                  className={`flex items-center gap-2 rounded-lg border-2 border-dashed px-3 py-2.5 cursor-pointer ${
                    errors[i]?.foto ? 'border-red-300 dark:border-red-900' : 'border-slate-200 dark:border-slate-600'
                  }`}
                >
                  <input
                    type="file" accept="image/jpeg,image/png,.pdf" className="hidden"
                    onChange={e => pickFoto(i, e.target.files?.[0])}
                  />
                  <IcoPaperclip size={16} className="text-slate-400 flex-shrink-0" />
                  {linea.foto ? (
                    <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <span className="truncate max-w-[220px]">{linea.foto.name}</span>
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); updateLine(i, { foto: null }) }}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        <IcoClose size={12} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-500 dark:text-slate-400">{t('cajaChica.nuevoGastoModal.foto')}</span>
                  )}
                </label>
                {errors[i]?.foto && (
                  <p className="text-[11px] text-red-500 mt-1">{t('cajaChica.nuevoGastoModal.fotoRequerida')}</p>
                )}
              </div>
            </div>
          ))}

          <button type="button" onClick={addLine} className="self-start text-sm font-semibold text-primary-dark hover:underline">
            {t('cajaChica.nuevoGastoModal.agregarLinea')}
          </button>

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={createMutation.isPending}>
            {t('cajaChica.nuevoGastoModal.cancel')}
          </Button>
          <Button onClick={handleSubmit} loading={createMutation.isPending}>
            {t('cajaChica.nuevoGastoModal.confirm')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
