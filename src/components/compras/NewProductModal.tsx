import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { comprasApi } from '@/api/comprasApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'
import type { NewCatalogProductPayload } from '@/types/compras'

const CATALOG_PRODUCT_CATEGORIES = [
  'candelabros_colgantes', 'iluminacion_techo', 'apliques_pared', 'iluminacion_bano',
  'iluminacion_exterior', 'lamparas_piso_mesa', 'iluminacion_empotrada', 'bombillos',
] as const

const CATALOG_PRODUCT_ROTATIONS = ['alta', 'media', 'baja', 'unica'] as const

// REQ-131: reference/description/price_full/cost obligatorios; factory_reference/brand/
// reorder_point/category/rotation opcionales. La unicidad de referencias es propiedad del
// backend (StorePurchaseOrderRequest — 422 al crear la orden, incl. otras líneas de la misma
// orden), pero eso dejaba al usuario completar todo el formulario para enterarse recién al
// final. SCRUM-194: precheck async contra GET /compras/products antes de aceptar la línea —
// mismo criterio de unicidad que el backend (ver onSubmit), UX únicamente, no reemplaza la
// validación server-side.
function buildSchema(t: TFunction) {
  return z.object({
    reference:         z.string().min(1, t('compras:providerForm.validation.nameRequired')).max(255),
    factory_reference: z.string().max(255).nullable().optional(),
    // SCRUM-768 (hallazgo de Daniela Amaya 2026-08-16): el backend (StorePurchaseOrderRequest)
    // exige `lines.*.new_product.name` desde SCRUM-237/240 (nombre y descripción son campos
    // independientes) — este modal nunca lo mandaba, la orden siempre rebotaba 422.
    name:                z.string().min(1, t('compras:providerForm.validation.nameRequired')).max(255),
    description:       z.string().min(1, t('compras:providerForm.validation.nameRequired')).max(255),
    brand:              z.string().max(255).nullable().optional(),
    price_full:          z.coerce.number().min(0),
    cost:                z.coerce.number().min(0),
    reorder_point:        z.coerce.number().int().min(0).nullable().optional(),
    // El select renderiza una opción vacía ("—", categoría opcional) — se normaliza a null antes
    // de validar contra el enum, mismo criterio que ProviderFormDrawer (SCRUM-189/194).
    category:             z.preprocess(
                            v => (v === '' ? null : v),
                            z.enum(CATALOG_PRODUCT_CATEGORIES).nullable().optional(),
                          ),
    rotation:             z.enum(CATALOG_PRODUCT_ROTATIONS).nullable().optional(),
    // SCRUM-194 (REQ-131, mockup 2H) — toggle $ monto / % del costo, sustituye el % único de antes.
    additional_cost_amount: z.coerce.number().min(0).nullable().optional(),
    additional_cost_type:   z.enum(['monto', 'porcentaje']),
  })
}
type FormData = z.infer<ReturnType<typeof buildSchema>>

interface Props {
  // SCRUM-194: necesario para el precheck de referencia de fábrica, que solo bloquea si el
  // match encontrado pertenece a ESTE proveedor (mismo criterio que uniqueFactoryReferenceRule()
  // en el backend) — la referencia pública en cambio se chequea sin acotar a proveedor.
  providerId: number
  onClose: () => void
  onAdd:   (
    product: NewCatalogProductPayload,
    additionalCostAmount: number | null,
    additionalCostType: 'monto' | 'porcentaje' | null,
  ) => void
}

