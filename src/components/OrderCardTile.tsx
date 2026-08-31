import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import type { OrderCard, OrderStage } from '@/types/bodega'
import {
  useOrderInvoiceStatus, useAssignPicker, useStartPicking, useTeamMembersByRole,
  useAssignCourier, useDispatchOrder,
} from '@/hooks/useBodega'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { IcoAlertTriangle, IcoCheck } from '@/components/icons'
import InvoiceStatusModal from '@/components/InvoiceStatusModal'
import RegisterDeliveryModal from '@/components/RegisterDeliveryModal'
import RegisterSignedGuideModal from '@/components/RegisterSignedGuideModal'

interface Props {
  order:        OrderCard
  onOpenDetail: () => void
  onOpenGuide:  () => void
  /** SCRUM-384/385 (REQ-314/315) — "Iniciar Picking" (picking_pendiente) y "Continuar Picking"
   * (en_picking) ambos terminan abriendo la Hoja de Picking del pedido, en el padre (`PedidosPage`). */
  onOpenPickingSheet: (orderId: number) => void
  /** SCRUM-387/388 (REQ-317/318) — una tarjeta `picking_pendiente` con `order_type ===
   * 'revision_inventario'` abre `InventoryReviewModal` en vez de disparar `start-picking`, mismo
   * patrón de callback que `onOpenPickingSheet` (estado del modal vive en `PedidosPage`). */
  onOpenInventoryReview: (orderId: number) => void
}

/** Extrae `message`/`errors` de una respuesta de `OrderTransitionException` (403/422) — mismo
 * patrón ya confirmado como correcto en `BodegaNuevaDevolucionPage.tsx` (Pre-QA 2026-07-26):
 * `errors` SIEMPRE viene poblado por el backend (fallback a `{order: [message]}` si no hay un
 * campo específico, ver `OrderTransitionException::errors()`), así que leerlo primero y caer a
 * `message` solo si por algún motivo viniera vacío es más confiable que leer `message` directo. */
function extractTransitionErrorMessage(err: unknown, fallback: string): string {
  const backendMessage = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err)
    ? Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message
    : undefined
  return backendMessage ?? fallback
}

/** REQ-312 — etapas desde las que ya existe (por diseño de negocio) una Guía de Entrega generada:
 * `DeliveryService::registerDelivery()` la genera SIEMPRE antes de mover Packing -> Por despachar,
 * así que toda tarjeta en estas 3 etapas tiene una. El board (`GET /orders`) no expone la lista de
 * documentos por tarjeta (solo el detalle la trae) — mostrar el botón por etapa evita un fetch de
 * detalle por tarjeta solo para saber si existe; el modal mismo cae en "no generada" si no la hay. */
const STAGES_WITH_GUIDE: OrderStage[] = ['por_despachar', 'despachado', 'entregado']

/** SCRUM-401 (REQ-331) — fix 2026-07-28: `invoice_ready` no se resetea al avanzar de etapa
 * (`Order::$invoice_ready` persiste true en `despachado`/`entregado`, confirmado en backend/
 * `OrderInvoiceController::show()` y `DeliveryService`), pero la fila solo se pintaba en
 * `por_despachar` — una vez despachado el pedido, la factura ya lista quedaba sin ningún punto
 * de acceso (QA/marly no la encontraba). Mismo patrón que `STAGES_WITH_GUIDE`. */
const STAGES_WITH_INVOICE: OrderStage[] = ['por_despachar', 'despachado', 'entregado']

/** REQ-312/382 — botón de acción por etapa. SCRUM-383/384/385 (REQ-313/314/315) cablean
 * `asignado`/`picking_pendiente`/`en_picking`; SCRUM-393/396/398/399 (REQ-323/326/328/329) cablean
 * `packing`/`por_despachar`/`despachado` (ver `renderAction()` abajo). */
function actionLabelKey(stage: OrderStage, hasCourier: boolean): string {
  if (stage === 'por_despachar') return hasCourier ? 'dispatch' : 'assignCourier'
  return stage
}

