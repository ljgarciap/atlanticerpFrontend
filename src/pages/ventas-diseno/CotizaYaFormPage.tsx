import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import { usePermission } from '@/hooks/usePermission'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import QuotePartsList from '@/components/quote/QuotePartsList'
import { QuotePartsApiContext } from '@/components/quote/QuotePartsApiContext'
import { formatMoney } from '@/lib/money'
import type { CotizaYaFields } from '@/types/ventasDiseno'

const inputCls = 'w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]'

/**
 * SCRUM-1120 — formulario de CotizaYA. Solo: nombre del cliente y teléfono (texto libre), descripción, diseñador a cargo,
 * contactos (opcional), observaciones (opcional), Partidas (el mismo componente de Cotizaciones), Totales y Condiciones.
 * El Cliente Master es siempre el fijo «CotizaYA»: no se elige. Nunca crea Lead, proyecto ni tarjeta de Pipeline.
 *
 * El borrador nace en el servidor recién al agregar la primera partida o al Generar (no al abrir el formulario), para
 * no dejar filas vacías cada vez que alguien entra y sale — mismo criterio que SCRUM-912 en Cotizaciones.
 */
export default function VentasDisenoCotizaYaFormPage() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEditConditions = usePermission('ventas_diseno.edit.conditions')

  const [draftId, setDraftId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [description, setDescription] = useState('')
  const [observations, setObservations] = useState('')
  const [conditions, setConditions] = useState<string | null>(null)
  const [contactIds, setContactIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  const { data: ctx } = useQuery({
    queryKey: ['ventas-diseno-cotizaya-context'],
    queryFn:  () => ventasDisenoApi.cotizaya.context(),
  })

  const { data: quote } = useQuery({
    queryKey: ['ventas-diseno-quote', draftId],
    queryFn:  () => ventasDisenoApi.cotizaya.get(draftId as number),
    enabled:  draftId !== null,
  })

  const conditionsText = conditions ?? quote?.conditions_text ?? ctx?.default_conditions_text ?? ''

  // El error de «Falta para generar» deja de ser cierto en cuanto se agrega o quita un ítem (lo hace QuotePartCard, no este formulario).
  const itemCount = quote?.parts.reduce((n, p) => n + p.items.length, 0) ?? 0
  useEffect(() => { setError(null) }, [itemCount])

  function ownFields(): CotizaYaFields {
    return {
      cotizaya_customer_name:  customerName.trim() || null,
      cotizaya_customer_phone: customerPhone.trim() || null,
      description:             description.trim() || null,
      observations:            observations.trim() || null,
      // Solo quien tiene el permiso angosto puede cambiar las Condiciones (el backend lo vuelve a exigir).
      ...(canEditConditions && conditions !== null ? { conditions_text: conditions } : {}),
    }
  }

  function message(err: unknown): string {
    if (isAxiosError(err)) {
      const data = err.response?.data as { message?: string; missing?: string[] } | undefined
      if (data?.missing?.length) return t('ventasDiseno:cotizaya.form.missing', { fields: data.missing.join(', ') })
      if (data?.message) return data.message
    }
    return t('ventasDiseno:cotizaya.form.genericError')
  }

  async function ensureDraft(): Promise<number> {
    if (draftId !== null) return draftId
    const created = await ventasDisenoApi.cotizaya.create(ownFields())
    setDraftId(created.id)
    return created.id
  }

  const addPart = useMutation({
    mutationFn: async () => {
      const id = await ensureDraft()
      const n = (quote?.parts.length ?? 0) + 1
      await ventasDisenoApi.cotizaya.parts.create(id, t('ventasDiseno:cotizaya.form.partDefaultName', { n }))
      return id
    },
    onSuccess: id => { setError(null); qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', id] }) },
    onError:   err => setError(message(err)),
  })

  const generate = useMutation({
    mutationFn: async () => {
      const id = await ensureDraft()
      await ventasDisenoApi.cotizaya.update(id, ownFields())
      for (const contactId of contactIds) {
        await ventasDisenoApi.cotizaya.contacts.create(id, contactId)
      }
      return ventasDisenoApi.cotizaya.generate(id)
    },
    onSuccess: generated => {
      // El detalle lee la MISMA caché que este formulario (['ventas-diseno-quote', id]) y ahí sigue el borrador sin folio:
      // se reemplaza por la cotización ya generada antes de navegar (Pre-QA SCRUM-1120: mostraba «sin folio» y el PDF
      // deshabilitado hasta recargar), y se invalida por si el servidor tiene algo más reciente.
      qc.setQueryData(['ventas-diseno-quote', generated.id], generated)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', generated.id] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-cotizaya-list'] })
      navigate(`/ventas-diseno/cotizaya/${generated.id}`)
    },
    onError: err => setError(message(err)),
  })

  const notConfigured = ctx !== undefined && !ctx.configured
  const designerName = quote?.owner.name ?? (user ? `${user.first_name} ${user.last_name}`.trim() : '')
  const toggleContact = (id: number) =>
    setContactIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  return (
    <QuotePartsApiContext.Provider value={ventasDisenoApi.cotizaya.parts}>
      <div className="mb-4">
        <button onClick={() => navigate('/ventas-diseno/cotizaya')} className="text-[12px] text-[#3D7E7A] mb-1">
          ← {t('ventasDiseno:cotizaya.form.back')}
        </button>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('ventasDiseno:cotizaya.form.title')}</h1>
      </div>

      {notConfigured && (
        <div role="alert" className="mb-3 px-3 py-2 rounded-lg border text-[12.5px] bg-red-50 border-red-200 text-red-700">
          {t('ventasDiseno:cotizaya.form.notConfigured')}
        </div>
      )}

      <Card variant="panel" className="p-4 mb-4">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-3">{t('ventasDiseno:cotizaya.form.mainData')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            {t('ventasDiseno:cotizaya.form.customerName')}
            <input data-testid="cotizaya-customer-name" type="text" maxLength={255} value={customerName} onChange={e => setCustomerName(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            {t('ventasDiseno:cotizaya.form.customerPhone')}
            <input data-testid="cotizaya-customer-phone" type="text" maxLength={50} value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="text-[12px] font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
            {t('ventasDiseno:cotizaya.form.description')}
            <input data-testid="cotizaya-description" type="text" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <div className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            {t('ventasDiseno:cotizaya.form.designer')}
            <div data-testid="cotizaya-designer" className={`${inputCls} mt-1 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}>{designerName || '—'}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[12px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
            {t('ventasDiseno:cotizaya.form.contacts')} <span className="font-normal text-slate-400">{t('ventasDiseno:cotizaya.form.contactsOptional')}</span>
          </div>
          {ctx && ctx.contacts.length === 0 ? (
            <p data-testid="cotizaya-no-contacts" className="text-sm text-slate-400">{t('ventasDiseno:cotizaya.form.noContacts')}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {(ctx?.contacts ?? []).map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={contactIds.includes(c.id)} onChange={() => toggleContact(c.id)} />
                  <span>{c.name}{c.phone ? ` · ${c.phone}` : ''}{c.email ? ` · ${c.email}` : ''}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <label className="block mt-4 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
          {t('ventasDiseno:cotizaya.form.observations')}
          <textarea data-testid="cotizaya-observations" rows={3} maxLength={5000} value={observations} onChange={e => setObservations(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
      </Card>

      <Card variant="panel" className="p-4 mb-4">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-3">{t('ventasDiseno:cotizaya.form.parts')}</h2>

        {quote && (
          <QuotePartsList
            quote={quote}
            discountMode={quote.discount_mode} canEdit={quote.can_edit}
            canSeeCost={user?.modules?.ventas_diseno?.view_team === true}
            minMarginPercent={quote.min_margin_percent} quotePriceType={quote.price_type}
          />
        )}

        {(quote?.parts.length ?? 0) === 0 && (
          <p className="text-sm text-slate-400 mb-3">{t('ventasDiseno:cotizaya.form.noParts')}</p>
        )}

        <Button
          variant="secondary" data-testid="cotizaya-add-part"
          onClick={() => addPart.mutate()} disabled={notConfigured || addPart.isPending} loading={addPart.isPending}
        >
          {t('ventasDiseno:cotizaya.form.addPart')}
        </Button>
      </Card>

      <Card variant="panel" className="p-4 mb-4">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-3">{t('ventasDiseno:cotizaya.form.totals')}</h2>
        <dl className="max-w-xs ml-auto text-sm space-y-1">
          <div className="flex justify-between"><dt>{t('ventasDiseno:cotizaya.form.subtotal')}</dt><dd data-testid="cotizaya-subtotal">${formatMoney(quote?.subtotal ?? 0)}</dd></div>
          <div className="flex justify-between"><dt>{t('ventasDiseno:cotizaya.form.itbms')}</dt><dd data-testid="cotizaya-itbms">${formatMoney(quote?.itbms ?? 0)}</dd></div>
          <div className="flex justify-between font-bold border-t border-slate-200 dark:border-slate-700 pt-1"><dt>{t('ventasDiseno:cotizaya.form.total')}</dt><dd data-testid="cotizaya-total">${formatMoney(quote?.grand_total ?? 0)}</dd></div>
        </dl>
      </Card>

      <Card variant="panel" className="p-4 mb-4">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-2">{t('ventasDiseno:cotizaya.form.conditions')}</h2>
        <textarea
          data-testid="cotizaya-conditions" rows={8} value={conditionsText}
          readOnly={!canEditConditions} onChange={e => setConditions(e.target.value)}
          className={`${inputCls} ${canEditConditions ? '' : 'bg-slate-50 dark:bg-slate-800 text-slate-600'}`}
        />
      </Card>

      {error && (
        <div role="alert" data-testid="cotizaya-error" className="mb-3 px-3 py-2 rounded-lg border text-[12.5px] bg-red-50 border-red-200 text-red-700">{error}</div>
      )}

      <div className="flex justify-end">
        <Button
          variant="primary" data-testid="cotizaya-generate"
          onClick={() => generate.mutate()} disabled={notConfigured || generate.isPending} loading={generate.isPending}
        >
          {generate.isPending ? t('ventasDiseno:cotizaya.form.generating') : t('ventasDiseno:cotizaya.form.generate')}
        </Button>
      </div>
    </QuotePartsApiContext.Provider>
  )
}
