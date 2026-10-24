import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { LegacyHistoryEntidad } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { LegacyDocumentoFicha } from '@/components/legacy/LegacyDocumentoFicha'
import { IcoClose } from '@/components/icons'

interface Props {
  subClientId:   number
  subClientName: string
  onClose:       () => void
}

const ENTITIES: LegacyHistoryEntidad[] = ['cotizaciones', 'pedidos', 'albaranes', 'facturas']

// SCRUM-762 (épica SCRUM-749 — Migración ICG→AtlanticERP) — pestaña "Historial ICG", solo lectura, en
// el detalle de Subcliente. Nunca incluye Pagos (ver docblock de LegacyHistoryEntidad) ni ningún
// control de edición/creación — el dato importado nunca se edita desde AtlanticERP (§0 del diseño de
// migración).
//
// Vista "gemela" tipo documento (cabecera + líneas) al hacer click en una fila — a pedido de Luis
// 2026-09-02, sin referencia visual real de ICG disponible: layout estándar de ERP-POS (cabecera
// + tabla de ítems), decisión explícita. Facturas nunca trae líneas (`items === null`, ver
// SubClientHistoryController::showFactura) — se muestra una nota, no una tabla vacía.
export default function SubClientIcgHistoryModal({ subClientId, subClientName, onClose }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const [entidad, setEntidad] = useState<LegacyHistoryEntidad>('cotizaciones')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data: result, isLoading } = useQuery({
    queryKey: ['sub-client-icg-history', subClientId, entidad, page, perPage],
    queryFn:  () => ventasDisenoApi.subClients.history(subClientId, entidad, page, perPage),
    enabled:  selectedId === null,
  })

  const { data: document, isLoading: isLoadingDocument } = useQuery({
    queryKey: ['sub-client-icg-history-document', subClientId, entidad, selectedId],
    queryFn:  () => ventasDisenoApi.subClients.historyShow(subClientId, entidad, selectedId as number),
    enabled:  selectedId !== null,
  })

  function selectEntidad(next: LegacyHistoryEntidad) {
    setEntidad(next)
    setPage(1)
    setSelectedId(null)
  }

  const rows = result?.data ?? []

  return (
    <div data-testid="historial-icg-modal" className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:clients.icgHistoryModal.title', { name: subClientName })}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        {selectedId === null && (
          <div className="px-5 pt-3 flex gap-2 flex-wrap shrink-0">
            {ENTITIES.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => selectEntidad(e)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  entidad === e
                    ? 'bg-[#5BA5A0] text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {t(`ventasDiseno:clients.icgHistoryModal.entidad.${e}`)}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {selectedId !== null ? (
            <LegacyDocumentoFicha
              isLoading={isLoadingDocument}
              header={document?.header ?? null}
              items={document?.items ?? null}
            />
          ) : isLoading ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : rows.length === 0 ? (
            <p className="text-slate-400 text-sm">{t('ventasDiseno:clients.icgHistoryModal.empty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-2 pr-2">{t('ventasDiseno:clients.icgHistoryModal.numero')}</th>
                  <th className="py-2 pr-2">{t('ventasDiseno:clients.icgHistoryModal.fecha')}</th>
                  <th className="py-2 pr-2">{t('ventasDiseno:clients.icgHistoryModal.total')}</th>
                  <th className="py-2 pr-2">{t('ventasDiseno:clients.icgHistoryModal.estado')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="py-2 pr-2 text-slate-700 dark:text-slate-200 font-semibold">{row.numero}</td>
                    <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">{row.fecha ?? '—'}</td>
                    <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">
                      {row.total != null ? `$${Number(row.total).toLocaleString()}` : '—'}
                    </td>
                    <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">{row.estado ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {selectedId === null && result && result.total > 0 && (
            <Pagination
              meta={{ total: result.total, per_page: result.per_page, current_page: result.current_page, last_page: result.last_page }}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={p => { setPerPage(p); setPage(1) }}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          {selectedId !== null && (
            <Button variant="secondary" onClick={() => setSelectedId(null)}>
              {t('ventasDiseno:clients.icgHistoryModal.back')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}