export default function NewProductModal({ providerId, onClose, onAdd }: Props) {
  const { t } = useTranslation(['common', 'compras'])
  const schema = useMemo(() => buildSchema(t), [t])
  const {
    register, handleSubmit, watch, setError, clearErrors, formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { additional_cost_type: 'monto' },
  })

  const cost = watch('cost')
  const additionalCostAmount = watch('additional_cost_amount')
  const additionalCostType = watch('additional_cost_type')
  const estimate = cost && additionalCostAmount && additionalCostType === 'porcentaje'
    ? (Number(cost) * Number(additionalCostAmount) / 100).toFixed(2)
    : null

  // Limpia el error "manual" (duplicado) apenas la persona edita el campo que lo disparó — si no
  // quedaría pegado con el valor viejo aunque ya haya cambiado la referencia.
  const referenceValue = watch('reference')
  const factoryReferenceValue = watch('factory_reference')
  useEffect(() => {
    if (errors.reference?.type === 'manual') clearErrors('reference')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceValue])
  useEffect(() => {
    if (errors.factory_reference?.type === 'manual') clearErrors('factory_reference')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryReferenceValue])

  const [checkingReference, setCheckingReference] = useState(false)

  const onSubmit = async (data: FormData) => {
    const reference = data.reference.trim()
    const factoryReference = data.factory_reference?.trim() || null

    setCheckingReference(true)
    try {
      // Referencia pública: cualquier match existente bloquea, sin importar el proveedor —
      // mismo criterio que uniquePublicReferenceRule() (backend).
      const publicMatches = await comprasApi.products.search(undefined, reference)
      const hasDuplicatePublicReference = publicMatches.data.some(
        p => p.reference.trim().toLowerCase() === reference.toLowerCase(),
      )
      if (hasDuplicatePublicReference) {
        setError('reference', {
          type: 'manual',
          message: t('compras:newOrder.newProduct.validation.duplicateReference'),
        })
        return
      }

      // Referencia de fábrica: solo bloquea si el match es del MISMO proveedor — mismo criterio
      // que uniqueFactoryReferenceRule() (backend). Buscar acotado a providerId, no global.
      if (factoryReference) {
        const factoryMatches = await comprasApi.products.search(providerId, factoryReference)
        const hasDuplicateFactoryReference = factoryMatches.data.some(
          p => p.factory_reference?.trim().toLowerCase() === factoryReference.toLowerCase(),
        )
        if (hasDuplicateFactoryReference) {
          setError('factory_reference', {
            type: 'manual',
            message: t('compras:newOrder.newProduct.validation.duplicateFactoryReference'),
          })
          return
        }
      }
    } catch {
      // El precheck es solo UX — si falla la request (red, etc.), no bloquea la línea acá; el
      // backend sigue siendo la fuente de verdad y responde 422 al crear la orden si corresponde.
    } finally {
      setCheckingReference(false)
    }

    onAdd(
      {
        reference: data.reference,
        factory_reference: data.factory_reference || null,
        name: data.name,
        description: data.description,
        brand: data.brand || null,
        price_full: data.price_full,
        cost: data.cost,
        reorder_point: data.reorder_point ?? null,
        category: data.category ?? null,
        rotation: data.rotation ?? null,
      },
      data.additional_cost_amount ?? null,
      data.additional_cost_amount != null ? data.additional_cost_type : null,
    )
  }

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
     ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`

  return (
    <div className="fixed inset-0 bg-black/30 z-[2100] flex items-center justify-center p-4">
      <Card variant="modal" className="p-6 max-w-lg w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800 text-base">{t('compras:newOrder.newProduct.title')}</h2>
          <Button type="button" variant="icon" onClick={onClose}><IcoClose size={16} /></Button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('compras:newOrder.newProduct.reference')} *
              </label>
              <input {...register('reference')} className={inputCls(!!errors.reference)} />
              {errors.reference && <p className="text-red-500 text-xs mt-1">{errors.reference.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('compras:newOrder.newProduct.factoryReference')}
              </label>
              <input {...register('factory_reference')} className={inputCls(!!errors.factory_reference)} />
              {errors.factory_reference && (
                <p className="text-red-500 text-xs mt-1">{errors.factory_reference.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('compras:newOrder.newProduct.name')} *
            </label>
            <input {...register('name')} className={inputCls(!!errors.name)} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('compras:newOrder.newProduct.description')} *
            </label>
            <input {...register('description')} className={inputCls(!!errors.description)} />
            {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('compras:newOrder.newProduct.brand')}
            </label>
            <input {...register('brand')} className={inputCls(false)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('compras:newOrder.newProduct.category')}
              </label>
              <select {...register('category')} className={inputCls(false)}>
                <option value="">—</option>
                {CATALOG_PRODUCT_CATEGORIES.map(c => (
                  <option key={c} value={c}>{t(`compras:newOrder.newProduct.categories.${c}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('compras:newOrder.newProduct.rotation')}
              </label>
              <select {...register('rotation')} className={inputCls(false)} defaultValue="media">
                {CATALOG_PRODUCT_ROTATIONS.map(r => (
                  <option key={r} value={r}>{t(`compras:newOrder.newProduct.rotations.${r}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('compras:newOrder.newProduct.priceFull')} *
              </label>
              <input type="number" step="0.01" {...register('price_full')} className={inputCls(!!errors.price_full)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('compras:newOrder.newProduct.cost')} *
              </label>
              <input type="number" step="0.01" {...register('cost')} className={inputCls(!!errors.cost)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('compras:newOrder.newProduct.reorderPoint')}
              </label>
              <input type="number" {...register('reorder_point')} className={inputCls(false)} />
            </div>
          </div>

          {/* SCRUM-194 (REQ-131, mockup 2H) — toggle $ monto / % del costo, sustituye el % único. */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('compras:newOrder.newProduct.additionalCost')}
            </label>
            <div className="flex gap-2">
              <input
                type="number" step="0.01"
                {...register('additional_cost_amount')}
                className={inputCls(false) + ' flex-1'}
              />
              {/* Hallazgo Pre-QA 2026-08-04 (reporte de Daniela Amaya, mismo dia): inputCls() ya trae
                  "w-full", y Tailwind emite esa utilidad DESPUES de "w-32" en el stylesheet
                  compilado -- w-full ganaba el cascade pese a estar antes en el string de clases,
                  el select terminaba ocupando ~100% de la fila (428px medido) y dejaba el input de
                  monto en ~26px, ilegible para escribir/leer. Fix: className explicito para el
                  select (sin w-full) en vez de reusar inputCls(). */}
              <select
                {...register('additional_cost_type')}
                className="w-32 shrink-0 px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
              >
                <option value="monto">{t('compras:newOrder.newProduct.additionalCostMonto')}</option>
                <option value="porcentaje">{t('compras:newOrder.newProduct.additionalCostPorcentaje')}</option>
              </select>
            </div>
            {estimate && (
              <p className="text-slate-400 text-xs mt-1">
                {t('compras:newOrder.newProduct.additionalCostEstimate', { amount: `$${estimate}` })}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('compras:providerForm.actions.cancel')}
            </Button>
            <Button type="submit" loading={checkingReference} disabled={checkingReference}>
              {t('compras:newOrder.products.add')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
