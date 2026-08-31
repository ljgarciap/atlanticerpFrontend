import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  useWarehousesList, useGeneralCounts, useGeneralCountDetail, useCreateGeneralCount,
  useEvaluateGeneralCount, useSubmitGeneralCount, useApproveGeneralCount, useRejectGeneralCount,
  useApplyGeneralCount, useDeleteGeneralCount,
} from '@/hooks/useBodega'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { IcoClose, IcoCheck, IcoAlertTriangle, IcoBarChart } from '@/components/icons'
import type { GeneralCountChip, GeneralCountDuplicateWarning, GeneralCountLine, GeneralCountRow } from '@/types/bodega'

/** SCRUM-797 (rebote de Gerencia Test 2026-08-27) — 409 estructurado que devuelven
 * `POST /general-counts` y `POST /general-counts/{id}/submit`: un elemento por producto en
 * conflicto real (ya no un único conteo bloqueando toda la bodega). */
function duplicatesFrom(err: unknown): GeneralCountDuplicateWarning[] {
  if (isAxiosError(err) && err.response?.status === 409) {
    return (err.response.data as { duplicates?: GeneralCountDuplicateWarning[] } | undefined)?.duplicates ?? []
  }
  return []
}

// SCRUM-466 (REQ-396, rebote de Gerencia Test 2026-08-14) — "Realizar ajuste" debe verse
// EXCLUSIVAMENTE para el Líder de Bodega, no para Mark ni ningún otro perfil de Bodega. A
// diferencia de Aprobar/Rechazar de este mismo panel (gateados solo por identidad de persona,
// `primary_approver_user_id`, sin equivalente de rol en el JWT — ver docblock de `RowAction` abajo),
// acá SÍ hay un campo confiable: `role` en el JWT ES el `role_key` real
// (`JwtClaimsBuilder` → `$user->role->key`), confirmado con el mismo criterio ya usado en
// `OrderCardTile.tsx` para "Asignar Repartidor" (`BodegaRoles::LIDER_BODEGA` = `'lider_bodega'`).
// Confirmado por el Backend Dev (2026-08-14): `GeneralCountController::apply()` ahora devuelve
// 403 real a cualquiera que no tenga este role_key, Mark incluido — nunca comparar por nombre de
// persona (bug real ya documentado: renombrar un perfil rompió un gate que comparaba por nombre).
const LIDER_BODEGA_ROLE = 'lider_bodega'

/**
 * Bloque B5 (SCRUM-460→466, REQ-390→396) — pantalla "Inventario general". Mockup adjunto
 * `3H__Bodega_InventarioGeneral.html`: 2 paneles, "Nuevo conteo general" (creación + evaluación +
 * envío) y "Conteos generales" (bandeja/historial con aprobación de Mark).
 */
export default function BodegaInventarioGeneralPage() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()

  // SCRUM-462 (REQ-392, rebote de Gerencia Test 2026-08-14) — "Continuar" en la bandeja de
  // Conteos generales retoma un borrador (pendiente_evaluacion/evaluado) en el panel "Nuevo
  // conteo general" de arriba, con sus datos ya capturados. Estado levantado al padre porque
  // ambos paneles son hoy componentes hermanos independientes.
  const [resume, setResume] = useState<ResumeCount | null>(null)

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-start justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('bodega:generalCounts.title')}</h1>
          <p className="text-[12px] text-slate-500">{t('bodega:generalCounts.subtitle')}</p>
        </div>
        {/* SCRUM-467 (REQ-397) — el ticket pedía este link en el encabezado de "Inventario
            general" (ver nota en Sidebar.tsx); ahora que la pantalla existe, se agrega acá. El
            mockup usa el glyph 📊 — regla SCRUM-56, ícono Feather (`IcoBarChart`) en vez de emoji. */}
        <Button variant="secondary" className="inline-flex items-center gap-2" onClick={() => navigate('/bodega/kardex')}>
          <IcoBarChart size={14} /> {t('bodega:generalCounts.kardexLink')}
        </Button>
      </div>

      <NewCountPanel resume={resume} onResumeConsumed={() => setResume(null)} />
      <CountsTrayPanel onContinue={row => setResume({ id: row.id, warehouseId: row.warehouse_id, evaluated: row.estado === 'evaluado' })} />
    </div>
  )
}

