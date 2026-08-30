import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import {
  useCommissionExternalSummary, useArchitectOptions, useUploadArchitectCuentaCobro, useViewArchitectCuentaCobro,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { IcoBarChart, IcoChevronDown, IcoSearch, IcoPaperclip } from '@/components/icons'
import ArchitectFiscalProfileModal from '@/components/admin-contab/ArchitectFiscalProfileModal'
import ArchitectCommissionDetailModal from '@/components/admin-contab/ArchitectCommissionDetailModal'
import type { ArchitectCommissionEstado, ArchitectCommissionProject, ArchitectCommissionRow } from '@/types/adminContab'
import { formatDateShort } from '@/utils/dates'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

const ESTADO_PILL_CLASSES: Record<ArchitectCommissionEstado, string> = {
  aun_no_generada:              'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  pendiente_factura_arquitecto: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  pagada:                       'bg-primary-soft text-primary-dark',
}

const ESTADOS: ArchitectCommissionEstado[] = ['aun_no_generada', 'pendiente_factura_arquitecto', 'pagada']

/**
 * Batch 16 (SCRUM-585→590, REQ-508→513) — Comisiones Externas (arquitectos). Ver
 * ADR-SCRUM585-590-batch16-comisiones-externas.md (docs/adr en atlanticerp-backend) para el alcance
 * exacto de este batch vs. lo diferido a Batch 17 (% editable por proyecto, marcar como pagada,
 * comprobante de retención, recordatorio al arquitecto).
 *
 * Sin distinción `view`/`view_team` (a diferencia de Comisiones Internas) — la audiencia de esta
 * pantalla es Felix/Yaneth/Mark/Gerencia únicamente, todos ven la tabla completa (ver §5 del ADR).
 * "Subir cuenta de cobro" se oculta para Mark/Gerencia (`role: management`) — el backend ya
 * responde 403 para ese rol (REQ-513, sin el carve-out que sí tiene REQ-510), la UI solo evita
 * mostrar un botón que siempre fallaría.
 */
export default function ComisionesExternasPage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const { user } = useAuthStore()
  const canUploadCuentaCobro = user?.role === 'superadmin' || user?.role === 'lider_admin_contab' || user?.role === 'asistente_administrativa'
  // REQ-515/516 — mismo roster amplio del backend (`role:superadmin,lider_admin_contab,
  // asistente_administrativa,management`), que en la práctica es toda la audiencia de esta
  // pantalla (ver docblock de clase) — Marcar como pagado/Proponer %/Recordar están disponibles
  // para cualquiera con acceso acá, solo Decidir % (Aprobar/Rechazar) es exclusivo de Mark.
  const canManage = canUploadCuentaCobro || user?.role === 'management'

  const [search, setSearch]           = useState('')
  const [mes, setMes]                 = useState('')
  const [architectId, setArchitectId] = useState<number | ''>('')
  const [estado, setEstado]           = useState<ArchitectCommissionEstado | ''>('')
  const [expanded, setExpanded]       = useState<number | null>(null)
  const [fiscalModalArchitectId, setFiscalModalArchitectId] = useState<number | null>(null)
  // Guarda solo los IDs, no una copia del arquitecto/proyecto — el modal deriva ambos en vivo de
  // `summary` en cada render (ver `detailTarget` abajo). Guardar el objeto completo en el momento
  // de abrir dejaba el modal con datos congelados: una mutación exitosa DENTRO del modal (proponer
  // %, subir cuenta de cobro, marcar pagado...) invalida la query y `summary` se refresca, pero el
  // objeto guardado en este estado nunca se actualizaba — hallazgo real de Pre-QA en vivo contra
  // dev.atlanticerp.ai (2026-08-25): el banner de "% pendiente de aprobación" nunca aparecía tras
  // proponer, aunque el backend sí había persistido el cambio.
  const [detailTargetId, setDetailTargetId] = useState<{ architectId: number; pipelineCardId: number } | null>(null)

  const filters = {
    search: search.trim() !== '' ? search.trim() : undefined,
    mes: mes !== '' ? mes : undefined,
    architect_id: architectId !== '' ? architectId : undefined,
    estado: estado !== '' ? estado : undefined,
  }
  const { data: summary, isFetching } = useCommissionExternalSummary(filters)
  const { data: architectOptions } = useArchitectOptions()

  const fiscalModalArchitect = fiscalModalArchitectId !== null
    ? summary?.arquitectos.find(a => a.architect_id === fiscalModalArchitectId) ?? null
    : null

  const detailTargetArchitect = detailTargetId !== null
    ? summary?.arquitectos.find(a => a.architect_id === detailTargetId.architectId) ?? null
    : null
  const detailTargetProject = detailTargetId !== null
    ? detailTargetArchitect?.proyectos.find(p => p.pipeline_card_id === detailTargetId.pipelineCardId) ?? null
    : null

  const cards = useMemo(() => ([
    { label: t('adminContab:comisionesExternas.stats.comisionGenerada'), value: summary ? formatCurrency(summary.comision_generada) : '—', sub: t('adminContab:comisionesExternas.stats.comisionGeneradaSub') },
    { label: t('adminContab:comisionesExternas.stats.pagadaTotal'), value: summary ? formatCurrency(summary.pagada_total) : '—', sub: t('adminContab:comisionesExternas.stats.pagadaTotalSub') },
    { label: t('adminContab:comisionesExternas.stats.pagadoEsteMes'), value: summary ? formatCurrency(summary.pagado_este_mes) : '—', sub: t('adminContab:comisionesExternas.stats.pagadoEsteMesSub') },
    { label: t('adminContab:comisionesExternas.stats.pendienteFactura'), value: summary ? formatCurrency(summary.pendiente_factura) : '—', sub: t('adminContab:comisionesExternas.stats.pendienteFacturaSub') },
    { label: t('adminContab:comisionesExternas.stats.aunNoGenerada'), value: summary ? formatCurrency(summary.aun_no_generada) : '—', sub: t('adminContab:comisionesExternas.stats.aunNoGeneradaSub') },
  ]), [summary, t])

  const hasActiveFilters = search !== '' || mes !== '' || architectId !== '' || estado !== ''
  function clearFilters() {
    setSearch(''); setMes(''); setArchitectId(''); setEstado('')
  }

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-center gap-2 mb-1">
        <IcoBarChart size={20} className="text-slate-500 dark:text-slate-400" />
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('adminContab:comisionesExternas.title')}</h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('adminContab:comisionesExternas.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
        {cards.map(c => (
          <Card key={c.label} variant="panel" className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{c.label}</div>
            <div className="text-xl font-bold text-primary-dark">{c.value}</div>
            <div className="text-[10.5px] text-slate-400 mt-1">{c.sub}</div>
          </Card>
        ))}
      </div>

      <Card variant="panel" className="p-4 mt-6">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="relative">
            <IcoSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('adminContab:comisionesExternas.filtros.buscarPlaceholder')}
              className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 pl-8 pr-3 py-2 text-xs text-slate-600 dark:text-slate-300 w-56"
            />
          </div>

          <select
            value={mes} onChange={e => setMes(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300"
          >
            <option value="">{t('adminContab:comisionesExternas.filtros.todosMeses')}</option>
            {(summary?.meses_disponibles ?? []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select
            value={architectId} onChange={e => setArchitectId(e.target.value === '' ? '' : Number(e.target.value))}
            className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300"
          >
            <option value="">{t('adminContab:comisionesExternas.filtros.todosArquitectos')}</option>
            {(architectOptions ?? []).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>

          <select
            value={estado} onChange={e => setEstado(e.target.value as ArchitectCommissionEstado | '')}
            className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300"
          >
            <option value="">{t('adminContab:comisionesExternas.filtros.todosEstados')}</option>
            {ESTADOS.map(e => <option key={e} value={e}>{t(`adminContab:comisionesExternas.estados.${e}`)}</option>)}
          </select>

          {hasActiveFilters && (
            <button
              type="button" onClick={clearFilters}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-auto"
            >
              {t('adminContab:comisionesExternas.filtros.limpiar')}
            </button>
          )}
        </div>

        <div className="text-[11px] text-slate-400 mb-2">
          {t('adminContab:comisionesExternas.resultCount', { count: summary?.arquitectos.length ?? 0 })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2 pr-3 w-6" />
                <th className="py-2 pr-3">{t('adminContab:comisionesExternas.columnas.arquitecto')}</th>
                <th className="py-2 pr-3">{t('adminContab:comisionesExternas.columnas.empresa')}</th>
                <th className="py-2 pr-3">{t('adminContab:comisionesExternas.columnas.generada')}</th>
                <th className="py-2 pr-3">{t('adminContab:comisionesExternas.columnas.pagada')}</th>
                <th className="py-2 pr-3">{t('adminContab:comisionesExternas.columnas.pendiente')}</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {(summary?.arquitectos ?? []).map(a => (
                <ArchitectRow
                  key={a.architect_id} architect={a} expanded={expanded === a.architect_id}
                  onToggle={() => setExpanded(prev => prev === a.architect_id ? null : a.architect_id)}
                  onEditFiscal={() => setFiscalModalArchitectId(a.architect_id)}
                  onOpenDetail={p => setDetailTargetId({ architectId: a.architect_id, pipelineCardId: p.pipeline_card_id })}
                  canUploadCuentaCobro={canUploadCuentaCobro}
                  t={t}
                />
              ))}
            </tbody>
          </table>
          {!isFetching && (summary?.arquitectos.length ?? 0) === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">{t('adminContab:comisionesExternas.vacio')}</p>
          )}
        </div>

        <p className="text-[10.5px] text-slate-400 mt-4">{t('adminContab:comisionesExternas.footnote')}</p>
      </Card>

      {fiscalModalArchitect && (
        <ArchitectFiscalProfileModal architect={fiscalModalArchitect} onClose={() => setFiscalModalArchitectId(null)} />
      )}

      {detailTargetArchitect && detailTargetProject && (
        <ArchitectCommissionDetailModal
          architect={detailTargetArchitect} project={detailTargetProject}
          canManage={canManage} canUploadCuentaCobro={canUploadCuentaCobro}
          puedeDecidirPorcentaje={summary?.puede_decidir_porcentaje ?? false}
          onClose={() => setDetailTargetId(null)}
          onEditFiscal={() => { setFiscalModalArchitectId(detailTargetArchitect.architect_id); setDetailTargetId(null) }}
        />
      )}
    </div>
  )
}

function ArchitectRow(
  { architect, expanded, onToggle, onEditFiscal, onOpenDetail, canUploadCuentaCobro, t }:
  {
    architect: ArchitectCommissionRow; expanded: boolean; onToggle: () => void; onEditFiscal: () => void
    onOpenDetail: (project: ArchitectCommissionProject) => void
    canUploadCuentaCobro: boolean
    t: (key: string, opts?: Record<string, unknown>) => string
  },
) {
  const regimenLabel = architect.regimen_fiscal
    ? t(`adminContab:comisionesExternas.regimenes.${architect.regimen_fiscal}`)
    : t('adminContab:comisionesExternas.sinRegimen')

  return (
    <>
      <tr onClick={onToggle} className="border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <td className="py-2.5 pr-3">
          <IcoChevronDown size={13} className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </td>
        <td className="py-2.5 pr-3 font-medium text-slate-800 dark:text-slate-100">
          {architect.nombre}
          {!architect.datos_fiscales_completos && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              {t('adminContab:comisionesExternas.datosFiscalesFaltantes')}
            </span>
          )}
          <span className="block text-[10.5px] font-normal text-slate-400">
            {t('adminContab:comisionesExternas.proyectosReferidos', { count: architect.proyectos.length })} · {regimenLabel}
          </span>
        </td>
        <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-200">{architect.empresa ?? '—'}</td>
        <td className="py-2.5 pr-3 font-semibold text-primary-dark">{formatCurrency(architect.generada)}</td>
        <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-200">{formatCurrency(architect.pagada)}</td>
        <td className="py-2.5 pr-3 text-amber-700 dark:text-amber-400">{formatCurrency(architect.pendiente)}</td>
        <td className="py-2.5 pr-3">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onEditFiscal() }}
            className="text-xs font-medium text-primary-dark hover:underline"
          >
            {t('adminContab:comisionesExternas.editarDatosFiscales')}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/60 dark:bg-slate-900/30">
          <td colSpan={7} className="px-4 py-3">
            {architect.proyectos.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">{t('adminContab:comisionesExternas.sinProyectos')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[1200px]">
                  <thead>
                    <tr className="text-left text-[10px] font-medium text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                      <th className="py-1.5 pr-3">{t('adminContab:comisionesExternas.detalle.cliente')}</th>
                      <th className="py-1.5 pr-3">{t('adminContab:comisionesExternas.detalle.pedido')}</th>
                      <th className="py-1.5 pr-3">{t('adminContab:comisionesExternas.detalle.fechaPedido')}</th>
                      <th className="py-1.5 pr-3">{t('adminContab:comisionesExternas.detalle.montoProyecto')}</th>
                      <th className="py-1.5 pr-3">{t('adminContab:comisionesExternas.detalle.comision')}</th>
                      <th className="py-1.5 pr-3">{t('adminContab:comisionesExternas.detalle.impuesto')}</th>
                      <th className="py-1.5 pr-3">{t('adminContab:comisionesExternas.detalle.total')}</th>
                      <th className="py-1.5 pr-3">{t('adminContab:comisionesExternas.detalle.estado')}</th>
                      <th className="py-1.5 pr-3">{t('adminContab:comisionesExternas.detalle.cuentaCobro')}</th>
                      <th className="py-1.5 pr-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {architect.proyectos.map(p => (
                      <ProjectRow
                        key={p.pipeline_card_id} project={p} canUploadCuentaCobro={canUploadCuentaCobro}
                        onOpenDetail={() => onOpenDetail(p)} t={t}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function ProjectRow(
  { project, canUploadCuentaCobro, onOpenDetail, t }:
  {
    project: ArchitectCommissionProject; canUploadCuentaCobro: boolean; onOpenDetail: () => void
    t: (key: string, opts?: Record<string, unknown>) => string
  },
) {
  const sinDato = t('adminContab:comisionesExternas.detalle.sinDato')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadArchitectCuentaCobro()
  const viewMutation   = useViewArchitectCuentaCobro()

  function handleFileChange(file: File | undefined) {
    if (!file) return
    uploadMutation.mutate({ pipelineCardId: project.pipeline_card_id, file })
  }

  function handleView() {
    viewMutation.mutate(project.pipeline_card_id, {
      onSuccess: ({ url }) => window.open(url, '_blank', 'noopener,noreferrer'),
    })
  }

  return (
    <tr className="border-b border-slate-50 dark:border-slate-800">
      <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">{project.cliente ?? sinDato}</td>
      <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{project.numero_pedido ?? sinDato}</td>
      <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{project.fecha_pedido ? formatDateShort(project.fecha_pedido) : sinDato}</td>
      <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">{formatCurrency(project.monto_proyecto)}</td>
      <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">{formatCurrency(project.comision)}</td>
      <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">{project.impuesto !== null ? formatCurrency(project.impuesto) : sinDato}</td>
      <td className="py-1.5 pr-3 font-medium text-slate-800 dark:text-slate-100">{project.total !== null ? formatCurrency(project.total) : sinDato}</td>
      <td className="py-1.5 pr-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${ESTADO_PILL_CLASSES[project.estado]}`}>
          {t(`adminContab:comisionesExternas.estados.${project.estado}`)}
        </span>
      </td>
      <td className="py-1.5 pr-3">
        {project.cuenta_cobro ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleView} className="text-primary-dark hover:underline truncate max-w-[140px]">
              {project.cuenta_cobro.nombre_archivo}
            </button>
            {canUploadCuentaCobro && (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                {t('adminContab:comisionesExternas.detalle.reemplazar')}
              </button>
            )}
          </div>
        ) : canUploadCuentaCobro ? (
          <button
            type="button" onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 text-primary-dark hover:underline"
          >
            <IcoPaperclip size={12} /> {t('adminContab:comisionesExternas.detalle.subir')}
          </button>
        ) : (
          <span className="text-slate-400">{sinDato}</span>
        )}
        {canUploadCuentaCobro && (
          <input
            ref={fileInputRef} type="file" accept="image/jpeg,image/png,.pdf" className="hidden"
            onChange={e => handleFileChange(e.target.files?.[0])}
          />
        )}
      </td>
      <td className="py-1.5 pr-3">
        <button type="button" onClick={onOpenDetail} className="text-primary-dark hover:underline">
          {t('adminContab:comisionesExternas.detalle.verDetalle')}
        </button>
      </td>
    </tr>
  )
}
