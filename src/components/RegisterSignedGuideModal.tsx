import { useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { useTeamMembersByRole, useRegisterSignedGuide } from '@/hooks/useBodega'
import type { OrderCard } from '@/types/bodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPaperclip } from '@/components/icons'

interface Props {
  order:   OrderCard
  onClose: () => void
}

const MAX_SIZE_BYTES = 20 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf']

/**
 * SCRUM-399 (REQ-329) — "Confirmar Guía Firmada" (Despachado -> Entregado, automático — no hay
 * botón de avance manual aparte de esto). Contrato real: `POST .../register-signed-guide`
 * (multipart) exige `delivered_by_courier_id` (quién ENTREGÓ, el repartidor) + `received_by_name`
 * (quién RECIBIÓ/firmó, Pre-QA 2026-07-23 CRÍTICO — dato distinto, antes no existía en ningún
 * lado) + el archivo de la guía firmada.
 *
 * "Quién entregó" usa `useTeamMembersByRole('courier', ...)` (`GET /bodega/team-members?role=
 * courier`) — se preselecciona el repartidor que ya quedó asignado al pedido (`order.repartidor`,
 * solo el NOMBRE ya resuelto server-side, `OrderCard` no expone `courier_id`) resolviendo el id
 * por coincidencia de nombre contra el equipo; el select queda editable por si quien realmente
 * entregó fue otra persona del equipo. Fix de regresión cruzada (2026-07-28): antes reusaba
 * `useBodegaHomeTeam` (`/bodega/home/team`), que al restringirse a solo Asistentes (SCRUM-366)
 * devolvía `data: []` acá — el select quedaba siempre vacío, sin preselección posible.
 */
export default function RegisterSignedGuideModal({ order, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: team } = useTeamMembersByRole('courier', true)
  const registerSignedGuide = useRegisterSignedGuide()

  const preselectedCourierId = useMemo(
    () => team?.data.find(m => m.name === order.repartidor)?.id ?? '',
    [team, order.repartidor],
  )

  const [courierId, setCourierId] = useState<number | ''>('')
  const [courierTouched, setCourierTouched] = useState(false)
  const effectiveCourierId = courierTouched ? courierId : preselectedCourierId

  const [receivedByName, setReceivedByName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<{ courier?: string; receivedBy?: string; file?: string; general?: string }>({})
  const inputRef = useRef<HTMLInputElement>(null)

  function validateAndSetFile(candidate: File) {
    const ext = candidate.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setErrors(e => ({ ...e, file: t('bodega:pedidos.signedGuideModal.errors.invalidType') }))
      return
    }
    if (candidate.size > MAX_SIZE_BYTES) {
      setErrors(e => ({ ...e, file: t('bodega:pedidos.signedGuideModal.errors.tooLarge') }))
      return
    }
    setErrors(e => ({ ...e, file: undefined }))
    setFile(candidate)
  }

  function handleApiError(err: unknown) {
    const message = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err)
      ? Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message
      : undefined
    setErrors(e => ({ ...e, general: message ?? t('bodega:pedidos.signedGuideModal.errors.saveFailed') }))
  }

  function handleSave() {
    const nextErrors: typeof errors = {}
    if (effectiveCourierId === '') nextErrors.courier = t('bodega:pedidos.signedGuideModal.errors.courierRequired')
    if (receivedByName.trim() === '') nextErrors.receivedBy = t('bodega:pedidos.signedGuideModal.errors.receivedByRequired')
    if (!file) nextErrors.file = t('bodega:pedidos.signedGuideModal.errors.fileRequired')

    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return }
    setErrors({})

    registerSignedGuide.mutate(
      {
        orderId: order.id,
        payload: {
          delivered_by_courier_id: effectiveCourierId as number,
          received_by_name:        receivedByName.trim(),
          file:                    file as File,
        },
      },
      { onSuccess: onClose, onError: handleApiError },
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" data-testid="signed-guide-modal">
      <Card variant="modal" className="w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:pedidos.signedGuideModal.title')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          {t('bodega:pedidos.signedGuideModal.subtitle', { number: order.order_number })}
        </p>

        <div className="mb-3">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('bodega:pedidos.signedGuideModal.deliveredBy')}
          </label>
          <select
            value={effectiveCourierId}
            onChange={e => { setCourierTouched(true); setCourierId(e.target.value === '' ? '' : Number(e.target.value)) }}
            data-testid="signed-guide-courier-select"
            className={[
              'w-full text-sm rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border focus:outline-none',
              errors.courier ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-slate-200 dark:border-slate-600 focus:border-primary',
            ].join(' ')}
          >
            <option value="">{t('bodega:pedidos.signedGuideModal.deliveredByPlaceholder')}</option>
            {(team?.data ?? []).map(member => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
          {errors.courier && <p className="text-red-600 text-xs mt-1" data-testid="signed-guide-courier-error">{errors.courier}</p>}
        </div>

        <div className="mb-3">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('bodega:pedidos.signedGuideModal.receivedBy')}
          </label>
          <input
            type="text"
            value={receivedByName}
            onChange={e => setReceivedByName(e.target.value)}
            placeholder={t('bodega:pedidos.signedGuideModal.receivedByPlaceholder')}
            maxLength={255}
            data-testid="signed-guide-received-by-input"
            className={[
              'w-full text-sm rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border focus:outline-none',
              errors.receivedBy ? 'border-red-400 focus:ring-2 focus:ring-red-200' : 'border-slate-200 dark:border-slate-600 focus:border-primary',
            ].join(' ')}
          />
          {errors.receivedBy && <p className="text-red-600 text-xs mt-1" data-testid="signed-guide-received-by-error">{errors.receivedBy}</p>}
        </div>

        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
          {t('bodega:pedidos.signedGuideModal.fileLabel')}
        </label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) validateAndSetFile(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          data-testid="signed-guide-dropzone"
          className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl py-6 text-xs text-slate-500 hover:border-primary hover:text-primary transition-colors"
        >
          <IcoPaperclip size={20} />
          {file ? t('bodega:pedidos.signedGuideModal.selectedFile', { name: file.name }) : t('bodega:pedidos.signedGuideModal.dropzone')}
        </button>
        {errors.file && <p className="text-red-600 text-xs mt-2" data-testid="signed-guide-file-error">{errors.file}</p>}
        {errors.general && <p className="text-red-600 text-xs mt-2" data-testid="signed-guide-general-error">{errors.general}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button
            onClick={handleSave}
            loading={registerSignedGuide.isPending}
            disabled={registerSignedGuide.isPending}
            data-testid="signed-guide-confirm"
          >
            {t('bodega:pedidos.signedGuideModal.confirm')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
