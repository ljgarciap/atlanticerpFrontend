import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import { useUnsavedQuoteGuard } from '@/store/unsavedQuoteGuard'
import { usePermission } from '@/hooks/usePermission'
import type {
  ContactRole, SubClientContact, SubClientRef, MasterClientRef, ClientDetail, SubClientDetail,
  QuotePriceType, QuoteDiscountMode, QuoteMarginWarning, QuotePayload, AssociateDuplicateResponse,
} from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import ClientPicker from '@/components/ClientPicker'
import CreateClientModal from '@/components/CreateClientModal'
import SaveQuoteConfirmModal from '@/components/SaveQuoteConfirmModal'
import ExitWithoutSavingModal from '@/components/ExitWithoutSavingModal'
import MarginOverrideWarningModal from '@/components/MarginOverrideWarningModal'
import QuotePartsList from '@/components/quote/QuotePartsList'
import PricingSettingsPanel from '@/components/PricingSettingsPanel'
import ConditionsSettingsPanel from '@/components/ConditionsSettingsPanel'
import { sanitizeUnsignedDecimalInput, clampPercentInput } from '@/lib/decimalInput'
import { formatMoney } from '@/lib/money'

type QuoteView = 'form' | 'preview' | 'external'

// SCRUM-985 — campos del encabezado que el backend puede reportar como faltantes
// (`missing` de validate/saveDraft/generate, ver Quote::validationErrorsForGenerating).
// El orden de este arreglo es el orden de aparición en el formulario y define el orden
// de la lista de errores al final. Las etiquetas del backend se mapean a la clave de
// campo; las que no mapean a un campo (Ítems, Margen...) se listan igual, al final.
type FieldKey = 'masterClient' | 'subClient' | 'ruc' | 'salesProject' | 'description' | 'contacts' | 'deliveryDates'
const FIELD_ORDER: FieldKey[] = ['masterClient', 'subClient', 'ruc', 'salesProject', 'description', 'deliveryDates', 'contacts']
const MISSING_LABEL_TO_FIELD: Record<string, FieldKey> = {
  'Cliente Master':    'masterClient',
  'Subcliente':        'subClient',
  'RUC / Cédula':      'ruc',
  'Proyecto':          'salesProject',
  'Descripción':       'description',
  'Fecha de entrega':  'deliveryDates',
  'Contacto':          'contacts',
}
// Resalte rojo (borde) de los inputs/selects dentro de un contenedor de campo.
// Etiquetas del backend sin campo propio en el formulario pero con texto i18n.
const MISSING_LABEL_TO_I18N: Record<string, string> = {
  'Ítems': 'items',
}
const FIELD_ERROR_CLASS = '[&_input]:!border-red-500 [&_select]:!border-red-500 [&_input]:dark:!border-red-400 [&_select]:dark:!border-red-400'

// SCRUM-122 — el estado de Arquitecto necesita phone/email además de id/label
// (a diferencia de masterClient/subClient/salesProject) para poder mostrarlos en
// pantalla una vez seleccionado; ClientPicker es genérico en T desde este ticket
// justamente para poder pasar esta variante sin tocar el tipo compartido.
interface ArchitectOption {
  id:    number
  label: string
  phone: string | null
  email: string | null
}