/** Etapas con acción real ya cableada — el resto de etapas no terminales sigue con el botón
 * deshabilitado "Próximamente" (fuera de alcance de todo batch hasta hoy). */
const WIRED_STAGES: OrderStage[] = ['asignado', 'picking_pendiente', 'en_picking', 'packing', 'por_despachar', 'despachado']

export default function OrderCardTile({ order, onOpenDetail, onOpenGuide, onOpenPickingSheet, onOpenInventoryReview }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { user } = useAuthStore()
  const invoiceStatusMutation = useOrderInvoiceStatus()
  const [invoiceStatusMessage, setInvoiceStatusMessage] = useState<string | null>(null)

  const showGuideButton = STAGES_WITH_GUIDE.includes(order.stage)
  const isTerminal = order.stage === 'entregado'
  const actionKey = actionLabelKey(order.stage, order.repartidor !== null)

  // Pre-QA 2026-07-26 (MEDIO) — el backend (`OrderPickingController`/`PickingService`) rechaza
  // "Asignar Picker" con 403 para cualquier actor fuera de `BodegaRoles::CAN_OPERATE` (Jefe de
  // Bodega/Asistentes) — el frontend mostraba el botón/form a TODOS igual (incl. Picker/
  // Repartidor). No hay un campo de rol expuesto directamente en `UserInfo` que liste "es Jefe de
  // Bodega o Asistente" (`role` es un string de datos, no un enum cerrado, y compararlo contra los
  // `role_key` del backend duplicaría esa lista en el frontend) — se usa `modules.bodega.view_team`
  // como proxy, el MISMO campo que `BodegaHomePage.tsx`/`ConsolidatedPickingModal.tsx` ya usan
  // para distinguir "puede operar el equipo de Bodega" (Jefe/Asistente) de "solo su propio
  // trabajo" (Picker/Repartidor).
  const canOperatePicking = user?.modules?.bodega?.view_team === true

  // SCRUM-383 (REQ-313) — mini-formulario en línea "Asignar Picker", solo se pide el equipo de
  // Bodega mientras el formulario está abierto. Fix de regresión cruzada (2026-07-28): usaba
  // `useBodegaHomeTeam` (`GET /bodega/home/team`), que al restringirse a solo Asistentes (fix
  // correcto del selector "Equipo" del Home, SCRUM-366) devolvía `data: []` acá — el select de
  // Picker quedaba siempre vacío. Ahora usa `useTeamMembersByRole('picker', ...)`
  // (`GET /bodega/team-members?role=picker`), endpoint dedicado agregado por el backend para este
  // fix — ya no depende del listado de Asistentes.
  const [showPickerForm, setShowPickerForm] = useState(false)
  const [selectedPickerId, setSelectedPickerId] = useState<number | ''>('')
  const [pickerFieldInvalid, setPickerFieldInvalid] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const { data: team } = useTeamMembersByRole('picker', showPickerForm)
  const assignPicker = useAssignPicker()

  // SCRUM-384 (REQ-314) — "Iniciar Picking".
  const [startError, setStartError] = useState<string | null>(null)
  const startPicking = useStartPicking()

  // SCRUM-393/394/395 (REQ-323/324/325) — "Registrar Entrega" (Packing), modal completo (tabla +
  // motivo obligatorio en parcial + creación automática de la tarjeta Faltante, todo server-side).
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)

  // SCRUM-396 (REQ-326 RN1) — "Asignar Repartidor", exclusivo del Jefe de Bodega. A diferencia de
  // "Asignar Picker" (gateado client-side con `canOperatePicking`, un proxy porque no hay campo
  // directo), acá SÍ hay un campo confiable (`role` en el JWT ES el `role_key` real,
  // `JwtClaimsBuilder` → `$user->role->key`, igual a `BodegaRoles::LIDER_BODEGA`) pero el botón se
  // deja visible para cualquier perfil de Bodega igual: RN1 en Jira solo dice "Exclusivo del Jefe
  // de Bodega — Asistentes no deberían poder asignar", sin pedir explícitamente ocultar el
  // control para el resto (a diferencia de "Asignar Picker", que si lo pide vía el Pre-QA MEDIO
  // 2026-07-26). El bloqueo real es el 403 del backend (`DeliveryService::assignCourier()`,
  // confirmado en Pre-QA 2026-07-22 contra Mariano/Asistente), mostrado inline igual que el resto
  // de este batch — mismo criterio "nunca un disabled/oculto precalculado" que `handleDispatch`.
  // Fix de regresión cruzada (2026-07-28): usaba `useBodegaHomeTeam` (solo Asistentes desde
  // SCRUM-366), select siempre vacío para Repartidor — ahora `useTeamMembersByRole('courier', ...)`.
  const [showCourierForm, setShowCourierForm] = useState(false)
  const [selectedCourierId, setSelectedCourierId] = useState<number | ''>('')
  const [courierFieldInvalid, setCourierFieldInvalid] = useState(false)
  const [courierAssignError, setCourierAssignError] = useState<string | null>(null)
  const { data: courierTeam } = useTeamMembersByRole('courier', showCourierForm)
  const assignCourier = useAssignCourier()

  // SCRUM-398 (REQ-328) — "Despachar". Sin formulario: el bloqueo real (repartidor/factura) lo
  // decide el backend en cada intento, nunca un `disabled` calculado client-side de antemano.
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const dispatchOrder = useDispatchOrder()

  // SCRUM-399/400 (REQ-329/330) — "Confirmar Guía Firmada" (Despachado -> Entregado, automático).
  const [showSignedGuideModal, setShowSignedGuideModal] = useState(false)

  // SCRUM-401 (REQ-331) — alcance reducido: el link "ver" solo muestra el `status_message` que ya
  // trae el backend, nunca una vista de documento con precios (ver docblock de
  // `OrderInvoiceController` en el backend).
  function handleViewInvoice(e: React.MouseEvent) {
    e.stopPropagation()
    invoiceStatusMutation.mutate(order.id, {
      onSuccess: ({ status_message }) => setInvoiceStatusMessage(status_message),
    })
  }

  function handleOpenPickerForm() {
    setAssignError(null)
    setShowPickerForm(true)
  }

  function handleCancelPickerForm() {
    setShowPickerForm(false)
    setSelectedPickerId('')
    setPickerFieldInvalid(false)
    setAssignError(null)
  }

  // RN1 (REQ-313) — no se puede avanzar sin elegir picker; el campo se marca en rojo.
  function handleConfirmPicker() {
    if (selectedPickerId === '') {
      setPickerFieldInvalid(true)
      return
    }
    setPickerFieldInvalid(false)
    setAssignError(null)
    assignPicker.mutate(
      { orderId: order.id, pickerId: selectedPickerId },
      {
        onSuccess: () => handleCancelPickerForm(),
        // RN3 (403 — rol no autorizado) y "picker inválido" (422) — mensaje real del backend,
        // nunca replicado del lado del frontend.
        onError: err => setAssignError(extractTransitionErrorMessage(err, t('bodega:pedidos.assignPickerForm.errors.generic'))),
      },
    )
  }

  function handleStartPicking() {
    setStartError(null)
    startPicking.mutate(order.id, {
      onSuccess: () => onOpenPickingSheet(order.id),
      onError: err => setStartError(extractTransitionErrorMessage(err, t('bodega:pedidos.actions.startPickingFailed'))),
    })
  }

  function handleOpenCourierForm() {
    setCourierAssignError(null)
    setShowCourierForm(true)
  }

  function handleCancelCourierForm() {
    setShowCourierForm(false)
    setSelectedCourierId('')
    setCourierFieldInvalid(false)
    setCourierAssignError(null)
  }

  // RN1 (REQ-326) — no se puede confirmar sin elegir repartidor; el campo se marca en rojo.
  function handleConfirmCourier() {
    if (selectedCourierId === '') {
      setCourierFieldInvalid(true)
      return
    }
    setCourierFieldInvalid(false)
    setCourierAssignError(null)
    assignCourier.mutate(
      { orderId: order.id, courierId: selectedCourierId },
      {
        onSuccess: () => handleCancelCourierForm(),
        // 403 (rol no autorizado) y "repartidor inválido" (422) — mensaje real del backend.
        onError: err => setCourierAssignError(extractTransitionErrorMessage(err, t('bodega:pedidos.assignCourierForm.errors.generic'))),
      },
    )
  }

  // SCRUM-398 (REQ-328) — bloqueo REAL: el clic siempre dispara el intento real contra el backend
  // (`DeliveryService::blockingReasonsForDispatch()`), nunca un `disabled` precalculado a partir de
  // `invoice_ready`/`repartidor` — la fila de factura (abajo) ya da la pista visual, pero la única
  // fuente de verdad de si el despacho procede es la respuesta real del endpoint.
  function handleDispatch(e: React.MouseEvent) {
    e.stopPropagation()
    setDispatchError(null)
    dispatchOrder.mutate(order.id, {
      onError: err => setDispatchError(extractTransitionErrorMessage(err, t('bodega:pedidos.actions.dispatchFailed'))),
    })
  }

  return (
    <div
      onClick={onOpenDetail}
      data-testid={`order-card-${order.id}`}
      className="bg-white dark:bg-slate-800 rounded-xl p-3.5 mb-2 cursor-pointer transition-all hover:shadow-md hover:-translate-y-px select-none"
    >
      <div className="flex items-start justify-between gap-1.5 mb-0.5">
        <div className="flex items-start gap-1.5 min-w-0">
          {order.is_atrasado && (
            <span className="text-red-500 shrink-0 mt-0.5" title={t('bodega:pedidos.card.atrasado')}>
              <IcoAlertTriangle size={13} />
            </span>
          )}
          <p className="font-bold text-[13px] text-slate-900 dark:text-slate-100 leading-tight">
            #{order.order_number}
          </p>
        </div>
      </div>

      <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200 mb-0.5">
        {order.proyecto ?? '—'}
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
        <span className="font-semibold text-slate-600 dark:text-slate-300">{order.cliente ?? '—'}</span>
        {order.vendedor && <span className="text-slate-400"> · {order.vendedor}</span>}
      </p>

      {/* SCRUM-382 (REQ-312, corrección 2026-08-11) — "Alertas del pedido": Completo/Parcial/Sin
          stock agrupadas en una sola sección con su título, en vez de badges sueltos regados por
          la tarjeta. "ENTREGA PARCIAL" + "ENTREGA X DE Y" (SCRUM-389/388, misma lógica de familia,
          `FamilyService`/`OrderBoardService::cardPayload()` — nunca reimplementada acá) viajan
          juntas, tal como pide el ejemplo de Gerencia Test. */}
      {(order.is_sin_stock || order.family.badge) && (
        <div className="mb-2" data-testid="order-alerts">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1">
            {t('bodega:pedidos.card.alertsTitle')}
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            {order.is_sin_stock && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {t('bodega:pedidos.card.sinStock')}
              </span>
            )}
            {order.family.badge && (
              <span
                data-testid="family-badge"
                className={[
                  'shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                  order.family.badge === 'entrega_completa'
                    ? 'bg-[#E3F0EE] text-[#3D7E7A] dark:bg-slate-900 dark:text-[#5BA5A0]'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
                ].join(' ')}
              >
                {order.family.badge === 'entrega_completa'
                  ? t('bodega:pedidos.card.familyComplete')
                  : t('bodega:pedidos.card.familyPending')}
              </span>
            )}
            {order.family.sequence_in_family !== null && order.family.total_in_family !== null && (
              <span
                data-testid="family-sequence"
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              >
                {t('bodega:pedidos.card.familySequence', { seq: order.family.sequence_in_family, total: order.family.total_in_family })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* SCRUM-382 — "resumen de productos y cantidades" ("X productos y Y unidades"). */}
      <p className="text-[10px] text-slate-400 mb-2" data-testid="items-summary">
        {t('bodega:pedidos.card.itemsSummary', {
          products: order.items_summary.product_count,
          units: order.items_summary.unit_count,
        })}
      </p>

      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          {order.asistente ?? t('bodega:pedidos.card.noAssistant')}
        </span>
        {/* REQ-312 — "Picker/Repartidor (cuando aplique)". */}
        {order.picker && <span className="text-[10px] text-slate-400">· {order.picker}</span>}
        {order.repartidor && <span className="text-[10px] text-slate-400">· {order.repartidor}</span>}
      </div>

      {/* SCRUM-406 (REQ-336 RN1) — ETA de proveedor DIRECTAMENTE en la tarjeta, sin abrir el
          modal, solo para pedidos "Asignado" por falta de stock. Mismo flag (`is_sin_stock`) que
          gatea el badge de arriba; `eta_proveedor` puede ser null aun con `is_sin_stock` true
          (sin OC activa todavía con esa fecha, ver `OrderBoardService::supplierEta()`). */}
      {order.is_sin_stock && order.eta_proveedor !== null && (
        <div className="mb-2" data-testid="supplier-eta">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('bodega:pedidos.card.supplierEta', { date: order.eta_proveedor })}
          </p>
          <p className="text-[10px] text-slate-400 italic">
            {t('bodega:pedidos.card.supplierEtaNote')}
          </p>
        </div>
      )}

      {/* SCRUM-397 (REQ-327) — fila pasiva de factura. Bodega nunca genera ni sube este dato — es
          un stub de Administración (ver docblock de `Order::$invoice_ready`) que solo se muestra,
          nunca se edita desde acá. Visible en Por despachar/Despachado/Entregado (SCRUM-401 fix
          2026-07-28, ver `STAGES_WITH_INVOICE`) para que la factura ya lista siga accesible tras
          el despacho. */}
      {STAGES_WITH_INVOICE.includes(order.stage) && (
        <div className="mb-2 text-[11px]">
          {order.invoice_ready ? (
            <span
              data-testid="invoice-ready"
              className="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1"
            >
              <IcoCheck size={12} /> {t('bodega:pedidos.invoiceRow.ready')}
              {' · '}
              <button
                onClick={handleViewInvoice}
                disabled={invoiceStatusMutation.isPending}
                className="underline hover:no-underline disabled:opacity-50"
                data-testid="invoice-view-button"
              >
                {t('bodega:pedidos.invoiceRow.view')}
              </button>
            </span>
          ) : (
            <span data-testid="invoice-waiting" className="text-slate-400">
              {t('bodega:pedidos.invoiceRow.waiting')}
            </span>
          )}
        </div>
      )}

      <div className="flex justify-between items-center pt-2 border-t border-slate-50 dark:border-slate-700">
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {order.fecha_entrega_comprometida ?? t('bodega:pedidos.card.noDeliveryDate')}
        </span>

        {/* SCRUM-396 (rebote de Gerencia Test 2026-08-17) — flex-wrap: con "Despachar" +
            "Cambiar repartidor" visibles a la vez (etapa "Por despachar" con repartidor ya
            asignado), sin wrap el botón nuevo se salía del borde derecho de la tarjeta en vez de
            pasar a una segunda línea. La parte funcional del ticket ya estaba correcta, esto es
            puramente el ajuste visual pedido. */}
        <div className="flex items-center flex-wrap justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          {showGuideButton && (
            <Button variant="outline" className="!text-[11px] !px-2 !py-1" onClick={onOpenGuide}>
              {t('bodega:pedidos.card.viewGuide')}
            </Button>
          )}
          {order.stage === 'asignado' && !showPickerForm && canOperatePicking && (
            <Button variant="secondary" className="!text-[11px] !px-2 !py-1" onClick={handleOpenPickerForm}>
              {t(`bodega:pedidos.actionButton.${actionKey}`)}
            </Button>
          )}
          {/* SCRUM-387/388 (REQ-317/318, bug fix) — una tarjeta de Revisión de Inventario también
              vive en `picking_pendiente` (ver `Order::ORDER_TYPE_REVISION_INVENTARIO`), pero NO
              debe disparar `start-picking` — abre `InventoryReviewModal` en su lugar. Gateada por
              el mismo `canOperatePicking` que "Asignar Picker" (nunca Picker/Repartidor). El caso
              normal (picking_pendiente sin ser revisión) sigue exactamente igual que antes. */}
          {order.stage === 'picking_pendiente' && order.order_type === 'revision_inventario' ? (
            canOperatePicking && (
              <Button
                variant="secondary"
                className="!text-[11px] !px-2 !py-1"
                onClick={() => onOpenInventoryReview(order.id)}
                data-testid={`review-inventory-button-${order.id}`}
              >
                {t('bodega:pedidos.actionButton.reviewInventory')}
              </Button>
            )
          ) : order.stage === 'picking_pendiente' && (
            <Button
              variant="secondary"
              className="!text-[11px] !px-2 !py-1"
              onClick={handleStartPicking}
              disabled={startPicking.isPending}
              loading={startPicking.isPending}
              data-testid={`start-picking-button-${order.id}`}
            >
              {t(`bodega:pedidos.actionButton.${actionKey}`)}
            </Button>
          )}
          {order.stage === 'en_picking' && (
            <Button
              variant="secondary"
              className="!text-[11px] !px-2 !py-1"
              onClick={() => onOpenPickingSheet(order.id)}
              data-testid={`open-picking-sheet-button-${order.id}`}
            >
              {t(`bodega:pedidos.actionButton.${actionKey}`)}
            </Button>
          )}
          {/* SCRUM-393 (REQ-323/324/325) — abre el modal completo (tabla de artículos, tope real
              qty_picked, motivo obligatorio en parcial); el resto de la lógica (guía, notificar a
              Administración, tarjeta Faltante, avance de etapa) la resuelve el backend al guardar. */}
          {order.stage === 'packing' && (
            <Button
              variant="secondary"
              className="!text-[11px] !px-2 !py-1"
              onClick={() => setShowDeliveryModal(true)}
              data-testid={`register-delivery-button-${order.id}`}
            >
              {t(`bodega:pedidos.actionButton.${actionKey}`)}
            </Button>
          )}
          {/* SCRUM-396/398 (REQ-326/328) — "Por despachar": sin repartidor, solo el Jefe de Bodega
              ve el control de asignación (mismo criterio de ocultar-si-no-hay-permiso que
              `canOperatePicking` arriba, en vez de un botón deshabilitado); con repartidor ya
              asignado, cualquier perfil de Bodega puede intentar "Despachar" (PERMISOS del ticket:
              "aplica a todos los perfiles por igual, es una validación de sistema, no de rol"). */}
          {order.stage === 'por_despachar' && order.repartidor === null && !showCourierForm && (
            <Button
              variant="secondary"
              className="!text-[11px] !px-2 !py-1"
              onClick={handleOpenCourierForm}
              data-testid={`assign-courier-button-${order.id}`}
            >
              {t(`bodega:pedidos.actionButton.${actionKey}`)}
            </Button>
          )}
          {order.stage === 'por_despachar' && order.repartidor !== null && !showCourierForm && (
            <Button
              variant="secondary"
              className="!text-[11px] !px-2 !py-1"
              onClick={handleDispatch}
              disabled={dispatchOrder.isPending}
              loading={dispatchOrder.isPending}
              data-testid={`dispatch-button-${order.id}`}
            >
              {t(`bodega:pedidos.actionButton.${actionKey}`)}
            </Button>
          )}
          {/* Lote 4 (SCRUM-396, 2026-08-17) — "Cambiar repartidor", independiente de "Despachar":
              antes de este batch, una vez asignado el repartidor la única acción visible era
              despachar, sin forma de corregir/reasignar sin pasar por otra pantalla. Reusa el
              mismo mini-formulario/mutation de "Asignar Repartidor" (`showCourierForm`,
              `assignCourier`, mismo 403 real del backend si no es Jefe de Bodega — ver docblock
              de `DeliveryService::assignCourier()`, ahora también sincroniza a hermanos que ya
              tenían un repartidor propio). */}
          {order.stage === 'por_despachar' && order.repartidor !== null && !showCourierForm && (
            <Button
              variant="outline"
              className="!text-[11px] !px-2 !py-1"
              onClick={handleOpenCourierForm}
              data-testid={`change-courier-button-${order.id}`}
            >
              {t('bodega:pedidos.actionButton.changeCourier')}
            </Button>
          )}
          {/* SCRUM-399 (REQ-329) — avanza automáticamente a Entregado al confirmar, sin un botón
              de avance manual aparte (RN1). */}
          {order.stage === 'despachado' && (
            <Button
              variant="secondary"
              className="!text-[11px] !px-2 !py-1"
              onClick={() => setShowSignedGuideModal(true)}
              data-testid={`register-signed-guide-button-${order.id}`}
            >
              {t(`bodega:pedidos.actionButton.${actionKey}`)}
            </Button>
          )}
          {!isTerminal && !WIRED_STAGES.includes(order.stage) && (
            <Button
              variant="secondary"
              className="!text-[11px] !px-2 !py-1"
              disabled
              title={t('bodega:pedidos.actions.comingSoon')}
            >
              {t(`bodega:pedidos.actionButton.${actionKey}`)}
            </Button>
          )}
        </div>
      </div>

      {order.stage === 'picking_pendiente' && startError && (
        <p className="text-red-600 text-[11px] mt-1.5" onClick={e => e.stopPropagation()} data-testid={`start-picking-error-${order.id}`}>
          {startError}
        </p>
      )}

      {/* SCRUM-398 (REQ-328) — mensaje REAL del backend (falta repartidor / falta factura), nunca
          replicado del lado del frontend. */}
      {order.stage === 'por_despachar' && dispatchError && (
        <p className="text-red-600 text-[11px] mt-1.5" onClick={e => e.stopPropagation()} data-testid={`dispatch-error-${order.id}`}>
          {dispatchError}
        </p>
      )}

      {/* SCRUM-383 (REQ-313) — mini-formulario en línea "Asignar Picker". `canOperatePicking` de
          defensa en profundidad — el botón que abre `showPickerForm` ya está oculto para quien no
          lo tiene, pero este bloque no depende únicamente de ese gate en el árbol de render. */}
      {order.stage === 'asignado' && showPickerForm && canOperatePicking && (
        <div
          className="mt-2 pt-2 border-t border-slate-50 dark:border-slate-700"
          onClick={e => e.stopPropagation()}
          data-testid={`assign-picker-form-${order.id}`}
        >
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
            {t('bodega:pedidos.assignPickerForm.label')}
          </label>
          <select
            value={selectedPickerId}
            onChange={e => { setSelectedPickerId(e.target.value === '' ? '' : Number(e.target.value)); setPickerFieldInvalid(false) }}
            data-testid={`assign-picker-select-${order.id}`}
            className={[
              'w-full text-[12px] rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border focus:outline-none',
              pickerFieldInvalid
                ? 'border-red-400 focus:ring-2 focus:ring-red-200'
                : 'border-slate-200 dark:border-slate-600 focus:border-primary',
            ].join(' ')}
          >
            <option value="">{t('bodega:pedidos.assignPickerForm.placeholder')}</option>
            {(team?.data ?? []).map(member => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
          {pickerFieldInvalid && (
            <p className="text-red-600 text-[11px] mt-1" data-testid={`assign-picker-required-error-${order.id}`}>
              {t('bodega:pedidos.assignPickerForm.errors.required')}
            </p>
          )}
          {assignError && (
            <p className="text-red-600 text-[11px] mt-1" data-testid={`assign-picker-error-${order.id}`}>{assignError}</p>
          )}
          <div className="flex justify-end gap-1.5 mt-2">
            <Button variant="outline" className="!text-[11px] !px-2 !py-1" onClick={handleCancelPickerForm}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              variant="primary"
              className="!text-[11px] !px-2 !py-1"
              onClick={handleConfirmPicker}
              disabled={assignPicker.isPending}
              loading={assignPicker.isPending}
              data-testid={`assign-picker-confirm-${order.id}`}
            >
              {t('common:actions.confirm')}
            </Button>
          </div>
        </div>
      )}

      {/* SCRUM-396 (REQ-326) — mini-formulario en línea "Asignar Repartidor", mismo patrón que
          "Asignar Picker" arriba (ver nota de alcance sobre visibilidad más arriba). */}
      {order.stage === 'por_despachar' && showCourierForm && (
        <div
          className="mt-2 pt-2 border-t border-slate-50 dark:border-slate-700"
          onClick={e => e.stopPropagation()}
          data-testid={`assign-courier-form-${order.id}`}
        >
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
            {t('bodega:pedidos.assignCourierForm.label')}
          </label>
          <select
            value={selectedCourierId}
            onChange={e => { setSelectedCourierId(e.target.value === '' ? '' : Number(e.target.value)); setCourierFieldInvalid(false) }}
            data-testid={`assign-courier-select-${order.id}`}
            className={[
              'w-full text-[12px] rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border focus:outline-none',
              courierFieldInvalid
                ? 'border-red-400 focus:ring-2 focus:ring-red-200'
                : 'border-slate-200 dark:border-slate-600 focus:border-primary',
            ].join(' ')}
          >
            <option value="">{t('bodega:pedidos.assignCourierForm.placeholder')}</option>
            {(courierTeam?.data ?? []).map(member => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
          {courierFieldInvalid && (
            <p className="text-red-600 text-[11px] mt-1" data-testid={`assign-courier-required-error-${order.id}`}>
              {t('bodega:pedidos.assignCourierForm.errors.required')}
            </p>
          )}
          {courierAssignError && (
            <p className="text-red-600 text-[11px] mt-1" data-testid={`assign-courier-error-${order.id}`}>{courierAssignError}</p>
          )}
          <div className="flex justify-end gap-1.5 mt-2">
            <Button variant="outline" className="!text-[11px] !px-2 !py-1" onClick={handleCancelCourierForm}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              variant="primary"
              className="!text-[11px] !px-2 !py-1"
              onClick={handleConfirmCourier}
              disabled={assignCourier.isPending}
              loading={assignCourier.isPending}
              data-testid={`assign-courier-confirm-${order.id}`}
            >
              {t('common:actions.confirm')}
            </Button>
          </div>
        </div>
      )}

      {invoiceStatusMessage !== null && (
        // stopPropagation — el modal vive anidado dentro del `onClick={onOpenDetail}` de la
        // tarjeta (overlay `fixed inset-0`, pero sigue siendo hijo en el árbol de React); sin
        // esto, cualquier clic dentro del modal (incl. "Cerrar") también dispara `onOpenDetail`.
        <div onClick={e => e.stopPropagation()}>
          <InvoiceStatusModal
            orderNumber={order.order_number}
            statusMessage={invoiceStatusMessage}
            onClose={() => setInvoiceStatusMessage(null)}
          />
        </div>
      )}

      {showDeliveryModal && (
        <div onClick={e => e.stopPropagation()}>
          <RegisterDeliveryModal orderId={order.id} onClose={() => setShowDeliveryModal(false)} />
        </div>
      )}

      {showSignedGuideModal && (
        <div onClick={e => e.stopPropagation()}>
          <RegisterSignedGuideModal order={order} onClose={() => setShowSignedGuideModal(false)} />
        </div>
      )}
    </div>
  )
}