/** SCRUM-462 — "resumir" un borrador desde la bandeja hacia el panel de creación. */
interface ResumeCount {
  id:          number
  warehouseId: number
  evaluated:   boolean
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  )
}

// ── Panel 1 — "Nuevo conteo general" (SCRUM-460/461/462/463/464) ───────────────────────────────

function NewCountPanel({ resume, onResumeConsumed }: {
  resume:            ResumeCount | null
  onResumeConsumed:  () => void
}) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: warehousesData } = useWarehousesList()
  const warehouses = warehousesData?.data ?? []

  const [warehouseId, setWarehouseId] = useState<number | ''>('')
  const [countId, setCountId] = useState<number | null>(null)
  const [contada, setContada] = useState<Record<number, string>>({})
  const [evaluated, setEvaluated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cruceLines, setCruceLines] = useState<GeneralCountLine[] | null>(null)
  // SCRUM-797 (rebote 2026-08-27) — `store` = advertencia al elegir bodega (todavía no se creó
  // nada si el usuario cancela); `submit` = confirmación al enviar a aprobación de Mark (el
  // borrador ya existe, solo se decide si reemplazar la(s) línea(s) puntual(es) en conflicto).
  const [duplicateWarning, setDuplicateWarning] = useState<
    { type: 'store'; warehouseId: number; duplicates: GeneralCountDuplicateWarning[] }
    | { type: 'submit'; id: number; duplicates: GeneralCountDuplicateWarning[] }
    | null
  >(null)

  const create = useCreateGeneralCount()
  const evaluate = useEvaluateGeneralCount()
  const submit = useSubmitGeneralCount()
  const { data: detail } = useGeneralCountDetail(countId)

  const submitRef = useRef(false)

  // SCRUM-462 (REQ-392, rebote de Gerencia Test 2026-08-14) — "Continuar" desde la bandeja carga
  // el conteo EXISTENTE (mismo id, mismas líneas ya creadas) en vez de disparar otro
  // `POST .../general-counts` para la misma bodega. `evaluated` arranca en `true` si el borrador
  // ya pasó por `evaluate` (estado `evaluado`, `cantidad_contada`/`diferencia` ya poblados por el
  // backend) — la sección "Diferencia" se ve de una, sin tener que re-evaluar primero.
  useEffect(() => {
    if (resume === null) return
    setWarehouseId(resume.warehouseId)
    setCountId(resume.id)
    setEvaluated(resume.evaluated)
    setError(null)
    setCruceLines(null)
    onResumeConsumed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume])

  // Solo se re-inicializa el mapa de "cantidad contada" cuando cambia el conteo cargado (un id
  // nuevo) — NO en cada refetch/setQueryData del mismo detalle (ej. tras "Evaluar"), para no
  // pisar lo que el usuario ya escribió. Ver `useEvaluateGeneralCount` (setQueryData, mismo id).
  useEffect(() => {
    if (detail) {
      setContada(Object.fromEntries(
        detail.lines.map(l => [l.id, l.cantidad_contada !== null ? String(l.cantidad_contada) : '']),
      ))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id])

  const resetPanel = () => {
    setWarehouseId('')
    setCountId(null)
    setContada({})
    setEvaluated(false)
    setError(null)
    setCruceLines(null)
  }

  const handleWarehouseChange = (value: string) => {
    setEvaluated(false)
    setError(null)
    setContada({})
    setCountId(null)
    setDuplicateWarning(null)

    if (value === '') { setWarehouseId(''); return }
    const id = Number(value)
    setWarehouseId(id)
    create.mutate({ warehouse_id: id }, {
      onSuccess: res => setCountId(res.id),
      onError:   err => {
        // SCRUM-797 (rebote 2026-08-27) — la bodega elegida sigue siendo la única "selección"
        // real de este flujo (todo el conteo, no hay selección de productos al crear); un 409 acá
        // trae la lista de productos puntuales en conflicto real.
        const duplicates = duplicatesFrom(err)
        if (duplicates.length > 0) { setDuplicateWarning({ type: 'store', warehouseId: id, duplicates }); return }
        setError(t('bodega:generalCounts.newPanel.errors.createFailed'))
      },
    })
  }

  const confirmDuplicateAndCreate = (warehouseId: number) => {
    setDuplicateWarning(null)
    create.mutate({ warehouse_id: warehouseId, confirm_replace: true }, {
      onSuccess: res => setCountId(res.id),
      onError:   () => setError(t('bodega:generalCounts.newPanel.errors.createFailed')),
    })
  }

  const handleInputChange = (lineId: number, value: string) => {
    setContada(c => ({ ...c, [lineId]: value }))
    // RN2 de REQ-392 — editar cualquier cantidad contada oculta la Diferencia hasta re-evaluar.
    setEvaluated(false)
  }

  const handleEvaluate = () => {
    if (!detail) return
    const missing = detail.lines.some(l => (contada[l.id] ?? '').trim() === '')
    if (missing) { setError(t('bodega:generalCounts.newPanel.errors.missingQuantities')); return }

    setError(null)
    evaluate.mutate(
      {
        id: detail.id,
        payload: { lines: detail.lines.map(l => ({ id: l.id, cantidad_contada: Number(contada[l.id]) })) },
      },
      {
        onSuccess: () => setEvaluated(true),
        onError:   () => setError(t('bodega:generalCounts.newPanel.errors.evaluateFailed')),
      },
    )
  }

  const doSubmit = (id: number, confirmReplace = false) => {
    if (submitRef.current) return
    submitRef.current = true
    submit.mutate({ id, confirmReplace }, {
      onSuccess: () => { submitRef.current = false; resetPanel() },
      onError:   err => {
        submitRef.current = false
        // SCRUM-797 (rebote 2026-08-27) — "al enviar a aprobación de Mark": otro conteo puede
        // haber dejado una diferencia real sin resolver para alguno de los MISMOS productos que
        // este conteo también encontró con diferencia desde que se creó este borrador.
        const duplicates = confirmReplace ? [] : duplicatesFrom(err)
        if (duplicates.length > 0) { setDuplicateWarning({ type: 'submit', id, duplicates }); return }
        setError(t('bodega:generalCounts.newPanel.errors.submitFailed'))
      },
    })
  }

  const handleSubmitClick = () => {
    if (!detail || !evaluated) { setError(t('bodega:generalCounts.newPanel.errors.notEvaluated')); return }
    setError(null)

    const withDifference = detail.lines.filter(l => (l.diferencia ?? 0) !== 0)
    const withCruce = withDifference.filter(l => l.tiene_cruce_pendiente)
    if (withCruce.length > 0) { setCruceLines(withCruce); return }

    doSubmit(detail.id)
  }

  const confirmCruceAndSubmit = () => {
    if (!detail) return
    setCruceLines(null)
    doSubmit(detail.id)
  }

  const totalConDiferencia = evaluated ? detail?.lines.filter(l => (l.diferencia ?? 0) !== 0).length ?? 0 : null

  return (
    <Card variant="panel" className="p-5 mb-4">
      <div className="mb-4">
        <h2 className="text-base font-bold text-slate-900">{t('bodega:generalCounts.newPanel.title')}</h2>
        <p className="text-xs text-slate-500">{t('bodega:generalCounts.newPanel.subtitle')}</p>
      </div>

      <div className="mb-4 max-w-sm">
        <label className="block text-xs font-semibold text-slate-500 mb-1">{t('bodega:generalCounts.newPanel.warehouseLabel')}</label>
        <select
          value={warehouseId}
          onChange={e => handleWarehouseChange(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="">{t('bodega:generalCounts.newPanel.warehousePlaceholder')}</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      {detail && (
        <div>
          {detail.lines.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">{t('bodega:generalCounts.newPanel.empty')}</p>
          ) : (
            <>
              <Card variant="panel" className="overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <Th>{t('bodega:generalCounts.newPanel.table.reference')}</Th>
                      <Th>{t('bodega:generalCounts.newPanel.table.description')}</Th>
                      <Th>{t('bodega:generalCounts.newPanel.table.systemQuantity')}</Th>
                      <Th>{t('bodega:generalCounts.newPanel.table.countedQuantity')}</Th>
                      {evaluated && <Th>{t('bodega:generalCounts.newPanel.table.difference')}</Th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.lines.map(line => (
                      <tr key={line.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800">{line.producto.reference}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {line.producto.description}
                          {line.tiene_cruce_pendiente && (
                            <div className="flex items-center gap-1 text-[11px] text-amber-700 mt-1">
                              <IcoAlertTriangle size={12} />
                              {t('bodega:generalCounts.newPanel.crossWarning', {
                                date: line.cruce_fecha ? new Date(line.cruce_fecha).toLocaleDateString() : '—',
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{line.cantidad_sistema ?? '—'}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            value={contada[line.id] ?? ''}
                            onChange={e => handleInputChange(line.id, e.target.value)}
                            className="w-24 px-2 py-1.5 border border-slate-300 rounded text-sm"
                          />
                        </td>
                        {evaluated && (
                          <td className="px-4 py-3">
                            {line.diferencia === 0 || line.diferencia === null ? (
                              <span className="text-slate-400">0</span>
                            ) : (
                              <b className={line.diferencia > 0 ? 'text-primary-dark' : 'text-red-600'}>
                                {line.diferencia > 0 ? '+' : ''}{line.diferencia}
                              </b>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {evaluated && totalConDiferencia === 0 && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 mt-3">
                  {t('bodega:generalCounts.newPanel.noDifferences')}
                </p>
              )}

              <div className="flex flex-wrap gap-2 mt-4">
                <Button variant="secondary" onClick={handleEvaluate} loading={evaluate.isPending}>
                  {t('bodega:generalCounts.newPanel.evaluate')}
                </Button>
                <Button onClick={handleSubmitClick} disabled={!evaluated} loading={submit.isPending}>
                  {t('bodega:generalCounts.newPanel.submit')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

      {cruceLines && (
        <CruceConfirmModal
          lines={cruceLines}
          onConfirm={confirmCruceAndSubmit}
          onCancel={() => setCruceLines(null)}
        />
      )}

      {duplicateWarning && (
        <DuplicateProductsModal
          duplicates={duplicateWarning.duplicates}
          onConfirm={() => {
            if (duplicateWarning.type === 'store') { confirmDuplicateAndCreate(duplicateWarning.warehouseId); return }
            doSubmit(duplicateWarning.id, true)
          }}
          onCancel={() => {
            // RN3 (mismo criterio que CruceConfirmModal) — cancelar no crea ni envía nada. En el
            // caso 'store' además se limpia la bodega elegida, porque no se llegó a crear el
            // borrador nuevo.
            if (duplicateWarning.type === 'store') resetPanel()
            setDuplicateWarning(null)
          }}
        />
      )}
    </Card>
  )
}

/** SCRUM-797 (rebote de Gerencia Test 2026-08-27) — mismo patrón visual que `CruceConfirmModal`
 * (nunca `confirm()` nativo), ahora con la lista real de productos en conflicto (antes un único
 * conteo bloqueaba toda la bodega, ver `AdjustmentDuplicateModal` en SolicitudAjustePage.tsx para
 * el mismo patrón de lista ya usado en Solicitud de Ajuste). */
function DuplicateProductsModal({ duplicates, onConfirm, onCancel }: {
  duplicates: GeneralCountDuplicateWarning[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation(['common', 'bodega'])
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:generalCounts.newPanel.duplicateModal.title')}</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        <ul className="text-sm text-slate-600 mb-4 space-y-2 max-h-56 overflow-y-auto">
          {duplicates.map(d => (
            <li key={d.catalog_product_id} className="border-b border-slate-100 pb-2 last:border-0">
              {t('bodega:generalCounts.newPanel.duplicateModal.body', {
                product: d.product_reference ?? d.product_name ?? '—',
                date: new Date(d.general_count.fecha).toLocaleDateString(),
                status: t(`bodega:generalCounts.tray.status.${d.general_count.estado}`),
              })}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{t('common:actions.cancel')}</Button>
          <Button onClick={onConfirm}>{t('bodega:generalCounts.newPanel.duplicateModal.confirm')}</Button>
        </div>
      </Card>
    </div>
  )
}

/** REQ-393/394 — aviso de cruce con solicitud cíclica pendiente ANTES de enviar a aprobación de
 * Mark. Modal propio (nunca `confirm()` nativo — rompe Pre-QA automatizado, ver CLAUDE.md),
 * mismo patrón visual que el resto de modales de Bodega (`Card variant="modal"`). RN3 de REQ-393:
 * cancelar acá NO envía nada — `onCancel` simplemente cierra el modal sin llamar el endpoint. */
function CruceConfirmModal({ lines, onConfirm, onCancel }: {
  lines: GeneralCountLine[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation(['common', 'bodega'])
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:generalCounts.newPanel.cruceModal.title')}</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        <p className="text-sm text-slate-600 mb-3">{t('bodega:generalCounts.newPanel.cruceModal.body')}</p>
        <ul className="list-disc list-inside text-sm text-slate-700 mb-4 space-y-1 max-h-48 overflow-y-auto">
          {lines.map(l => (
            <li key={l.id}>
              <span className="font-semibold">{l.producto.reference}</span> — {l.producto.description}
              {l.cruce_fecha && <span className="text-xs text-slate-400"> ({new Date(l.cruce_fecha).toLocaleDateString()})</span>}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{t('common:actions.cancel')}</Button>
          <Button onClick={onConfirm}>{t('bodega:generalCounts.newPanel.cruceModal.confirm')}</Button>
        </div>
      </Card>
    </div>
  )
}

// ── Panel 2 — "Conteos generales" (SCRUM-465/466) ───────────────────────────────────────────────

const TRAY_CHIPS: GeneralCountChip[] = ['todas', 'pendiente_aprobacion', 'aprobada', 'rechazada']

function CountsTrayPanel({ onContinue }: { onContinue: (row: GeneralCountRow) => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const [chip, setChip] = useState<GeneralCountChip>('todas')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [applyingId, setApplyingId] = useState<number | null>(null)
  // SCRUM-462 — confirmación antes de borrar un borrador (nunca window.confirm(), ver
  // CruceConfirmModal más arriba en este archivo para el mismo criterio).
  const [deletingRow, setDeletingRow] = useState<GeneralCountRow | null>(null)
  // SCRUM-797 RN8/CA5 — "Ver detalle" para CUALQUIER estado (antes solo existía el panel de
  // borrador en vivo, mientras el conteo seguía en pendiente_evaluacion/evaluado).
  const [detailRowId, setDetailRowId] = useState<number | null>(null)

  const { data, isFetching } = useGeneralCounts({
    estado: chip === 'todas' ? undefined : chip,
    page, per_page: perPage,
  })
  const approve = useApproveGeneralCount()
  const apply = useApplyGeneralCount()
  const deleteCount = useDeleteGeneralCount()
  const rows = data?.data ?? []

  const applyRef = useRef(false)
  const handleApply = (id: number) => {
    if (applyRef.current) return
    applyRef.current = true
    setApplyingId(id)
    apply.mutate(id, {
      onSuccess: () => { applyRef.current = false },
      onError:   () => { applyRef.current = false; setApplyingId(null) },
    })
  }

  return (
    <Card variant="panel" className="p-5">
      <div className="mb-4">
        <h2 className="text-base font-bold text-slate-900">{t('bodega:generalCounts.tray.title')}</h2>
        <p className="text-xs text-slate-500">{t('bodega:generalCounts.tray.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TRAY_CHIPS.map(c => (
          <Button
            key={c}
            variant="outline"
            active={chip === c}
            activeVariant="primary"
            className="!text-xs !px-3 !py-1.5"
            onClick={() => { setChip(c); setPage(1) }}
          >
            {t(`bodega:generalCounts.tray.chips.${c}`)}
          </Button>
        ))}
      </div>

      <div className="overflow-hidden overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <Th>{t('bodega:generalCounts.tray.table.warehouse')}</Th>
              <Th>{t('bodega:generalCounts.tray.table.date')}</Th>
              <Th>{t('bodega:generalCounts.tray.table.doneBy')}</Th>
              <Th>{t('bodega:generalCounts.tray.table.productsCounted')}</Th>
              <Th>{t('bodega:generalCounts.tray.table.differencesFound')}</Th>
              <Th>{t('bodega:generalCounts.tray.table.status')}</Th>
              <Th>{t('bodega:generalCounts.tray.table.action')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('bodega:generalCounts.tray.empty')}
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">{row.bodega}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(row.fecha).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-slate-600">{row.realizado_por ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{row.total_productos}</td>
                <td className="px-4 py-3 text-slate-600">
                  {/* RN3 (REQ-395) — corregido en Pre-QA 2026-07-25: el backend ahora expone
                      `diferencias_encontradas` (withCount agregado, sin N+1) en
                      `GeneralCountController::index()`. */}
                  {row.diferencias_encontradas}
                </td>
                <td className="px-4 py-3"><EstadoBadge estado={row.estado} /></td>
                <td className="px-4 py-3">
                  <RowAction
                    row={row}
                    canApprove={data?.can_approve ?? false}
                    onApprove={() => approve.mutate(row.id)}
                    approving={approve.isPending}
                    onReject={() => setRejectingId(row.id)}
                    onApply={() => handleApply(row.id)}
                    applying={applyingId === row.id && apply.isPending}
                    onContinue={() => onContinue(row)}
                    onDelete={() => setDeletingRow(row)}
                    onViewDetail={() => setDetailRowId(row.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <Pagination
          meta={data.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
        />
      )}

      {rejectingId !== null && <RejectModal id={rejectingId} onClose={() => setRejectingId(null)} />}
      {deletingRow !== null && (
        <ConfirmDeleteCountModal
          row={deletingRow}
          deleting={deleteCount.isPending}
          onConfirm={() => deleteCount.mutate(deletingRow.id, { onSuccess: () => setDeletingRow(null) })}
          onCancel={() => setDeletingRow(null)}
        />
      )}
      {detailRowId !== null && <GeneralCountDetailModal id={detailRowId} onClose={() => setDetailRowId(null)} />}
    </Card>
  )
}

/** SCRUM-462 (REQ-392, rebote de Gerencia Test 2026-08-14) — confirmación antes de borrar un
 * conteo en borrador. Modal propio, nunca `confirm()` nativo (mismo criterio que
 * `CruceConfirmModal` de arriba — invisible para la automatización de Playwright). */
function ConfirmDeleteCountModal({ row, deleting, onConfirm, onCancel }: {
  row:       GeneralCountRow
  deleting:  boolean
  onConfirm: () => void
  onCancel:  () => void
}) {
  const { t } = useTranslation(['common', 'bodega'])
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <h3 className="text-base font-bold text-slate-900 mb-2">{t('bodega:generalCounts.tray.deleteModal.title')}</h3>
        <p className="text-sm text-slate-600 mb-4">
          {t('bodega:generalCounts.tray.deleteModal.body', { warehouse: row.bodega })}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{t('common:actions.cancel')}</Button>
          <Button
            variant="outline"
            className="!text-red-600 !border-red-200"
            loading={deleting}
            onClick={onConfirm}
          >
            {t('bodega:generalCounts.tray.actions.delete')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/**
 * SCRUM-463 (rebote de Gerencia Test 2026-08-14) — reemplaza el candado decorativo de
 * SCRUM-465 Escenario 3: Aprobar/Rechazar quedaban visibles/clicables para CUALQUIER perfil de
 * Bodega, con un candado (`IcoLock`) como única afordancia — el backend sí rechazaba (403) a
 * quien no fuera Mark, pero el botón seguía pareciendo funcional. Ahora `GeneralCountController::
 * index()` expone `can_approve` (si el usuario actual ES Mark, `primary_approver_user_id`) — con
 * eso el frontend puede ocultar los botones por completo para todos los demás, en vez de confiar
 * en un candado + el 403 del backend como única defensa real.
 */
function RowAction({ row, canApprove, onApprove, approving, onReject, onApply, applying, onContinue, onDelete, onViewDetail }: {
  row: GeneralCountRow
  canApprove: boolean
  onApprove: () => void
  approving: boolean
  onReject: () => void
  onApply: () => void
  applying: boolean
  onContinue: () => void
  onDelete: () => void
  onViewDetail: () => void
}) {
  const { t } = useTranslation(['common', 'bodega'])
  const isLiderBodega = useAuthStore(s => s.user?.role) === LIDER_BODEGA_ROLE

  // SCRUM-797 RN8/CA5 — link persistente, disponible en TODOS los estados además de la acción
  // primaria de cada uno (antes "Ver motivo" solo existía, como tooltip inerte, para rechazada).
  const viewDetailLink = (
    <button type="button" className="text-slate-500 text-[11px] underline block mt-1" onClick={onViewDetail}>
      {t('bodega:generalCounts.tray.actions.viewDetail')}
    </button>
  )

  // SCRUM-462 (REQ-392, rebote de Gerencia Test 2026-08-14) — un conteo que quedó en borrador
  // (nunca evaluado) o evaluado pero nunca enviado a aprobación quedaba inerte en esta tabla, sin
  // ninguna acción disponible (caía al "—" del final de esta función). Aplica tanto si nunca se
  // evaluó (`pendiente_evaluacion`) como si se evaluó pero no se envió (`evaluado`).
  if (row.estado === 'pendiente_evaluacion' || row.estado === 'evaluado') {
    return (
      <div>
        <div className="flex gap-1.5">
          <Button variant="outline" className="!text-xs !px-2 !py-1" onClick={onContinue}>
            {t('bodega:generalCounts.tray.actions.continue')}
          </Button>
          <Button
            variant="outline"
            className="!text-xs !px-2 !py-1 !text-red-600 !border-red-200"
            onClick={onDelete}
          >
            {t('bodega:generalCounts.tray.actions.delete')}
          </Button>
        </div>
        {viewDetailLink}
      </div>
    )
  }

  if (row.estado === 'pendiente_aprobacion') {
    if (!canApprove) {
      return <div>{viewDetailLink}</div>
    }
    return (
      <div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            className="!text-xs !px-2 !py-1 inline-flex items-center gap-1"
            loading={approving}
            onClick={onApprove}
          >
            {t('bodega:generalCounts.tray.actions.approve')}
          </Button>
          <Button
            variant="outline"
            className="!text-xs !px-2 !py-1 !text-red-600 !border-red-200 inline-flex items-center gap-1"
            onClick={onReject}
          >
            {t('bodega:generalCounts.tray.actions.reject')}
          </Button>
        </div>
        {viewDetailLink}
      </div>
    )
  }

  if (row.estado === 'rechazada') {
    return <div>{viewDetailLink}</div>
  }

  if (row.estado === 'aprobada') {
    if (row.aplicado_at !== null) {
      return (
        <div>
          <span className="text-xs text-slate-400 inline-flex items-center gap-1">
            <IcoCheck size={12} /> {t('bodega:generalCounts.tray.actions.adjustmentApplied')}
          </span>
          {viewDetailLink}
        </div>
      )
    }
    // SCRUM-466 (rebote de Gerencia Test 2026-08-14) — exclusivo del Líder de Bodega (ver
    // constante LIDER_BODEGA_ROLE arriba), OCULTO (no solo deshabilitado) para Mark y cualquier
    // otro perfil de Bodega.
    if (!isLiderBodega) {
      return <div>{viewDetailLink}</div>
    }
    return (
      <div>
        <Button variant="outline" className="!text-xs !px-2 !py-1" loading={applying} onClick={onApply}>
          {t('bodega:generalCounts.tray.actions.applyAdjustment')}
        </Button>
        {viewDetailLink}
      </div>
    )
  }

  return <div>{viewDetailLink}</div>
}

function EstadoBadge({ estado }: { estado: GeneralCountRow['estado'] }) {
  const { t } = useTranslation('bodega')
  const colors: Record<GeneralCountRow['estado'], string> = {
    pendiente_evaluacion:  'bg-slate-100 text-slate-500',
    evaluado:               'bg-slate-100 text-slate-500',
    pendiente_aprobacion:  'bg-amber-50 text-amber-700',
    aprobada:              'bg-emerald-50 text-emerald-700',
    rechazada:             'bg-red-50 text-red-700',
    reemplazada:           'bg-slate-100 text-slate-400',
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${colors[estado]}`}>
      {t(`generalCounts.tray.status.${estado}`)}
    </span>
  )
}

/** RN2 de REQ-395 — no se puede rechazar sin motivo. Mismo patrón que `RejectModal` de
 * `SolicitudAjustePage.tsx`/`RelocationRejectModal` de `BodegasPage.tsx`. */
function RejectModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState(false)
  const reject = useRejectGeneralCount()

  const submit = () => {
    if (motivo.trim() === '') { setError(true); return }
    reject.mutate({ id, motivo }, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:generalCounts.tray.rejectModal.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        <textarea
          value={motivo}
          onChange={e => { setMotivo(e.target.value); setError(false) }}
          placeholder={t('bodega:generalCounts.tray.rejectModal.placeholder')}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-1"
          rows={3}
        />
        {error && <p className="text-red-600 text-xs mb-3">{t('bodega:generalCounts.tray.rejectModal.required')}</p>}
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button onClick={submit} loading={reject.isPending}>{t('bodega:generalCounts.tray.rejectModal.confirm')}</Button>
        </div>
      </Card>
    </div>
  )
}

/** SCRUM-797 RN8/CA5/CA8/CA9 — "Ver detalle" de un conteo en cualquier estado, incl. ya
 * aprobado/aplicado o rechazado (antes solo el panel de borrador en vivo mostraba las líneas,
 * ver `NewCountPanel` arriba en este archivo — una vez resuelto, no había forma de volver a
 * consultarlo). Reusa `useGeneralCountDetail`, el mismo hook que ya usa el flujo de evaluación. */
function GeneralCountDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data, isLoading } = useGeneralCountDetail(id)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">
            {t('bodega:generalCounts.tray.detailModal.title', { warehouse: data?.bodega ?? '' })}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>

        {isLoading || !data ? (
          <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <EstadoBadge estado={data.estado} />
              <span className="text-xs text-slate-400">
                {t('bodega:generalCounts.tray.detailModal.date')}: {new Date(data.fecha).toLocaleDateString()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-slate-400 uppercase tracking-wide mb-0.5">
                  {t('bodega:generalCounts.tray.detailModal.doneBy')}
                </p>
                <p className="text-slate-700 font-medium">{data.realizado_por ?? '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wide mb-0.5">
                  {t('bodega:generalCounts.tray.detailModal.requestedAt')}
                </p>
                <p className="text-slate-700 font-medium">
                  {data.fecha_solicitud_aprobacion
                    ? new Date(data.fecha_solicitud_aprobacion).toLocaleString()
                    : t('bodega:generalCounts.tray.detailModal.requestedAtEmpty')}
                </p>
              </div>
              {(data.estado === 'aprobada' || data.estado === 'rechazada') && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wide mb-0.5">
                    {t('bodega:generalCounts.tray.detailModal.resolvedBy')}
                  </p>
                  <p className="text-slate-700 font-medium">{data.resuelto_por ?? '—'}</p>
                </div>
              )}
            </div>

            {data.estado === 'rechazada' && (
              <div>
                <p className="text-slate-400 uppercase tracking-wide text-xs mb-0.5">
                  {t('bodega:generalCounts.tray.detailModal.rejectionReason')}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{data.motivo_rechazo ?? '—'}</p>
              </div>
            )}

            <div>
              <p className="text-slate-400 uppercase tracking-wide text-xs mb-2">
                {t('bodega:generalCounts.tray.detailModal.lines')}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-1.5 font-semibold text-slate-500 uppercase">
                        {t('bodega:generalCounts.tray.detailModal.product')}
                      </th>
                      <th className="text-left py-1.5 font-semibold text-slate-500 uppercase">
                        {t('bodega:generalCounts.tray.detailModal.systemQty')}
                      </th>
                      <th className="text-left py-1.5 font-semibold text-slate-500 uppercase">
                        {t('bodega:generalCounts.tray.detailModal.countedQty')}
                      </th>
                      <th className="text-left py-1.5 font-semibold text-slate-500 uppercase">
                        {t('bodega:generalCounts.tray.detailModal.difference')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.lines.map((line: GeneralCountLine) => (
                      <tr key={line.id}>
                        <td className="py-1.5 font-medium text-slate-800">{line.producto.description}</td>
                        <td className="py-1.5 text-slate-600">{line.cantidad_sistema ?? '—'}</td>
                        <td className="py-1.5 text-slate-600">
                          {line.cantidad_contada ?? t('bodega:generalCounts.tray.detailModal.pendingEvaluation')}
                        </td>
                        <td className="py-1.5 text-slate-600">{line.diferencia ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}