// Buscador simple (sin creación inline) — usado para Cliente Master/Subcliente/
// Contactos, donde la creación de un registro nuevo abre un formulario completo
// aparte (CreateClientModal / mini-form de contacto) en vez del mini-form de un
// solo campo extra que ya cubre ClientPicker (reusado tal cual para Proyecto y
// Arquitecto, que sí encajan en ese patrón).
function SimpleSearchPicker<T extends { id: number }>({
  label, value, disabled, onSelect, search, renderOption, createLabel, onCreateClick, onClear,
}: {
  label:          string
  value:          string
  disabled?:      boolean
  onSelect:       (opt: T) => void
  search:         (q: string) => Promise<T[]>
  renderOption:   (opt: T) => string
  createLabel?:   string
  // SCRUM-734 (RN7.1) — recibe el texto ya tipeado para que quien abre el modal
  // de creación (CreateClientModal) pueda precargarlo, igual que ya hace
  // ClientPicker con su mini-form inline.
  onCreateClick?: (query: string) => void
  /** SCRUM-117 — el estado del padre (ej. masterClient) no se limpiaba al borrar el
   *  texto del input a mano, solo al elegir una opción vía onSelect. Sin esto, un
   *  campo dependiente (ej. Subcliente) seguía habilitado/con valor de un cliente que
   *  ya no aparecía seleccionado en pantalla. */
  onClear?:       () => void
}) {
  const [query,   setQuery]   = useState(value)
  const [options, setOptions] = useState<T[]>([])
  const [open,    setOpen]    = useState(false)

  useEffect(() => { setQuery(value) }, [value])

  function runSearch(q: string) {
    search(q).then(opts => { setOptions(opts); setOpen(true) }).catch(() => setOptions([]))
  }

  return (
    <div className="relative w-full">
      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</label>
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={e => {
          const v = e.target.value
          setQuery(v)
          if (v.trim() === '') onClear?.()
          runSearch(v)
        }}
        onFocus={() => runSearch(query)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:border-[#5BA5A0] focus:outline-none"
      />
      {open && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white dark:bg-slate-800 py-1 shadow-lg max-h-48 overflow-auto">
          {options.map(opt => (
            <li key={opt.id}
              onMouseDown={() => { onSelect(opt); setOpen(false) }}
              className="cursor-pointer px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
              {renderOption(opt)}
            </li>
          ))}
          {/* SCRUM-116/117 — antes solo se ofrecía "+ Crear"/"+ Nuevo" con 0 resultados,
              más restrictivo que ClientPicker (ver su propio historial SCRUM-79/89/122):
              un nombre nuevo que matcheara por texto con un registro existente ocultaba
              la opción de crear para siempre, y nunca aparecía en el estado inicial
              (campo vacío recién enfocado). Ahora se ofrece siempre que no haya ya un
              match exacto entre los resultados. */}
          {createLabel && onCreateClick
            && !options.some(opt => renderOption(opt).trim().toLowerCase() === query.trim().toLowerCase())
            && (
            <li
              onMouseDown={() => { onCreateClick(query); setOpen(false) }}
              className="cursor-pointer px-3 py-1.5 text-sm font-semibold text-[#5BA5A0]"
            >
              {createLabel}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default function QuotePage() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const setUnsavedGuardDirty = useUnsavedQuoteGuard(s => s.setDirty)

  const quoteId = params.id ? Number(params.id) : null

  // REQ-050: precarga opcional al crear — llegando desde el botón "Crear cotización"
  // de una tarjeta de Pipeline (?fromPipelineCard=) o desde "+ Nueva cotización" de
  // un subcliente en Clientes (?fromSubClient=). Solo tiene efecto en la creación
  // inicial, no en recargas posteriores (ya con :id en la URL).
  const fromPipelineCard = searchParams.get('fromPipelineCard')
  const fromSubClient    = searchParams.get('fromSubClient')
  // SCRUM-912 — la precarga SÍ cuenta como "hay al menos un dato" desde el
  // arranque (viene con un cliente/tarjeta real vinculado), así que en ese caso
  // se sigue creando de inmediato al entrar, igual que antes.
  const hasPrecargaData = Boolean(fromPipelineCard || fromSubClient)

  // SCRUM-912 — antes, abrir "+ Nueva cotización" creaba de inmediato un
  // registro vacío en el backend, sin importar si el usuario llegaba a tipear
  // algo o se iba de la pantalla sin tocar nada (cotización huérfana). Ahora el
  // formulario arranca puramente en memoria (sin id, sin persistir nada) y
  // recién se crea cuando hay al menos un dato real: el efecto de más abajo
  // dispara la creación con el payload ya acumulado del encabezado en cuanto
  // formTouched pasa a true (o de inmediato si hay precarga, ver arriba). El
  // backend (ajuste en paralelo del mismo ticket) ya no persiste nada con un
  // payload vacío.
  const [createError, setCreateError] = useState<string | null>(null)
  // Evita que la respuesta del create() propio pise, vía el efecto de
  // hidratación de más abajo, cualquier tecla adicional tipeada mientras esa
  // request seguía en vuelo — ver createMutation.onSuccess.
  const skipNextHydrationRef = useRef(false)
  const createMutation = useMutation({
    mutationFn: (payload?: QuotePayload) => ventasDisenoApi.quotes.create({
      ...(fromPipelineCard ? { from_pipeline_card_id: Number(fromPipelineCard) } : {}),
      ...(fromSubClient ? { from_sub_client_id: Number(fromSubClient) } : {}),
      ...(payload ?? {}),
    }),
    onSuccess: (result, payload) => {
      // SCRUM-912 (Senior Review) — con formTouched ya en true, es alcanzable que el efecto
      // reactivo de abajo lea buildHeaderPayload() en un momento en que todos los campos
      // volvieron a estar vacíos (ej. tipear y borrar el buscador de Cliente Master sin llegar
      // a seleccionar nada real) — el backend legítimamente no persiste nada y responde
      // {persisted: false}, sin id. Antes esto navegaba a "/quotes/undefined" y dejaba la
      // pantalla rota. No hay nada que hidratar ni a dónde navegar: resetear la mutation y
      // formTouched para que el próximo campo tocado de verdad dispare un nuevo intento.
      if (!result.persisted) {
        createMutation.reset()
        setFormTouched(false)
        return
      }
      // Solo se dispara cuando la creación vino con datos ya tipeados
      // localmente (ver efecto reactivo abajo) — la precarga (payload
      // undefined) sigue queriendo la hidratación normal, para que el
      // cliente/tarjeta vinculado del lado del servidor aparezca en pantalla.
      if (payload) skipNextHydrationRef.current = true
      navigate(`/ventas-diseno/quotes/${result.id}`, { replace: true })
    },
    // SCRUM-105: la tarjeta de Pipeline ya puede tener una cotización generada
    // vinculada (guard nuevo en el backend, antes esto sobrescribía en silencio) —
    // el backend devuelve el id de esa cotización existente para no dejar al
    // usuario varado en un spinner infinito (createMutation.isError sin ningún
    // manejo dejaba la pantalla en "Cargando..." para siempre, ver isLoading
    // abajo): si viene ese id, navegamos directo a ella; si no, mostramos el error.
    onError: (err: unknown) => {
      const data = isAxiosError<{ message?: string; existing_quote_id?: number }>(err) ? err.response?.data : undefined
      if (data?.existing_quote_id != null) {
        navigate(`/ventas-diseno/quotes/${data.existing_quote_id}`, { replace: true })
        return
      }
      setCreateError(data?.message ?? t('ventasDiseno:modal.createError'))
    },
  })

  const { data: quote, isLoading } = useQuery({
    queryKey: ['ventas-diseno-quote', quoteId],
    queryFn:  () => ventasDisenoApi.quotes.get(quoteId as number),
    enabled:  quoteId !== null,
  })

  const [description,   setDescription]   = useState('')
  const [ruc,            setRuc]            = useState('')
  const [masterClient,   setMasterClient]   = useState<{ id: number; label: string } | null>(null)
  const [subClient,      setSubClient]      = useState<{ id: number; label: string } | null>(null)
  const [salesProject,   setSalesProject]   = useState<{ id: number; label: string } | null>(null)
  const [architect,      setArchitect]      = useState<ArchitectOption | null>(null)
  const [deliveryType,   setDeliveryType]   = useState('')
  const [deliveryDates,  setDeliveryDates]  = useState<string[]>([])
  const [showCreateMaster, setShowCreateMaster] = useState(false)
  const [showCreateSub,    setShowCreateSub]    = useState(false)
  // SCRUM-734 (RN7.1) — texto ya tipeado en el buscador cuando se activa "crear
  // nuevo", precargado en el modal de creación real (nunca vacío).
  const [createMasterInitialText, setCreateMasterInitialText] = useState('')
  const [createSubInitialText,    setCreateSubInitialText]    = useState('')
  const [error, setError] = useState<string | null>(null)

  // SCRUM-723 — exit-without-saving guard: cualquier edición del formulario general
  // (no las de Cotización-B/precios, que ya persisten solas — ver nota de alcance
  // del ticket) cuenta como "tocado" hasta el próximo guardado exitoso o hidratación
  // de otra cotización.
  const [formTouched, setFormTouched] = useState(false)

  // Cotización-C
  const [observations,        setObservations]        = useState('')
  const [includesInstallation, setIncludesInstallation] = useState(false)

  // Contacto nuevo (creado en sub_client_contacts y vinculado a la cotización)
  const [contactName,  setContactName]  = useState('')
  const [contactRole,  setContactRole]  = useState<ContactRole>('client')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [addingContact, setAddingContact] = useState(false)

  // Bug real encontrado en verificación E2E de Cotización-D: este efecto corría en
  // cada refetch de `quote` (ej. al agregar un contacto, que invalida la query),
  // pisando silenciosamente cualquier campo del encabezado que el usuario ya
  // hubiera tipeado pero no guardado todavía. Antes no se notaba porque
  // Cotización-A/B/C siempre exigían guardar el encabezado antes de poder agregar
  // contactos (subcliente sin persistir bloqueaba esa sección) — pero con la
  // precarga de REQ-050 el subcliente ya llega guardado desde el vamos, así que
  // "agregar contacto" queda disponible de inmediato y el bug se vuelve real.
  // Fix: sincronizar desde el servidor solo cuando cambia de cotización (carga
  // inicial / navegación a otro id), nunca en un refetch de la misma cotización.
  useEffect(() => {
    if (!quote) return
    if (skipNextHydrationRef.current) {
      // SCRUM-912 — esta cotización se acaba de crear con lo que el usuario ya
      // tenía tipeado localmente (ver createMutation.onSuccess más arriba); no
      // pisar ese estado con la respuesta del propio create.
      skipNextHydrationRef.current = false
      return
    }
    setDescription(quote.description ?? '')
    setRuc(quote.ruc ?? '')
    setMasterClient(quote.master_client ? { id: quote.master_client.id, label: quote.master_client.name } : null)
    setSubClient(quote.sub_client ? { id: quote.sub_client.id, label: quote.sub_client.business_name } : null)
    setSalesProject(quote.sales_project ? { id: quote.sales_project.id, label: quote.sales_project.name } : null)
    // El GET de la cotización ya trae phone/email del arquitecto (QuoteController::show,
    // ver App\Modules\VentasDiseno\Http\Controllers\QuoteController.php) — el bug era que el
    // frontend los descartaba acá y en searchArchitects/createArchitect más abajo.
    setArchitect(quote.architect
      ? { id: quote.architect.id, label: quote.architect.name, phone: quote.architect.phone, email: quote.architect.email }
      : null)
    setDeliveryType(quote.delivery_type ?? '')
    setDeliveryDates(quote.delivery_dates)
    setObservations(quote.observations ?? '')
    setIncludesInstallation(quote.includes_installation)
    setFormTouched(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.id])

  function buildHeaderPayload() {
    return {
      master_client_id: masterClient?.id ?? null,
      sub_client_id:     subClient?.id ?? null,
      sales_project_id:  salesProject?.id ?? null,
      ruc:               ruc || null,
      description:       description || null,
      architect_id:      architect?.id ?? null,
      delivery_type:     (deliveryType || null) as 'single' | 'partial' | 'tbd' | null,
      // SCRUM-796 (secc. 7) — "Por definir" no lleva fecha, se manda vacío siempre.
      // SCRUM-985 (Pre-QA) — nunca se mandan strings vacíos: el backend los valida como
      // fecha ("debe ser una fecha válida", 422 sin `missing`) en vez de reportar
      // "Fecha de entrega" como faltante. Sin fechas -> [] y el backend responde `missing`.
      delivery_dates:    deliveryType === 'tbd' ? [] : deliveryDates.filter(d => d !== ''),
      observations:       observations || null,
      includes_installation: includesInstallation,
    }
  }

  // SCRUM-912 — dispara la creación real recién cuando corresponde: de
  // inmediato si hay precarga (fromPipelineCard/fromSubClient, ya cuenta como
  // "hay un dato"), o en cuanto el usuario toca el primer campo del
  // formulario en blanco (formTouched). Sin ninguna de las dos cosas, la
  // cotización se queda sin crear — nunca queda un huérfano solo por haber
  // abierto la pantalla. buildHeaderPayload() se lee acá adentro (no en el
  // handler que dispara formTouched) para capturar el estado ya actualizado
  // del render en el que corre este efecto, no una clausura vieja.
  useEffect(() => {
    if (quoteId !== null) return
    if (createMutation.isPending || createMutation.isSuccess || createMutation.isError) return
    if (hasPrecargaData) {
      createMutation.mutate(undefined)
      return
    }
    if (!formTouched) return
    createMutation.mutate(buildHeaderPayload())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, hasPrecargaData, formTouched])

  // Cotización-D — "Guardar borrador" (REQ-086) valida el formulario igual que
  // "generar" (REQ-047) salvo por los ítems, y bloquea el guardado (nada se
  // persiste) si falta algo general. "Guardar y generar cotización" reusa el mismo
  // guardado (para persistir lo que se acaba de tipear) y encima exige ≥1 ítem +
  // asigna folio — ver handleGenerateClick() más abajo.
  const [draftJustSaved, setDraftJustSaved] = useState(false)
  const [validation, setValidation] = useState<{ valid: boolean; missing: string[] } | null>(null)

  // SCRUM-985 — errores ACTIVOS: lo que el backend reportó como faltante, pero solo
  // mientras el campo siga realmente inválido con el estado actual del formulario.
  // Así corregir el valor, o cambiar una opción que cambia la obligatoriedad (ej.
  // Única/Parcial -> Por definir), limpia el rojo y el mensaje de inmediato, sin
  // esperar otro guardado; y nunca queda un error de una selección anterior.
  const fieldInvalid: Record<FieldKey, boolean> = {
    masterClient:  masterClient === null,
    subClient:     subClient === null,
    ruc:           ruc.trim() === '',
    salesProject:  salesProject === null,
    description:   description.trim() === '',
    contacts:      (quote?.contacts ?? []).length === 0,
    deliveryDates: deliveryType !== 'tbd' && !deliveryDates.some(d => d !== ''),
  }
  const activeErrors = (validation && !validation.valid ? validation.missing : [])
    .map(label => ({ label, field: MISSING_LABEL_TO_FIELD[label] as FieldKey | undefined }))
    .filter(e => e.field === undefined || fieldInvalid[e.field])
    .sort((a, b) =>
      (a.field ? FIELD_ORDER.indexOf(a.field) : FIELD_ORDER.length)
      - (b.field ? FIELD_ORDER.indexOf(b.field) : FIELD_ORDER.length))
  const hasFieldError = (f: FieldKey) => activeErrors.some(e => e.field === f)
  const fieldErrCls = (f: FieldKey) => hasFieldError(f) ? FIELD_ERROR_CLASS : ''
  // Un 422 de Laravel con `errors` sobre delivery_dates.* (formato de fecha) se trata como
  // "Fecha de entrega" faltante: campo en rojo + mensaje i18n, no el banner crudo. Solo lo
  // realmente no mapeable cae al banner `error`.
  function handleSaveError(err: unknown) {
    const data = isAxiosError<{ valid?: boolean; missing?: string[]; message?: string; errors?: Record<string, string[]> }>(err)
      ? err.response?.data : undefined
    if (data?.missing) {
      setError(null)
      setValidation({ valid: false, missing: data.missing })
    } else if (data?.errors && Object.keys(data.errors).some(k => k === 'delivery_dates' || k.startsWith('delivery_dates.'))) {
      setError(null)
      setValidation({ valid: false, missing: ['Fecha de entrega'] })
    } else {
      setError(data?.message ?? t('ventasDiseno:modal.createError'))
    }
  }

  const saveDraftMutation = useMutation({
    mutationFn: () => ventasDisenoApi.quotes.saveDraft(quoteId as number, buildHeaderPayload()),
    // Cada intento parte limpio: nunca queda un mensaje de una condición anterior.
    onMutate: () => { setError(null) },
    onSuccess: () => {
      setError(null)
      setValidation(null)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] })
    },
    onError: handleSaveError,
  })

  const generateMutation = useMutation({
    mutationFn: () => ventasDisenoApi.quotes.generate(quoteId as number),
    onMutate: () => { setError(null) },
    onSuccess: () => {
      setValidation(null)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] })
      setActiveView('preview')
    },
    onError: (err: unknown) => {
      handleSaveError(err)
    },
  })

  async function handleGenerateClick() {
    try {
      await saveDraftMutation.mutateAsync()
    } catch {
      return // bloqueado — saveDraftMutation.onError ya mostró el banner de faltantes
    }
    generateMutation.mutate()
  }

  // SCRUM-723 — "Volver a Pipeline" pasó a ser navegación pura (la ruta
  // return-to-pipeline se eliminó del backend): ya no mueve nada, solo navega a la
  // tarjeta vinculada. Con cambios sin guardar, pasa primero por el mismo modal de
  // confirmación que el Sidebar (Pre-QA SCRUM-723: el botón navegaba directo sin
  // avisar, dejando la tarjeta en Lead sin que el usuario lo esperara).
  const [showExitToPipelineConfirm, setShowExitToPipelineConfirm] = useState(false)
  function handleReturnToPipeline() {
    if (!quote) return
    if (isUnsaved) {
      setShowExitToPipelineConfirm(true)
      return
    }
    navigate(`/ventas-diseno/pipeline?card=${quote.pipeline_card_id}`)
  }

  // SCRUM-723 — "Guardar" en Vista Previa: generate() ya no registra oficialmente
  // la cotización, solo asigna folio. confirm() es el paso nuevo que la marca como
  // definitiva (confirmed_at) y la hace aparecer en Pipeline/Cotizaciones/Reportes/
  // Dashboard — gateado detrás de un modal de confirmación (showSaveConfirm).
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  // SCRUM-725 — si confirm() responde 422 con margin_warning=true (solo posible
  // para Mark/David, ventas_diseno.override_min_margin), se reemplaza el error
  // genérico por este modal; "Continuar" reintenta confirm() con el flag explícito.
  const [marginWarning, setMarginWarning] = useState<QuoteMarginWarning | null>(null)
  const confirmMutation = useMutation({
    mutationFn: (overrideMarginWarning?: boolean) => ventasDisenoApi.quotes.confirm(quoteId as number, overrideMarginWarning),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] })
      // SCRUM-1122 — confirmar traslada a la tarjeta el monto y las fechas de entrega (y puede crear la tarjeta): el detalle del
      // proyecto y el tablero deben releerse, no mostrar la copia de hasta 30 s (staleTime global) de antes de confirmar.
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card'] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card-product-delivery-assignments'] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline'] })
      setShowSaveConfirm(false)
      setMarginWarning(null)
      setUnsavedGuardDirty(false)
    },
    onError: (err: unknown) => {
      const data = isAxiosError<QuoteMarginWarning>(err) ? err.response?.data : undefined
      if (data?.margin_warning === true) {
        setShowSaveConfirm(false)
        setMarginWarning(data)
      }
    },
  })

  const [activeView, setActiveView] = useState<QuoteView>('form')

  // SCRUM-766 — PDF real (plantilla única interna/externa/descarga, ver QuotePdfService en el
  // backend) — reemplaza el render en vivo de QuoteDocument + window.print(). Solo se pide con
  // folio ya asignado (mismo gate que habilita las pestañas Vista Previa/Externa).
  const { data: pdfBlob } = useQuery({
    queryKey: ['ventas-diseno-quote-pdf', quote?.id, activeView],
    queryFn:  () => ventasDisenoApi.quotes.pdf(quote!.id, activeView === 'external'),
    enabled:  activeView !== 'form' && !!quote?.folio,
  })
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pdfBlob])

  // REQ-033 (2026-07-12): panel de Configuración de las fórmulas de Tipo de
  // Precio, mismo patrón que Reportes (canConfigure/showConfig).
  const canConfigurePricing = usePermission('ventas_diseno.pricing.configure')
  const [showPricingConfig, setShowPricingConfig] = useState(false)

  // SCRUM-138 — mismo patrón que canConfigurePricing/showPricingConfig, para el panel
  // de default global de Condiciones.
  const canConfigureConditions = usePermission('ventas_diseno.edit.conditions')
  const [showConditionsConfig, setShowConditionsConfig] = useState(false)

  const addContactMutation = useMutation({
    mutationFn: async () => {
      const created = await ventasDisenoApi.subClients.contacts.create(subClient!.id, {
        name: contactName, role: contactRole, phone: contactPhone || null, email: contactEmail || null,
      })
      return ventasDisenoApi.quotes.contacts.create(quoteId as number, created.id)
    },
    onSuccess: () => {
      setContactName(''); setContactPhone(''); setContactEmail(''); setAddingContact(false)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] })
    },
  })

  const linkContactMutation = useMutation({
    mutationFn: (contact: SubClientContact) => ventasDisenoApi.quotes.contacts.create(quoteId as number, contact.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] }),
  })

  const removeContactMutation = useMutation({
    mutationFn: (contactId: number) => ventasDisenoApi.quotes.contacts.remove(quoteId as number, contactId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] }),
  })

  // SCRUM-734 (RN8.5) — editar teléfono/correo de un Arquitecto ya seleccionado
  // actualiza su registro real (asociado al Subcliente), no solo esta cotización.
  const [editingArchitect, setEditingArchitect] = useState(false)
  const [architectPhoneDraft, setArchitectPhoneDraft] = useState('')
  const [architectEmailDraft, setArchitectEmailDraft] = useState('')
  const [architectEditError, setArchitectEditError] = useState<string | null>(null)

  const updateArchitectMutation = useMutation({
    mutationFn: () => ventasDisenoApi.architects.update(architect!.id, {
      name: architect!.label, phone: architectPhoneDraft || null, email: architectEmailDraft || null,
    }),
    onSuccess: updated => {
      setArchitect(a => a && { ...a, phone: updated.phone, email: updated.email })
      setEditingArchitect(false)
    },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setArchitectEditError(message ?? t('ventasDiseno:modal.createError'))
    },
  })

  function startEditingArchitect() {
    setArchitectPhoneDraft(architect?.phone ?? '')
    setArchitectEmailDraft(architect?.email ?? '')
    setArchitectEditError(null)
    setEditingArchitect(true)
  }

  // Cotización-B — tipo de precio y modo de descuento cambian de inmediato (REQ-033
  // recalcula todos los ítems al elegir un tipo; REQ-041 reinicia el modo que se deja
  // de usar), no quedan atados al botón Guardar del encabezado.
  const canSelectPartnerPrice = usePermission('ventas_diseno.select_partner_price')
  const [priceTypeError, setPriceTypeError] = useState<string | null>(null)

  // SCRUM-1164 — una partida con tipo de precio propio ignora el general (por diseño). Al cambiar el general con partidas así, se pregunta:
  // «Aplicar a todos» (las partidas dejan su tipo propio) o «Mantener» (como siempre). Sin partidas con tipo propio, cambia directo.
  const [pendingPriceType, setPendingPriceType] = useState<{ value: QuotePriceType; count: number } | null>(null)
  // Solo cuentan las partidas cuyo tipo propio es DISTINTO del general (una con el mismo tipo no se comporta distinto).
  const itemsWithOwnPriceType = (quote?.parts ?? []).flatMap(p => p.items).filter(i => i.price_type_override != null && i.price_type_override !== quote?.price_type)

  const priceTypeMutation = useMutation({
    mutationFn: ({ priceType, clearOverrides }: { priceType: QuotePriceType; clearOverrides?: boolean }) =>
      ventasDisenoApi.quotes.update(quoteId as number, clearOverrides ? { price_type: priceType, clear_item_price_overrides: true } : { price_type: priceType }),
    onSuccess: () => { setPriceTypeError(null); setPendingPriceType(null); qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] }) },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setPriceTypeError(message ?? t('ventasDiseno:priceType.partnerLocked'))
    },
  })
  const discountModeMutation = useMutation({
    mutationFn: (mode: QuoteDiscountMode) => ventasDisenoApi.quotes.update(quoteId as number, { discount_mode: mode }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] }),
  })
  const [globalDiscountDraft, setGlobalDiscountDraft] = useState('0')
  const [globalDiscountError, setGlobalDiscountError] = useState<string | null>(null)
  useEffect(() => { setGlobalDiscountDraft(String(quote?.global_discount_percent ?? 0)) }, [quote?.global_discount_percent])
  const globalDiscountMutation = useMutation({
    mutationFn: (value: number) => ventasDisenoApi.quotes.update(quoteId as number, { global_discount_percent: value }),
    onSuccess: () => { setGlobalDiscountError(null); qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] }) },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setGlobalDiscountError(message ?? t('ventasDiseno:modal.createError'))
    },
  })

  const [newPartName, setNewPartName] = useState('')
  const createPartMutation = useMutation({
    mutationFn: () => ventasDisenoApi.quotes.parts.create(quoteId as number, newPartName),
    onSuccess: () => { setNewPartName(''); qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] }) },
  })

  // Cotización-C — descuento de Totales (REQ-045), recalcula en vivo igual que el
  // resto del motor de precios (no espera al botón Guardar del encabezado).
  const [discountTotalsError, setDiscountTotalsError] = useState<string | null>(null)
  const [discountTotalsTypeDraft, setDiscountTotalsTypeDraft] = useState<'percent' | 'amount'>('percent')
  const [discountTotalsValueDraft, setDiscountTotalsValueDraft] = useState('0')
  useEffect(() => {
    if (!quote) return
    setDiscountTotalsTypeDraft(quote.discount_totals_type)
    setDiscountTotalsValueDraft(String(quote.discount_totals_value))
  }, [quote])
  const discountTotalsMutation = useMutation({
    mutationFn: () => ventasDisenoApi.quotes.update(quoteId as number, {
      discount_totals_type: discountTotalsTypeDraft,
      discount_totals_value: Number(discountTotalsValueDraft),
    }),
    onSuccess: () => { setDiscountTotalsError(null); qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] }) },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setDiscountTotalsError(message ?? t('ventasDiseno:modal.createError'))
    },
  })

  // REQ-047 — chequeo de campos obligatorios antes de "generar" (informativo, no
  // bloquea guardar como borrador). El mismo estado de faltantes también lo llenan
  // saveDraftMutation/generateMutation cuando bloquean el guardado (REQ-086/047).
  const validateMutation = useMutation({
    mutationFn: () => ventasDisenoApi.quotes.validate(quoteId as number),
    onMutate: () => { setError(null) },
    onSuccess: result => setValidation(result),
  })

  const searchMasterClients = useCallback(
    (q: string) => ventasDisenoApi.masterClients.list(q),
    [],
  )
  const searchSubClients = useCallback(
    (q: string) => masterClient ? ventasDisenoApi.subClients.list(masterClient.id, q) : Promise.resolve([]),
    [masterClient],
  )
  const searchSalesProjects = useCallback(
    (q: string) => subClient
      ? ventasDisenoApi.salesProjects.list(subClient.id, q).then(opts => opts.map(o => ({ id: o.id, label: o.name })))
      : Promise.resolve([]),
    [subClient],
  )
  const createSalesProject = useCallback(
    (q: string) => subClient
      ? ventasDisenoApi.salesProjects.create(subClient.id, q).then(p => ({ id: p.id, label: p.name }))
      : Promise.reject(new Error('no sub client')),
    [subClient],
  )
  // SCRUM-1121 — el «Arquitecto» vuelve a buscarse en la base única y global de asociados (tipo arquitecto), ya no acotada al Subcliente: lo
  // creado acá lo ven las demás cotizaciones y el proyecto. Es el arquitecto que origina la comisión de Admin&Cont (no cambia de significado).
  const searchArchitects = useCallback(
    (q: string) => ventasDisenoApi.architects.search(q, 'architect')
      .then(opts => opts.map(a => ({ id: a.id, label: a.name, phone: a.phone, email: a.email }))),
    [],
  )
  const createArchitect = useCallback(
    async (q: string, phone: string, email: string) => {
      try {
        const a = await ventasDisenoApi.architects.create({ type: 'architect', name: q, phone: phone.trim() || null, email: email.trim() || null })
        return { id: a.id, label: a.name, phone: a.phone, email: a.email }
      } catch (err) {
        // Duplicado EXACTO (mismo correo/teléfono/documento): es la misma persona; se usa el asociado que ya existe en vez de dejar al
        // usuario sin salida. Un nombre parecido (409 duplicate_similar) sí se muestra como error: debe elegir de la lista o crearlo
        // desde «Asociados», donde puede confirmar «Crear igual».
        const data = isAxiosError<AssociateDuplicateResponse>(err) ? err.response?.data : undefined
        const existing = err && isAxiosError(err) && err.response?.status === 409 && data?.code === 'duplicate_exact'
          ? data.duplicates.find(d => d.type === 'architect')
          : undefined
        if (existing) return { id: existing.id, label: existing.name, phone: existing.phone, email: existing.email }
        throw err
      }
    },
    [],
  )
  const searchQuoteContacts = useCallback(
    (q: string) => subClient ? ventasDisenoApi.subClients.contacts.list(subClient.id, q) : Promise.resolve([]),
    [subClient],
  )

  // REQ-024 criterio 3: el RUC y el primer contacto se copian automáticamente al
  // completar un Cliente Master nuevo. El RUC es puro estado local, pero el
  // contacto requiere que el Subcliente ya esté persistido en la cotización
  // (contactsReady exige quote.sub_client_id === subClient.id) — por eso este
  // update puntual no espera al botón "Guardar borrador" (mismo patrón sin-gate
  // que priceTypeMutation/discountModeMutation más abajo).
  const linkNewClientMutation = useMutation({
    mutationFn: (payload: { master_client_id: number; sub_client_id: number; ruc: string }) =>
      ventasDisenoApi.quotes.update(quoteId as number, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] }),
  })

  // SCRUM-912 — si la cotización todavía no existe (primera acción del usuario
  // en un "+ Nueva cotización" en blanco), no hay id todavía para vincular
  // master/sub cliente ni el primer contacto. El Cliente Master/Subcliente/RUC
  // ya quedan en estado local (setFormTouched(true) dispara la creación
  // reactiva de más arriba con ese mismo estado incluido en el payload); el
  // primer contacto se guarda en este ref para vincularse apenas la
  // cotización recién creada esté disponible (ver efecto pendingFirstContact
  // más abajo) — no se pierde, solo se pospone.
  const pendingFirstContactRef = useRef<SubClientContact | null>(null)

  async function handleMasterCreated(client: ClientDetail) {
    setShowCreateMaster(false)
    setMasterClient({ id: client.id, label: client.name })
    setFormTouched(true)
    const firstSub = client.sub_clients[0] as SubClientDetail | undefined
    if (!firstSub) return

    setSubClient({ id: firstSub.id, label: firstSub.business_name })
    setRuc(firstSub.tax_id)

    const firstContact = firstSub.contacts[0] ?? null

    if (quoteId === null) {
      pendingFirstContactRef.current = firstContact
      return
    }

    await linkNewClientMutation.mutateAsync({
      master_client_id: client.id, sub_client_id: firstSub.id, ruc: firstSub.tax_id,
    })

    if (firstContact) {
      linkContactMutation.mutate(firstContact)
    }
  }

  // SCRUM-912 — completa el vínculo del primer contacto diferido abajo (en
  // handleMasterCreated/handleSubCreated), una vez que la cotización recién
  // creada ya trae el mismo Subcliente (confirma que el create() reactivo
  // efectivamente incluyó este sub_client_id).
  useEffect(() => {
    if (!quote || !pendingFirstContactRef.current) return
    if (!quote.sub_client || quote.sub_client.id !== subClient?.id) return
    const contact = pendingFirstContactRef.current
    pendingFirstContactRef.current = null
    linkContactMutation.mutate(contact)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.id, quote?.sub_client?.id])

  // SCRUM-873 — mismo bug de fondo que motivó el comentario de arriba en el
  // onSelect de Subcliente EXISTENTE (SCRUM-716): un Subcliente NUEVO creado acá
  // (de un Cliente Master ya existente) solo tocaba estado local, nunca persistía
  // sub_client_id en la cotización — contactsReady se quedaba en false para
  // siempre (quote.sub_client?.id nunca llegaba a matchear) y la sección de
  // Contactos mostraba "Guarda la cotización antes de agregar contactos" aunque
  // el Subcliente (con su propio contacto, ya creado junto con él en
  // CreateClientModal) estuviera completo. Mismo patrón que handleMasterCreated:
  // persistir el link de inmediato y auto-vincular el primer contacto ya cargado.
  async function handleSubCreated(sub: SubClientDetail) {
    setShowCreateSub(false)
    setSubClient({ id: sub.id, label: sub.business_name })
    setRuc(sub.tax_id)
    setSalesProject(null)
    setFormTouched(true)

    if (!masterClient) return

    const firstContact = sub.contacts[0] ?? null

    // SCRUM-912 — mismo guard que handleMasterCreated: si la cotización todavía
    // no existe (creación diferida), no hay id para este link puntual todavía —
    // el Subcliente ya queda en estado local (incluido en el payload de la
    // creación reactiva) y el primer contacto se pospone al useEffect de arriba.
    if (quoteId === null) {
      pendingFirstContactRef.current = firstContact
      return
    }

    await linkNewClientMutation.mutateAsync({
      master_client_id: masterClient.id, sub_client_id: sub.id, ruc: sub.tax_id,
    })

    if (firstContact) {
      linkContactMutation.mutate(firstContact)
    }
  }

  // SCRUM-912 — antes de crearse, la cotización siempre es editable (es un
  // borrador nuevo en memoria); una vez creada, sigue el permiso real del
  // backend (bloqueado, por ejemplo, cuando ya está confirmada).
  const canEdit = quoteId === null ? true : (quote?.can_edit ?? false)
  const canSeeCost = user?.modules?.ventas_diseno?.view_team === true
  // SCRUM-912 — "Diseñador a cargo" antes de que la cotización exista: el
  // dueño-a-ser es el propio usuario logueado (nadie más puede estar creando
  // esta cotización todavía). Una vez que `quote` carga, gana el Responsable del
  // proyecto (SCRUM-1195, el mismo que imprime el PDF) y, sin él, el dueño real (SCRUM-849.5).
  const quoteOwnerDisplay = quote?.designer ?? quote?.owner ?? { name: `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim(), phone: user?.phone ?? null }
  // REQ-031: agregar un contacto exige que el Subcliente ya esté guardado en la
  // cotización (el backend valida que el contacto pertenezca a quote.sub_client_id)
  // — si se acaba de elegir un Subcliente distinto en el formulario pero todavía no
  // se guardó, hay que guardar primero para no mandar un adjunto que el backend
  // va a rechazar por pertenecer a un subcliente que la cotización aún no tiene.
  const contactsReady = quote?.sub_client !== null && quote?.sub_client?.id === subClient?.id

  // SCRUM-723 — "sin guardar": formulario tocado sin generar, o ya generada
  // (preview habilitada) pero todavía sin confirmar. Vista externa queda afuera a
  // propósito: solo es alcanzable con folio ya asignado, no es donde se pierde
  // trabajo sin guardar.
  const isUnsaved = activeView === 'form'
    ? formTouched
    : activeView === 'preview' && !quote?.confirmed_at

  useEffect(() => {
    setUnsavedGuardDirty(isUnsaved)
  }, [isUnsaved, setUnsavedGuardDirty])

  // Se limpia al desmontar (ej. navegación exitosa fuera de la página) para que el
  // guard de Sidebar no quede prendido después de salir por un camino distinto al
  // modal de "Salir sin guardar" (ej. Volver a Pipeline, que navega directo).
  useEffect(() => () => setUnsavedGuardDirty(false), [setUnsavedGuardDirty])

  // Cierre de pestaña / recarga — el navegador muestra su propio prompt genérico,
  // no hay forma de personalizar el texto (limitación del browser, no del código).
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isUnsaved) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isUnsaved])

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2 print:hidden">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:nav.quote')}
          </h1>
          {quote?.folio && (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">{quote.folio}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canConfigurePricing && (
            <Button
              variant="secondary" active={showPricingConfig} activeVariant="primary"
              onClick={() => setShowPricingConfig(v => !v)}
            >
              {t('ventasDiseno:quote.pricingConfig.toggle')}
            </Button>
          )}
          {canConfigureConditions && (
            <Button
              variant="secondary" active={showConditionsConfig} activeVariant="primary"
              onClick={() => setShowConditionsConfig(v => !v)}
            >
              {t('ventasDiseno:quote.conditionsConfig.toggle')}
            </Button>
          )}
        </div>
      </div>

      {canConfigurePricing && showPricingConfig && <PricingSettingsPanel />}
      {canConfigureConditions && showConditionsConfig && <ConditionsSettingsPanel />}

      <Card variant="panel" className="p-4">
        {createError ? (
          <p className="text-red-600 dark:text-red-400 text-sm">{createError}</p>
        ) : quoteId !== null && (isLoading || !quote) ? (
          // SCRUM-912 — una cotización genuinamente nueva (quoteId === null, sin
          // precarga) todavía no existe en el servidor hasta que el usuario toca
          // el primer campo (ver el efecto reactivo de creación más arriba); el
          // formulario de encabezado tiene que poder renderizarse ANTES de eso —
          // gatear todo detrás de `!quote` la dejaba en "Cargando..." para
          // siempre, sin ningún campo con el que disparar la creación.
          <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
        ) : (
          <>
            {/* Cotización-D — Formulario / Vista Previa / Vista Externa, igual patrón
                que el mock (viewToggle): Vista Previa/Externa quedan deshabilitadas
                hasta generar (REQ-048/049, gate = quote.folio). */}
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-4 w-fit print:hidden">
              <Button
                variant="secondary" active={activeView === 'form'} activeVariant="primary"
                className="!rounded-none !border-0" onClick={() => setActiveView('form')}
              >
                {t('ventasDiseno:quote.view.form')}
              </Button>
              <Button
                variant="secondary" active={activeView === 'preview'} activeVariant="primary"
                className="!rounded-none !border-0" disabled={!quote?.folio}
                title={!quote?.folio ? t('ventasDiseno:quote.view.unavailable') : undefined}
                onClick={() => setActiveView('preview')}
              >
                {t('ventasDiseno:quote.view.preview')}
              </Button>
              <Button
                variant="secondary" active={activeView === 'external'} activeVariant="primary"
                className="!rounded-none !border-0" disabled={!quote?.folio}
                title={!quote?.folio ? t('ventasDiseno:quote.view.unavailable') : undefined}
                onClick={() => setActiveView('external')}
              >
                {t('ventasDiseno:quote.view.external')}
              </Button>
            </div>

            {/* SCRUM-912 — `&& quote` es solo para que TS narrowee el tipo acá: en tiempo de
                ejecución `activeView` nunca puede ser distinto de 'form' sin `quote` (los
                botones que lo cambian están disabled mientras !quote?.folio, y sin `quote` no
                hay folio). */}
            {activeView !== 'form' && quote ? (
              <>
                {pdfUrl ? (
                  <iframe
                    src={pdfUrl}
                    title={t('ventasDiseno:nav.quote')}
                    className="w-full h-[75vh] border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-900"
                  />
                ) : (
                  <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
                )}
                <div className="flex items-center justify-end gap-2 mt-4">
                  {/* Pre-QA SCRUM-734 (RN2.2, hallazgo MEDIO) — "no debe existir ningún
                      botón 'Editar' sobre una cotización generada": el campo detrás de
                      este botón siempre estuvo bloqueado (canEdit=false) para una
                      cotización confirmada, pero el label seguía diciendo "Editar" —
                      confuso a la letra del criterio aunque no hubiera brecha funcional.
                      "Ver formulario" para una confirmada, "Editar" solo para el
                      Borrador/generada-sin-confirmar donde el formulario SÍ es editable. */}
                  <Button variant="secondary" onClick={() => setActiveView('form')}>
                    {quote.confirmed_at ? t('ventasDiseno:quote.viewForm') : t('ventasDiseno:quote.edit')}
                  </Button>
                  {/* SCRUM-723 — "Guardar" abre el modal de confirmación que dispara
                      POST /:id/confirm; una vez confirmed_at está seteado, deja de ser
                      accionable y pasa a un badge "Guardada" de solo lectura. */}
                  {quote.confirmed_at ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
                      {t('ventasDiseno:quote.saved')}
                    </span>
                  ) : (
                    <Button variant="secondary" onClick={() => setShowSaveConfirm(true)}>
                      {t('ventasDiseno:quote.save')}
                    </Button>
                  )}
                  {quote.pipeline_card_id !== null && (
                    <Button variant="secondary" onClick={handleReturnToPipeline}>
                      {t('ventasDiseno:quote.returnToPipeline')}
                    </Button>
                  )}
                  <Button
                    disabled={!pdfUrl}
                    onClick={() => {
                      if (!pdfUrl) return
                      const a = document.createElement('a')
                      a.href = pdfUrl
                      a.download = `Cotizacion-${quote.folio}.pdf`
                      a.click()
                    }}
                  >
                    {t('ventasDiseno:quote.downloadPdf')}
                  </Button>
                </div>
              </>
            ) : (
          <>
            {draftJustSaved && (
              <div className="mb-4 px-3 py-2 rounded-lg border text-[12px] font-medium bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                {t('ventasDiseno:quote.draftSaved')}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className={fieldErrCls('masterClient')}>
                <SimpleSearchPicker<MasterClientRef>
                  label={t('ventasDiseno:modal.masterClient')}
                  value={masterClient?.label ?? ''}
                  disabled={!canEdit}
                  // No se limpia salesProject acá: si es el mismo Proyecto que la
                  // cotización ya traía (típico al completar cliente en una
                  // cotización nacida sin cliente vinculado), el backend lo
                  // reparenta al nuevo Subcliente en vez de exigir uno distinto
                  // (SCRUM-116, QA 2026-07-10/11). Si el usuario elige explícitamente
                  // otro Proyecto vía el buscador de más abajo, ese sí lo reemplaza.
                  onSelect={opt => { setMasterClient({ id: opt.id, label: opt.name }); setSubClient(null); setFormTouched(true) }}
                  search={searchMasterClients}
                  renderOption={opt => opt.name}
                  createLabel={t('ventasDiseno:clients.actions.createClient')}
                  onCreateClick={q => { setCreateMasterInitialText(q); setShowCreateMaster(true) }}
                  onClear={() => { setMasterClient(null); setSubClient(null); setFormTouched(true) }}
                />
              </div>
              <div className={fieldErrCls('subClient')}>
                <SimpleSearchPicker<SubClientRef>
                  label={t('ventasDiseno:modal.subClient')}
                  value={subClient?.label ?? ''}
                  disabled={!canEdit || !masterClient}
                  // Ídem nota de Cliente Master arriba: no se limpia salesProject, el
                  // backend reparenta el mismo Proyecto si corresponde.
                  // SCRUM-716 — persistir de inmediato (mismo mutation que
                  // handleMasterCreated para un cliente recién creado, ver
                  // linkNewClientMutation): antes, elegir un Subcliente EXISTENTE solo
                  // tocaba estado local, así que contactsReady seguía en false hasta
                  // "Guardar borrador" y la sección de Contactos quedaba bloqueada con
                  // "Guardá la cotización antes de agregar contactos" aunque el usuario
                  // ya hubiera elegido cliente — no debería hacer falta llenar el resto
                  // del encabezado (proyecto, arquitecto, entrega) solo para eso.
                  onSelect={opt => {
                    setSubClient({ id: opt.id, label: opt.business_name })
                    setRuc(opt.tax_id ?? '')
                    setFormTouched(true)
                    // SCRUM-912 — si la cotización todavía no existe, no hay id para
                    // este update puntual todavía: el Subcliente ya queda en estado
                    // local y se incluye en el payload de la creación reactiva
                    // (dispara por el setFormTouched(true) de arriba).
                    if (masterClient && quoteId !== null) {
                      linkNewClientMutation.mutate({ master_client_id: masterClient.id, sub_client_id: opt.id, ruc: opt.tax_id ?? '' })
                    }
                  }}
                  search={searchSubClients}
                  renderOption={opt => opt.business_name}
                  createLabel={masterClient ? t('ventasDiseno:clients.detail.newSubClient') : undefined}
                  onCreateClick={q => { setCreateSubInitialText(q); setShowCreateSub(true) }}
                />
                {/* SCRUM-734 (sección 6) — mensaje guía de orden de llenado, no solo el
                    disabled del input. */}
                {canEdit && !masterClient && (
                  <p className="mt-1 text-xs text-slate-400">{t('ventasDiseno:quote.fillOrderHint.needsMasterClient')}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className={fieldErrCls('ruc')}>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('ventasDiseno:quote.ruc')}
                </label>
                <input
                  type="text" value={ruc} disabled={!canEdit} aria-invalid={hasFieldError('ruc') || undefined}
                  onChange={e => { setRuc(e.target.value); setFormTouched(true) }}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div className={fieldErrCls('salesProject')}>
                <ClientPicker
                  label={t('ventasDiseno:quote.project')}
                  value={salesProject?.label ?? ''}
                  onSelect={opt => { setSalesProject(opt); setFormTouched(true) }}
                  search={searchSalesProjects}
                  onCreate={createSalesProject}
                  disabled={!canEdit || !subClient}
                />
                {canEdit && !subClient && (
                  <p className="mt-1 text-xs text-slate-400">{t('ventasDiseno:quote.fillOrderHint.needsSubClient')}</p>
                )}
              </div>
            </div>

            {/* SCRUM-1166 — estado de ITBMS de esta cotización frente al cliente: lo normal es que coincidan; si la cotización se confirmó antes de marcar
                (o de quitar) la exención, conserva su marca y se avisa para que no sorprenda al facturar. */}
            {(quote?.itbms_exento || quote?.sub_client?.itbms_exento) && (
              <p data-testid="quote-aviso-exencion"
                className={`mb-3 rounded-lg px-3 py-2 text-[12px] font-medium ${quote?.itbms_exento === !!quote?.sub_client?.itbms_exento
                  ? 'bg-primary-soft text-primary-dark'
                  : 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'}`}>
                {quote?.itbms_exento && quote?.sub_client?.itbms_exento && t('ventasDiseno:quote.exencion.exenta')}
                {quote?.itbms_exento && !quote?.sub_client?.itbms_exento && t('ventasDiseno:quote.exencion.conservaExenta')}
                {!quote?.itbms_exento && quote?.sub_client?.itbms_exento && t('ventasDiseno:quote.exencion.conservaItbms')}
              </p>
            )}

            <div className={`mb-3 ${fieldErrCls('description')}`}>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                {t('ventasDiseno:quote.description')}
              </label>
              <input
                type="text" value={description} disabled={!canEdit} aria-invalid={hasFieldError('description') || undefined}
                onChange={e => { setDescription(e.target.value); setFormTouched(true) }}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('ventasDiseno:quote.designer')}
                </label>
                <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">
                  {/* Pre-QA SCRUM-849.5 (2026-09-08) — hallazgo CRÍTICO real: este campo mostraba
                      SIEMPRE al usuario logueado (`user`), nunca al dueño real de la cotización
                      (`quote.owner`) — invisible en self-QA porque el propio dueño ve su propio
                      nombre, pero Gerencia abriendo la cotización de otra persona veía su propio
                      nombre/teléfono en vez del real.
                      SCRUM-912 — este bloque ahora SÍ puede renderizar con `quote` todavía
                      indefinido (cotización nueva sin crear aún, ver el gate más arriba): antes
                      de que exista, el dueño-a-ser es el propio usuario logueado — único caso
                      legítimo de usar `user` acá, no el bug que corrigió SCRUM-849.5 (ese era
                      con una cotización YA existente de otro dueño). */}
                  {quoteOwnerDisplay.name}
                  {quoteOwnerDisplay.phone && <span className="text-slate-400"> · {quoteOwnerDisplay.phone}</span>}
                </p>
              </div>
              <div>
                <ClientPicker<ArchitectOption>
                  label={t('ventasDiseno:quote.architect')}
                  hint={t('ventasDiseno:quote.architectHint')}
                  value={architect?.label ?? ''}
                  onSelect={opt => { setArchitect(opt); setFormTouched(true); setEditingArchitect(false) }}
                  search={searchArchitects}
                  onCreate={createArchitect}
                  disabled={!canEdit}
                  extraFieldLabel={t('common:labels.phone')}
                  extraFieldLabel2={t('common:labels.email')}
                />
                {/* SCRUM-122 — antes solo se mostraba el nombre del arquitecto seleccionado;
                    Gerencia Test (QA) reportó que teléfono/correo "están escondidos". Mismo
                    estilo visual que la sección de Contactos más abajo. Gracioso si el
                    arquitecto es viejo y no tiene ninguno de los dos cargado.
                    SCRUM-734 (RN8.4/8.5) — editable in-place, actualiza el registro real. */}
                {architect && !editingArchitect && (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xs text-slate-400">
                      {architect.phone && <span>{architect.phone}</span>}
                      {architect.phone && architect.email && <span> · </span>}
                      {architect.email && <span>{architect.email}</span>}
                      {!architect.phone && !architect.email && <span>—</span>}
                    </p>
                    {canEdit && (
                      <button type="button" onClick={startEditingArchitect} className="text-xs font-semibold text-[#5BA5A0]">
                        {t('ventasDiseno:quote.edit')}
                      </button>
                    )}
                  </div>
                )}
                {architect && editingArchitect && (
                  <div className="mt-1 flex flex-wrap gap-2 items-center">
                    <input
                      type="text" placeholder={t('common:labels.phone')}
                      value={architectPhoneDraft} onChange={e => setArchitectPhoneDraft(e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs w-28"
                    />
                    <input
                      type="email" placeholder={t('common:labels.email')}
                      value={architectEmailDraft} onChange={e => setArchitectEmailDraft(e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs w-40"
                    />
                    <button
                      type="button"
                      disabled={updateArchitectMutation.isPending || (!architectPhoneDraft.trim() && !architectEmailDraft.trim())}
                      onClick={() => updateArchitectMutation.mutate()}
                      className="text-xs font-semibold text-[#5BA5A0] disabled:opacity-50"
                    >
                      {t('ventasDiseno:quote.save')}
                    </button>
                    <button type="button" onClick={() => setEditingArchitect(false)} className="text-xs text-slate-400">
                      {t('common:actions.cancel')}
                    </button>
                    {architectEditError && <p className="w-full text-xs text-red-500">{architectEditError}</p>}
                  </div>
                )}
              </div>
            </div>


            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              {/* SCRUM-985 — sin opción elegida no hay selector de fechas: el rojo de
                  "Fecha de entrega" cae sobre el selector de opción. */}
              <div className={deliveryType === '' ? fieldErrCls('deliveryDates') : ''}>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('ventasDiseno:modal.deliveryType')}
                </label>
                <select
                  value={deliveryType} disabled={!canEdit}
                  onChange={e => {
                    const v = e.target.value
                    setDeliveryType(v)
                    setError(null)
                    setFormTouched(true)
                    if (v === 'partial' && deliveryDates.length < 2) setDeliveryDates(['', ''])
                    // SCRUM-124: cambiar de Parcial (2 fechas) a Única dejaba las 2 fechas
                    // cargadas porque esta condición solo disparaba con length<1 — nunca con
                    // 2. Única siempre debe quedar con exactamente 1 campo de fecha.
                    if (v === 'single' && deliveryDates.length !== 1) setDeliveryDates([''])
                    // SCRUM-796 (secc. 7) — "Por definir" no lleva fecha: se limpian las que
                    // hubiera cargadas, el selector de fechas queda oculto (ver abajo).
                    if (v === 'tbd') setDeliveryDates([])
                  }}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">—</option>
                  <option value="single">{t('ventasDiseno:modal.deliverySingle')}</option>
                  <option value="partial">{t('ventasDiseno:modal.deliveryPartial')}</option>
                  <option value="tbd">{t('ventasDiseno:modal.deliveryTbd')}</option>
                </select>
              </div>
              {/* SCRUM-796 (secc. 7) — "Por definir" oculta el selector de fechas por completo:
                  no es obligatoria, no debe aparecer ninguna validación pidiéndola. */}
              {deliveryType && deliveryType !== 'tbd' && (
                <div className={fieldErrCls('deliveryDates')}>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.deliveryDates')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {deliveryDates.map((d, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <input
                          type="date" value={d} disabled={!canEdit}
                          onChange={e => { setDeliveryDates(dates => dates.map((x, xi) => xi === i ? e.target.value : x)); setError(null); setFormTouched(true) }}
                          className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                        />
                        {/* SCRUM-124 (Pre-QA 2026-07-29) — REQ-032 (Excel) exige poder quitar
                            cada fecha agregada en modo parcial, siempre que queden mínimo 2. El
                            botón nunca se había implementado (solo existía "+" para agregar). */}
                        {canEdit && deliveryType === 'partial' && deliveryDates.length > 2 && (
                          <Button
                            variant="icon"
                            aria-label={t('common:actions.delete')}
                            onClick={() => { setDeliveryDates(dates => dates.filter((_, xi) => xi !== i)); setError(null); setFormTouched(true) }}
                          >
                            <IcoClose size={12} />
                          </Button>
                        )}
                      </div>
                    ))}
                    {canEdit && deliveryType === 'partial' && (
                      <Button variant="secondary" onClick={() => { setDeliveryDates(d => [...d, '']); setFormTouched(true) }}>+</Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Contactos — REQ-031 */}
            <div
              className={hasFieldError('contacts')
                ? 'mt-5 p-3 rounded-lg border-2 border-red-500 dark:border-red-400 bg-red-50/40 dark:bg-red-950/10'
                : 'mt-5 pt-5 border-t-2 border-slate-200 dark:border-slate-700'}
              aria-invalid={hasFieldError('contacts') || undefined}
            >
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-2">
                {t('ventasDiseno:modal.contacts')}
              </h3>

              <ul className="mb-3 flex flex-col gap-2">
                {/* SCRUM-912 — `quote` puede ser undefined todavía (cotización nueva sin
                    crear); sin contactos que mostrar hasta que exista. */}
                {(quote?.contacts ?? []).map(c => (
                  <li key={c.pivot_id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2 text-sm">
                    <span>
                      <span className="font-semibold">{c.name}</span>{' '}
                      <span className="text-slate-400">({t(`ventasDiseno:contactRole.${c.role}`)})</span>{' '}
                      {c.phone && <span className="text-slate-400">· {c.phone}</span>}
                      {c.email && <span className="text-slate-400"> · {c.email}</span>}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => removeContactMutation.mutate(c.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-semibold"
                      >
                        {t('common:actions.delete')}
                      </button>
                    )}
                  </li>
                ))}
                {(quote?.contacts ?? []).length === 0 && (
                  <li className="text-sm text-slate-400">{t('ventasDiseno:modal.noContacts')}</li>
                )}
              </ul>

              {canEdit && subClient && !contactsReady && (
                <p className="text-xs text-amber-600 mb-2">{t('ventasDiseno:quote.saveBeforeContacts')}</p>
              )}

              {canEdit && subClient && contactsReady && (
                <div className="flex flex-col gap-2">
                  <SimpleSearchPicker<SubClientContact>
                    label={t('ventasDiseno:quote.addExistingContact')}
                    value=""
                    onSelect={contact => linkContactMutation.mutate(contact)}
                    search={searchQuoteContacts}
                    renderOption={c => `${c.name} (${t(`ventasDiseno:contactRole.${c.role}`)})`}
                  />

                  {!addingContact ? (
                    <button
                      onClick={() => setAddingContact(true)}
                      className="text-[12px] font-semibold text-[#5BA5A0] self-start"
                    >
                      {t('ventasDiseno:quote.addNewContact')}
                    </button>
                  ) : (
                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-wrap gap-2 items-end">
                      <input
                        type="text" placeholder={t('ventasDiseno:modal.contactName')}
                        value={contactName} onChange={e => setContactName(e.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm flex-1 min-w-[140px]"
                      />
                      <select
                        value={contactRole} onChange={e => setContactRole(e.target.value as ContactRole)}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="client">{t('ventasDiseno:contactRole.client')}</option>
                        <option value="architect">{t('ventasDiseno:contactRole.architect')}</option>
                        <option value="other">{t('ventasDiseno:contactRole.other')}</option>
                      </select>
                      <input
                        type="text" placeholder={t('common:labels.phone')}
                        value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-32"
                      />
                      <input
                        type="email" placeholder={t('common:labels.email')}
                        value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-40"
                      />
                      <Button
                        onClick={() => addContactMutation.mutate()}
                        disabled={!contactName.trim() || (!contactPhone.trim() && !contactEmail.trim()) || addContactMutation.isPending}
                        loading={addContactMutation.isPending}
                      >
                        {t('common:actions.add')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cotización-C — observaciones e instalación (REQ-043/044) */}
            <div className="mt-5 pt-5 border-t-2 border-slate-200 dark:border-slate-700">
              <div className="mb-3">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('ventasDiseno:quote.observations')}
                </label>
                <textarea
                  value={observations} disabled={!canEdit} rows={2}
                  onChange={e => { setObservations(e.target.value); setFormTouched(true) }}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                />
                <p className="text-[11px] text-slate-400 mt-1">{t('ventasDiseno:quote.observationsAutoNote')}</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox" checked={includesInstallation} disabled={!canEdit}
                  onChange={e => { setIncludesInstallation(e.target.checked); setFormTouched(true) }}
                />
                {t('ventasDiseno:quote.includesInstallation')}
              </label>
            </div>

            {/* SCRUM-912 — precios/partidas/totales/condiciones/validación/generar dependen
                TODOS de que la cotización ya exista en el servidor (price_type/discount_mode
                se actualizan con un PUT inmediato contra su id, las partidas son hijos con
                quote_id, validate()/saveDraft()/generate() necesitan un id) — no tiene sentido
                mostrarlos para una cotización nueva todavía sin crear; el efecto reactivo de
                arriba la crea apenas el usuario toca el primer campo del encabezado, y esta
                sección aparece sola en cuanto `quote` carga, sin acción extra del usuario. */}
            {quote && (
            <>
            {/* Cotización-B — motor de precios y partidas (REQ-033/034/035/038/041/042).
                Todo ítem es personalizado por ahora, sin Catálogo real — las fórmulas de
                tipo de precio no tienen efecto todavía (ver memoria del proyecto). */}
            <div className="mt-5 pt-5 border-t-2 border-slate-200 dark:border-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:quote.priceTypeGeneral')}
                  </label>
                  <select
                    value={quote.price_type} disabled={!canEdit}
                    onChange={e => {
                      const value = e.target.value as QuotePriceType
                      const differing = itemsWithOwnPriceType.filter(i => i.price_type_override !== value).length
                      if (differing > 0) { setPendingPriceType({ value, count: differing }); return }
                      setPendingPriceType(null)
                      priceTypeMutation.mutate({ priceType: value })
                    }}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="public">{t('ventasDiseno:priceType.public')}</option>
                    <option value="project">{t('ventasDiseno:priceType.project')}</option>
                    <option value="special">{t('ventasDiseno:priceType.special')}</option>
                    <option value="partner" disabled={!canSelectPartnerPrice}>
                      {t('ventasDiseno:priceType.partner')}{!canSelectPartnerPrice ? ` — ${t('ventasDiseno:priceType.partnerLocked')}` : ''}
                    </option>
                    <option value="premium">{t('ventasDiseno:priceType.premium')}</option>
                  </select>
                  {priceTypeError && <p className="text-xs text-red-500 mt-1">{priceTypeError}</p>}
                  {pendingPriceType !== null && (
                    <div role="alertdialog" data-testid="price-type-apply-prompt" className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                      <p>{t('ventasDiseno:quote.priceTypeApplyPrompt', { count: pendingPriceType.count, type: t(`ventasDiseno:priceType.${pendingPriceType.value}`) })}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="primary" className="!text-xs !px-2 !py-1" loading={priceTypeMutation.isPending}
                          onClick={() => priceTypeMutation.mutate({ priceType: pendingPriceType.value, clearOverrides: true })}>
                          {t('ventasDiseno:quote.priceTypeApplyAll')}
                        </Button>
                        <Button variant="outline" className="!text-xs !px-2 !py-1" disabled={priceTypeMutation.isPending}
                          onClick={() => priceTypeMutation.mutate({ priceType: pendingPriceType.value })}>
                          {t('ventasDiseno:quote.priceTypeKeepOwn')}
                        </Button>
                        <Button variant="outline" className="!text-xs !px-2 !py-1" disabled={priceTypeMutation.isPending} onClick={() => setPendingPriceType(null)}>
                          {t('common:actions.cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                  {itemsWithOwnPriceType.length > 0 && pendingPriceType === null && (
                    <p data-testid="price-type-own-note" className="text-[11px] text-slate-500 mt-1">
                      {t('ventasDiseno:quote.priceTypeOwnNote', { count: itemsWithOwnPriceType.length })}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:quote.discountMode')}
                  </label>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-2">
                    <Button
                      variant="secondary" active={quote.discount_mode === 'line'} activeVariant="primary"
                      className="!rounded-none !border-0" disabled={!canEdit}
                      onClick={() => discountModeMutation.mutate('line')}
                    >
                      {t('ventasDiseno:quote.discountByLine')}
                    </Button>
                    <Button
                      variant="secondary" active={quote.discount_mode === 'global'} activeVariant="primary"
                      className="!rounded-none !border-0" disabled={!canEdit}
                      onClick={() => discountModeMutation.mutate('global')}
                    >
                      {t('ventasDiseno:quote.discountGlobal')}
                    </Button>
                  </div>
                  {quote.discount_mode === 'global' && (
                    <div className="flex gap-2 items-center">
                      <input
                        type="number" value={globalDiscountDraft} disabled={!canEdit}
                        onChange={e => setGlobalDiscountDraft(e.target.value)}
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                      <span className="text-sm text-slate-500">%</span>
                      {canEdit && (
                        <Button
                          variant="secondary"
                          onClick={() => globalDiscountMutation.mutate(Number(globalDiscountDraft))}
                          loading={globalDiscountMutation.isPending}
                        >
                          {t('common:actions.confirm')}
                        </Button>
                      )}
                    </div>
                  )}
                  {globalDiscountError && <p className="text-xs text-red-500 mt-1">{globalDiscountError}</p>}
                </div>
              </div>

              <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-2">
                {t('ventasDiseno:quote.parts')}
              </h3>

              <QuotePartsList
                quote={quote}
                discountMode={quote.discount_mode} canEdit={canEdit}
                canSeeCost={canSeeCost}
                minMarginPercent={quote.min_margin_percent}
                quotePriceType={quote.price_type}
              />

              {quote.parts.length === 0 && (
                <p className="text-sm text-slate-400 mb-3">{t('ventasDiseno:quote.noParts')}</p>
              )}

              {canEdit && (
                <div className="flex gap-2 items-center">
                  <input
                    type="text" placeholder={t('ventasDiseno:quote.newPartName')}
                    value={newPartName} onChange={e => setNewPartName(e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm flex-1 max-w-xs"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => createPartMutation.mutate()}
                    disabled={!newPartName.trim() || createPartMutation.isPending}
                    loading={createPartMutation.isPending}
                  >
                    {t('ventasDiseno:quote.addPart')}
                  </Button>
                </div>
              )}

            </div>

            {/* Cotización-C — Totales (REQ-045) */}
            <div className="mt-5 pt-5 border-t-2 border-slate-200 dark:border-slate-700">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-2">
                {t('ventasDiseno:quote.totals.title')}
              </h3>
              {/* SCRUM-725 — margen global por debajo del mínimo: se resalta acá (Totales),
                  no sobre un producto puntual — ver 'below_min_margin' por ítem más arriba. */}
              {quote.global_below_min_margin && (
                <div className="mb-3 px-3 py-2 rounded-lg border text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
                  {t('ventasDiseno:quote.belowMinMargin.global', { percent: quote.min_margin_percent })}
                </div>
              )}
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300 mb-1">
                <span>{t('ventasDiseno:quote.subtotal')}</span>
                <span>${formatMoney(quote.subtotal)}</span>
              </div>

              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm text-slate-600 dark:text-slate-300">{t('ventasDiseno:quote.totals.discount')}</span>
                <div className="flex gap-2 items-center">
                  <select
                    value={discountTotalsTypeDraft} disabled={!canEdit}
                    onChange={e => setDiscountTotalsTypeDraft(e.target.value as 'percent' | 'amount')}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                  >
                    <option value="percent">%</option>
                    <option value="amount">$</option>
                  </select>
                  <input
                    type="text" inputMode="decimal" value={discountTotalsValueDraft} disabled={!canEdit}
                    aria-label={t('ventasDiseno:quote.totals.discount')}
                    onChange={e => setDiscountTotalsValueDraft(sanitizeUnsignedDecimalInput(e.target.value))}
                    onBlur={e => setDiscountTotalsValueDraft(
                      discountTotalsTypeDraft === 'percent' ? clampPercentInput(e.target.value) : e.target.value,
                    )}
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                  />
                  {canEdit && (
                    <Button
                      variant="secondary"
                      onClick={() => discountTotalsMutation.mutate()}
                      loading={discountTotalsMutation.isPending}
                    >
                      {t('common:actions.confirm')}
                    </Button>
                  )}
                </div>
              </div>
              {discountTotalsError && <p className="text-xs text-red-500 mb-1">{discountTotalsError}</p>}

              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300 mb-1">
                <span>{t('ventasDiseno:quote.totals.net')}</span>
                <span>${formatMoney(quote.net_total)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300 mb-1">
                <span>{quote.itbms_exento ? t('ventasDiseno:quote.totals.itbmsExento') : t('ventasDiseno:quote.totals.itbms', { percentage: quote.itbms_percentage })}</span>
                <span>${formatMoney(quote.itbms)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-100 dark:border-slate-700">
                <span>{t('ventasDiseno:quote.totals.grandTotal')}</span>
                <span>${formatMoney(quote.grand_total)}</span>
              </div>
            </div>

            {/* Cotización-C — Condiciones (REQ-046). SCRUM-138: ya no se edita por
                cotización — el texto se congela al crearla desde el default global
                (Configuración > Condiciones), editable ahí por quien tenga el permiso. */}
            <div className="mt-5 pt-5 border-t-2 border-slate-200 dark:border-slate-700">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                {t('ventasDiseno:quote.conditions')}
              </label>
              <textarea
                value={quote.conditions_text ?? ''} disabled rows={7}
                readOnly
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">{t('ventasDiseno:quote.conditionsLocked')}</p>
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-5 border-t border-slate-100 dark:border-slate-700">
              <Button
                variant="secondary"
                onClick={() => validateMutation.mutate()}
                loading={validateMutation.isPending}
              >
                {t('ventasDiseno:quote.validation.check')}
              </Button>
              {canEdit && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDraftJustSaved(false)
                      saveDraftMutation.mutate(undefined, { onSuccess: () => setDraftJustSaved(true) })
                    }}
                    loading={saveDraftMutation.isPending}
                  >
                    {t('ventasDiseno:quote.saveDraft')}
                  </Button>
                  <Button
                    onClick={handleGenerateClick}
                    loading={saveDraftMutation.isPending || generateMutation.isPending}
                  >
                    {t('ventasDiseno:quote.generate')}
                  </Button>
                </>
              )}
            </div>

            {/* SCRUM-985 — todos los errores al FINAL del formulario (después de todos los
                campos y secciones y de los botones), uno por línea y en el orden de los campos. */}
            {validation?.valid && (
              <div className="mt-3 px-3 py-2 rounded-lg border text-[12px] font-medium bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                {t('ventasDiseno:quote.validation.complete')}
              </div>
            )}
            {activeErrors.length > 0 && (
              <div
                role="alert" data-testid="quote-form-errors"
                className="mt-3 px-3 py-2 rounded-lg border text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300"
              >
                <p className="font-semibold mb-1">{t('ventasDiseno:quote.validation.missing')}</p>
                <ol className="list-decimal pl-5 flex flex-col gap-0.5">
                  {activeErrors.map(e => (
                    <li key={e.label}>{(() => {
                      const key = e.field ?? MISSING_LABEL_TO_I18N[e.label]
                      return key ? t(`ventasDiseno:quote.validation.field.${key}`) : e.label
                    })()}</li>
                  ))}
                </ol>
              </div>
            )}
            {error && (
              <div role="alert" className="mt-3 px-3 py-2 rounded-lg border text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
            </>
            )}
          </>
            )}
          </>
        )}
      </Card>

      {showCreateMaster && (
        <CreateClientModal
          mode="client"
          initialText={createMasterInitialText}
          // SCRUM-873 — crear un Cliente Master nuevo desde acá es siempre en contexto de
          // Cotización, nunca de Pipeline: nunca debe generar el Lead card duplicado que el
          // flujo normal de "Cliente nuevo" (desde CRM) sí crea.
          fromQuoteContext
          onClose={() => setShowCreateMaster(false)}
          onCreated={handleMasterCreated}
        />
      )}
      {showCreateSub && masterClient && (
        <CreateClientModal
          mode="sub-client"
          masterClientId={masterClient.id}
          masterClientName={masterClient.label}
          initialText={createSubInitialText}
          fromQuoteContext
          onClose={() => setShowCreateSub(false)}
          onCreated={handleSubCreated}
        />
      )}
      {showSaveConfirm && (
        <SaveQuoteConfirmModal
          onCancel={() => setShowSaveConfirm(false)}
          onConfirm={() => confirmMutation.mutate(undefined)}
          isPending={confirmMutation.isPending}
        />
      )}
      {marginWarning && (
        <MarginOverrideWarningModal
          onCancel={() => setMarginWarning(null)}
          onConfirm={() => confirmMutation.mutate(true)}
          isPending={confirmMutation.isPending}
          percent={marginWarning.min_margin_percent}
        />
      )}
      {showExitToPipelineConfirm && quote && (
        <ExitWithoutSavingModal
          onCancel={() => setShowExitToPipelineConfirm(false)}
          onConfirm={() => {
            setShowExitToPipelineConfirm(false)
            navigate(`/ventas-diseno/pipeline?card=${quote.pipeline_card_id}`)
          }}
        />
      )}
    </>
  )
}
