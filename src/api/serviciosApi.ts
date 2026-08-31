import { isAxiosError } from 'axios'
import api from './authApi'
import type { OutlookCalendarEvent } from '@/types/calendar'
import type { CalendarPill } from '@/lib/dateGrid'
import type {
  Ticket, TicketFilters, TicketStatus, TechnicianOption, TicketStats, TicketDetail,
  UpdateTicketPayload, UpdateTicketResponse, ScheduleTicketPayload, TicketType,
  CreateTicketPayload, MasterClientOption, SubClientOption, ProjectOption, ProductOption,
  TicketAttachment, ExternalTechnicianFilters, ExternalTechnicianListResponse,
  CreateExternalTechnicianPayload, ExternalTechnicianDetail, ExternalTechnician,
  UpdateExternalTechnicianRatePayload, ExternalTechnicianStatus,
  InternalTechnician, InternalTechnicianVisit, InternalTechnicianAgendaEntry,
  CreateInternalTechnicianPayload, InternalTechnicianTeamStats, CommissionCapture,
  SaveCommissionCapturePayload, SlaSettings, TechnicianCommissionResult, ServiciosSetting,
  InspectionReportField, InspectionReportDetail, SaveInspectionReportPayload,
  SaveInspectionReportUploadPayload, SaveInspectionReportMobilePayload,
  InspectionReportPhoto, InspectionReportPhotoCategoria,
  ClaimSheetDetail, SaveClaimSheetPayload,
  ServiceQuoteDetail, SaveServiceQuotePayload, ServiceQuoteItemPayload, ServiceQuoteStatus,
  ServiceQuoteHistoryEntry, ServiceQuoteGlobalHistoryResponse,
  HomeSummary, UpdateInstallationGoalPayload, InstallationGoalResult,
  HomeEstadoTicketsResponse,
  ReportsPeriodParams, ReportsPanoramaMes, ReportsInstalacionesCotizadasVsRealizadas,
  ReportsDistribucionTipoItem, ReportsDistribucionTecnicoItem, ReportsCompletadosAnioItem,
  ReportsComisionCarlosVergara, ReportsBibliotecaFilters, ReportsBibliotecaResponse,
  Tool, ToolEstado, ToolFilters, ToolPurchaseRequest, ToolPurchaseRequestsResponse,
  CreateToolPurchaseRequestPayload, ReceiveToolPurchaseResponse,
  Insumo, CreateInsumoSolicitudPayload, InsumoPurchaseRequest, CreateInsumoPayload,
  ToolKardexEntry, ToolKardexFilters,
} from '@/types/servicios'

// Fase 4 — Servicios, Batch 1 (SCRUM-279→284). Backend Dev construye el mismo contrato en
// paralelo sobre App\Modules\Servicios — ver docs/architecture/servicios-fase4-diseno.md.
// Rutas y forma de respuesta siguen el patrón ya establecido (ventasDisenoApi/bodegaApi):
// listados envueltos en `{ data: [...] }`, mutaciones devuelven el recurso actualizado.
export const serviciosApi = {
  // Fase 4 — Servicios, Batch 15 (REQ-207/208/210/211). Pantalla "Inicio".
  home: {
    summary: (): Promise<HomeSummary> =>
      api.get<HomeSummary>('/servicios/home/summary').then(r => r.data),

    // REQ-211 RN2a(c) — override manual de Gerencia (RN: rol validado en la ruta).
    updateInstallationGoal: (data: UpdateInstallationGoalPayload): Promise<InstallationGoalResult> =>
      api.put<InstallationGoalResult>('/servicios/home/installation-goal', data).then(r => r.data),

    // REQ-215 (Grupo C, SCRUM-278) — endpoint propio, separado del summary, para que el chip de
    // tipo del panel "Estado de tickets" re-consulte sin recargar el resto de Inicio.
    estadoTickets: (tipo?: TicketType | ''): Promise<HomeEstadoTicketsResponse> =>
      api.get<HomeEstadoTicketsResponse>('/servicios/home/estado-tickets', {
        params: tipo ? { tipo } : undefined,
      }).then(r => r.data),
  },

  // REQ-209 (SCRUM-272) — mismo endpoint compartido con Ventas & Diseño/Compras/Bodega
  // (`OutlookCalendarController`, `module=servicios`). A diferencia de esos 3, RN1/PERMISOS de
  // este ticket son estrictamente "solo lectura del propio calendario" (nunca `scope=team` ni
  // `owner_id` — nadie ve el calendario de otro desde acá), así que este cliente no acepta esos
  // 2 params a propósito.
  calendar: {
    list: (filters: { from?: string; to?: string } = {}): Promise<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }> =>
      api.get<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }>('/servicios/calendar', { params: filters }).then(r => r.data),
  },

  tickets: {
    list: (filters: TicketFilters = {}): Promise<Ticket[]> =>
      api.get<{ data: Ticket[] }>('/servicios/tickets', { params: filters }).then(r => r.data.data),

    // REQ-218 — el backend valida cotización+informe antes de resolved/closed y devuelve 422
    // con { message } cuando bloquea. El resto de transiciones (incl. cancelled) no tiene esta
    // validación del lado backend; el frontend solo refleja el resultado.
    changeStatus: (id: number, estado: TicketStatus): Promise<Ticket> =>
      // Pre-QA 2026-08-03: la ruta real del backend es /estado (routes/servicios.php), no /status
      // — el vocabulario de la API sigue el idioma del dominio (mismo criterio que el resto de
      // Servicios/CRM/Compras), no una traducción literal del nombre del método del frontend.
      api.patch<Ticket>(`/servicios/tickets/${id}/estado`, { estado }).then(r => r.data),

    // REQ-222 — 4 tarjetas de estadísticas, nunca envuelto en { data }, mismo patrón que changeStatus.
    stats: (): Promise<TicketStats> =>
      api.get<TicketStats>('/servicios/tickets/stats').then(r => r.data),

    // REQ-224 — modal de detalle.
    get: (id: number): Promise<TicketDetail> =>
      api.get<TicketDetail>(`/servicios/tickets/${id}`).then(r => r.data),

    // REQ-225 — edición global (tipo/subtipo/tipo_instalacion/requerimientos_especiales).
    update: (id: number, data: UpdateTicketPayload): Promise<UpdateTicketResponse> =>
      api.patch<UpdateTicketResponse>(`/servicios/tickets/${id}`, data).then(r => r.data),

    // REQ-226 — Agendar/Reagendar. 422 con { message } si el técnico no atiende este tipo (RN2).
    schedule: (id: number, data: ScheduleTicketPayload): Promise<TicketDetail> =>
      api.patch<TicketDetail>(`/servicios/tickets/${id}/agendar`, data).then(r => r.data),

    // REQ-227 — Cancelar ticket. RN6: motivo obligatorio. 422 con { message } si ya está
    // cancelado (RN4).
    cancel: (id: number, motivo: string): Promise<TicketDetail> =>
      api.patch<TicketDetail>(`/servicios/tickets/${id}/cancelar`, { motivo }).then(r => r.data),

    // REQ-228 — Ver/Imprimir PDF. Mismo patrón blob que catalogApi.sendPdf()/projects.exportCsv().
    downloadPdf: async (id: number, numero: string): Promise<void> => {
      const res = await api.get(`/servicios/tickets/${id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `Ticket-${numero}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },

    // REQ-245/246/247/249 — formulario completo de Nuevo ticket. Devuelve el mismo shape que
    // GET /servicios/tickets/{id} (TicketService::detail()), no el modelo crudo.
    create: (data: CreateTicketPayload): Promise<TicketDetail> =>
      api.post<TicketDetail>('/servicios/tickets', data).then(r => r.data),

    // REQ-248, Batch 4 — sube un adjunto DESPUÉS de crear el ticket (el id del padre debe existir
    // primero, mismo patrón que crm.DocumentController.store()). El backend valida cantidad
    // máxima/tamaño/extensión (ServiciosSettingsService) y devuelve 422 con { message } si no pasa.
    uploadAttachment: (ticketId: number, file: File): Promise<TicketAttachment> => {
      const form = new FormData()
      form.append('file', file)
      return api.post<TicketAttachment>(`/servicios/tickets/${ticketId}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // REQ-248 — URL firmada de 15 min para ver/descargar un adjunto (mismo patrón que
    // crm.DocumentController::url()).
    attachmentUrl: (attachmentId: number): Promise<{ url: string; filename: string }> =>
      api.get<{ url: string; filename: string }>(`/servicios/tickets/attachments/${attachmentId}/url`)
        .then(r => r.data),

    // SCRUM-781 (punto 1, REQ-225 RN2) — agregar/editar/quitar productos reclamados/afectados
    // desde la edición de un ticket ya existente. Los 3 devuelven el detalle completo del ticket
    // (mismo shape que get()), para refrescar la lista de productos de una sola vez.
    addProduct: (ticketId: number, data: { catalog_product_id: number; cantidad_reclamo: number }): Promise<TicketDetail> =>
      api.post<TicketDetail>(`/servicios/tickets/${ticketId}/products`, data).then(r => r.data),

    updateProductQuantity: (ticketId: number, productId: number, cantidadReclamo: number): Promise<TicketDetail> =>
      api.patch<TicketDetail>(`/servicios/tickets/${ticketId}/products/${productId}`, { cantidad_reclamo: cantidadReclamo }).then(r => r.data),

    removeProduct: (ticketId: number, productId: number): Promise<TicketDetail> =>
      api.delete<TicketDetail>(`/servicios/tickets/${ticketId}/products/${productId}`).then(r => r.data),
  },

  technicians: {
    // Opciones para el select de filtro (REQ-217) o del modal de Agendar (REQ-226 RN2) — lista
    // liviana, no el listado completo de Técnicos Internos (Batch 6, fuera de alcance acá).
    // Con `tipo`, el backend ya filtra por especialidad (Garantías → solo Garantias Servicios Test).
    internalOptions: (tipo?: TicketType): Promise<TechnicianOption[]> =>
      api.get<{ data: TechnicianOption[] }>('/servicios/technicians/internal', {
        params: { fields: 'options', ...(tipo ? { tipo } : {}) },
      }).then(r => r.data.data),
  },

  // REQ-246/247 — buscador de solo lectura para el formulario de Nuevo ticket. RN1: Servicios
  // nunca crea Cliente Master/Subcliente/Proyecto, solo busca/selecciona lo que ya existe.
  lookup: {
    masterClients: (search = ''): Promise<MasterClientOption[]> =>
      api.get<{ data: MasterClientOption[] }>('/servicios/lookup/master-clients', {
        params: { search },
      }).then(r => r.data.data),

    // RN3 — acotado al Master ya elegido.
    subClients: (masterClientId: number, search = ''): Promise<SubClientOption[]> =>
      api.get<{ data: SubClientOption[] }>(`/servicios/lookup/master-clients/${masterClientId}/sub-clients`, {
        params: { search },
      }).then(r => r.data.data),

    // RN4 — solo los proyectos ya existentes del Subcliente elegido, sin buscador (select simple).
    projects: (subClientId: number): Promise<ProjectOption[]> =>
      api.get<{ data: ProjectOption[] }>(`/servicios/lookup/sub-clients/${subClientId}/projects`)
        .then(r => r.data.data),

    // RN3/RN4 — `exclude` deja fuera los productos ya agregados en el ticket (no-duplicados).
    // SCRUM-781 (punto 4.2) — `salesProjectId` opcional: si viene, el backend filtra a solo los
    // productos REALMENTE ENTREGADOS a ese proyecto (cadena Bodega — sin FK directa en el modelo,
    // ver docblock de ProductLookupController::index()). Sin este param, catálogo completo (mismo
    // comportamiento de siempre, usado también por el ítem Producto de Cotización).
    products: (search = '', exclude: number[] = [], salesProjectId?: number | null): Promise<ProductOption[]> =>
      api.get<{ data: ProductOption[] }>('/servicios/lookup/products', {
        params: {
          search,
          ...(exclude.length ? { exclude: exclude.join(',') } : {}),
          ...(salesProjectId != null ? { sales_project_id: salesProjectId } : {}),
        },
      }).then(r => r.data.data),
  },

  // Fase 4 — Servicios, Batch 5 (REQ-263→267). Técnicos externos.
  externalTechnicians: {
    // REQ-263 — listado + chips de estado, envuelto con meta/counts (mismo patrón que
    // bodegaApi.orders.list para paginación + conteos en una sola llamada).
    list: (filters: ExternalTechnicianFilters = {}): Promise<ExternalTechnicianListResponse> =>
      api.get<ExternalTechnicianListResponse>('/servicios/external-technicians', { params: filters })
        .then(r => r.data),

    // REQ-265/266/267 — ficha completa (historial de tarifa + proyectos asignados, este último
    // vacío hasta que exista Cotización, Batch 11-12).
    get: (id: number): Promise<ExternalTechnicianDetail> =>
      api.get<ExternalTechnicianDetail>(`/servicios/external-technicians/${id}`).then(r => r.data),

    // REQ-264 — alta (RN4: solo Aaron/Líder de Servicios y Gerencia, ver la ruta).
    create: (data: CreateExternalTechnicianPayload): Promise<ExternalTechnician> =>
      api.post<ExternalTechnician>('/servicios/external-technicians', data).then(r => r.data),

    // REQ-266 — edita tarifa y/o el interruptor mostrar/ocultar (RN1: solo Aaron/Gerencia).
    updateTarifa: (id: number, data: UpdateExternalTechnicianRatePayload): Promise<ExternalTechnician> =>
      api.patch<ExternalTechnician>(`/servicios/external-technicians/${id}/tarifa`, data).then(r => r.data),

    // REQ-265 — activar/inactivar. RN2: si el backend responde 409 con
    // `requires_confirmation: true`, el frontend debe mostrar la advertencia y reintentar con
    // `confirm: true` — no se maneja acá, el caller (modal) decide.
    updateEstado: (id: number, estado: ExternalTechnicianStatus, confirm = false): Promise<ExternalTechnician> =>
      api.patch<ExternalTechnician>(`/servicios/external-technicians/${id}/estado`, { estado, confirm })
        .then(r => r.data),
  },

  // Fase 4 — Servicios, Batch 6 (REQ-255→260). Técnicos internos.
  internalTechnicians: {
    // REQ-255 — vista Equipo (tarjetas).
    list: (): Promise<InternalTechnician[]> =>
      api.get<{ data: InternalTechnician[] }>('/servicios/internal-technicians').then(r => r.data.data),

    // REQ-257 — visitas de hoy de un técnico, ya en orden cronológico.
    visitsToday: (id: number): Promise<InternalTechnicianVisit[]> =>
      api.get<{ data: InternalTechnicianVisit[] }>(`/servicios/internal-technicians/${id}/visitas-hoy`)
        .then(r => r.data.data),

    // REQ-259 — alta (RN5: solo Aaron/Líder de Servicios, ver la ruta).
    create: (data: CreateInternalTechnicianPayload): Promise<InternalTechnician> =>
      api.post<InternalTechnician>('/servicios/internal-technicians', data).then(r => r.data),

    // REQ-260 — Agenda equipo. `technicianId` acota a un único técnico (RN2). SCRUM-803 — `view`
    // ('day'|'week'|'month', default 'day' en el backend) + `date` (Y-m-d, default hoy) acotan el
    // periodo mostrado.
    agenda: (technicianId?: number, view?: CalendarPill, date?: string): Promise<InternalTechnicianAgendaEntry[]> =>
      api.get<{ data: InternalTechnicianAgendaEntry[] }>('/servicios/internal-technicians/agenda', {
        params: { ...(technicianId ? { technician_id: technicianId } : {}), ...(view ? { view } : {}), ...(date ? { date } : {}) },
      }).then(r => r.data.data),

    // REQ-261 — 3 tarjetas resumen del equipo.
    stats: (): Promise<InternalTechnicianTeamStats> =>
      api.get<InternalTechnicianTeamStats>('/servicios/internal-technicians/stats').then(r => r.data),

    // REQ-292 — captura mensual de comisión. Sin year/month, el backend resuelve el mes en
    // curso. `data: null` = "Pendiente de captura" (RN6).
    commissionCapture: (technicianId: number, year?: number, month?: number): Promise<CommissionCapture | null> =>
      api.get<{ data: CommissionCapture | null }>(`/servicios/internal-technicians/${technicianId}/commission-capture`, {
        params: year && month ? { year, month } : {},
      }).then(r => r.data.data),

    saveCommissionCapture: (technicianId: number, data: SaveCommissionCapturePayload): Promise<CommissionCapture> =>
      api.put<{ data: CommissionCapture }>(`/servicios/internal-technicians/${technicianId}/commission-capture`, data)
        .then(r => r.data.data),

    // REQ-292 RN2 — SLA por tipo de ticket.
    slaSettings: (): Promise<SlaSettings> =>
      api.get<{ data: SlaSettings }>('/servicios/internal-technicians/sla-settings').then(r => r.data.data),

    updateSlaSettings: (data: Partial<SlaSettings>): Promise<SlaSettings> =>
      api.patch<{ data: SlaSettings }>('/servicios/internal-technicians/sla-settings', data).then(r => r.data.data),

    // Batch 10 (REQ-258) — tarjeta+detalle, RN8: 403 si el actor no es Gerencia ni el propio
    // técnico (el caller no debería mostrar el botón en ese caso, ver InternalTechnicianCard).
    // `data: null` = sin captura del período, mismo criterio que commissionCapture().
    commission: (technicianId: number, year?: number, month?: number): Promise<TechnicianCommissionResult | null> =>
      api.get<{ data: TechnicianCommissionResult | null }>(`/servicios/internal-technicians/${technicianId}/commission`, {
        params: year && month ? { year, month } : {},
      }).then(r => r.data.data),
  },

  // Batch 10 (decisión de Luis 2026-08-11) — pantalla "Ajustes de Servicios". Lectura amplia,
  // escritura exclusiva de Gerencia (ver rutas).
  settings: {
    list: (): Promise<ServiciosSetting[]> =>
      api.get<{ data: ServiciosSetting[] }>('/servicios/settings').then(r => r.data.data),

    // Solo manda las keys modificadas — el backend ignora cualquier key desconocida.
    // Batch 12 (REQ-237) — `string` admite `condiciones_cotizacion_servicios` (type: 'text'), el
    // backend distingue por `fieldType()` y exime esa key de la validación numérica genérica
    // (ver ServiciosSettingsController::update()).
    update: (data: Record<string, number | string>): Promise<ServiciosSetting[]> =>
      api.patch<{ data: ServiciosSetting[] }>('/servicios/settings', data).then(r => r.data.data),
  },

  // Fase 4 — Servicios, Batch 8 (REQ-238→243). Informe de Inspección.
  inspectionReports: {
    // REQ-239 — catálogo dinámico de campos para este ticket (tipo/subtipo/productos), fuente
    // única de verdad compartida con el backend (InspectionReportService::fieldsForTicket()).
    fields: (ticketId: number): Promise<InspectionReportField[]> =>
      api.get<{ data: InspectionReportField[] }>(`/servicios/tickets/${ticketId}/inspection-report/fields`)
        .then(r => r.data.data),

    // 404 = todavía no se generó el informe — se resuelve como `null`, no como error, para que el
    // modal decida entre precargar un borrador vacío o el informe existente.
    get: (ticketId: number): Promise<InspectionReportDetail | null> =>
      api.get<InspectionReportDetail>(`/servicios/tickets/${ticketId}/inspection-report`)
        .then(r => r.data)
        .catch((err: unknown) => {
          if (isAxiosError(err) && err.response?.status === 404) return null
          throw err
        }),

    // Modo formulario — JSON puro, sin archivo (ver docblock de InspectionReportService::save()
    // sobre por qué el modo archivo_subido usa un endpoint POST separado).
    save: (ticketId: number, data: SaveInspectionReportPayload): Promise<InspectionReportDetail> =>
      api.put<InspectionReportDetail>(`/servicios/tickets/${ticketId}/inspection-report`, data).then(r => r.data),

    // REQ-243 — modo alternativo "Súbelo aquí". POST porque sube un archivo real.
    saveUpload: (ticketId: number, data: SaveInspectionReportUploadPayload): Promise<InspectionReportDetail> => {
      const form = new FormData()
      if (data.archivo) form.append('archivo', data.archivo)
      if (data.firma_tecnico_nombre) form.append('firma_tecnico_nombre', data.firma_tecnico_nombre)
      if (data.firma_cliente_nombre) form.append('firma_cliente_nombre', data.firma_cliente_nombre)
      return api.post<InspectionReportDetail>(`/servicios/tickets/${ticketId}/inspection-report/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // Batch 10 (REQ-251→254) — Informe móvil, un solo POST al confirmar la firma. `payload` viaja
    // como JSON string (no multipart anidado, ver docblock del controller); `data` sin la firma
    // se reusa tal cual.
    saveMobile: (ticketId: number, data: SaveInspectionReportMobilePayload): Promise<InspectionReportDetail> => {
      const { firma_cliente_imagen, ...payload } = data
      const form = new FormData()
      form.append('payload', JSON.stringify(payload))
      form.append('firma_cliente_imagen', firma_cliente_imagen, 'firma.png')
      return api.post<InspectionReportDetail>(`/servicios/tickets/${ticketId}/inspection-report/mobile`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // REQ-241 RN1 — fotos "antes"/"después". Requiere que el informe ya exista (mismo patrón que
    // tickets.uploadAttachment: el id del padre debe existir primero).
    uploadPhoto: (ticketId: number, file: File, categoria: InspectionReportPhotoCategoria): Promise<InspectionReportPhoto> => {
      const form = new FormData()
      form.append('file', file)
      form.append('categoria', categoria)
      return api.post<InspectionReportPhoto>(`/servicios/tickets/${ticketId}/inspection-report/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // REQ-244 — Ver/Imprimir. Informe lleno, solo disponible cuando ya existe (el modal solo
    // ofrece este botón después de Completado). Mismo patrón blob que tickets.downloadPdf().
    downloadPdf: async (ticketId: number, numero: string): Promise<void> => {
      const res = await api.get(`/servicios/tickets/${ticketId}/inspection-report/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `Informe-Inspeccion-${numero}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },

    // REQ-244 — plantilla en blanco, disponible antes de completar el informe.
    downloadBlankPdf: async (ticketId: number, ticketNumero: string): Promise<void> => {
      const res = await api.get(`/servicios/tickets/${ticketId}/inspection-report/pdf/blank`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `Informe-Inspeccion-${ticketNumero}-plantilla.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },
  },

  // Fase 4 — Servicios, Batch 9 (REQ-278/279). Hoja de Reclamo.
  claimSheets: {
    get: (ticketId: number): Promise<ClaimSheetDetail> =>
      api.get<ClaimSheetDetail>(`/servicios/tickets/${ticketId}/claim-sheet`).then(r => r.data),

    save: (ticketId: number, data: SaveClaimSheetPayload): Promise<ClaimSheetDetail> =>
      api.put<ClaimSheetDetail>(`/servicios/tickets/${ticketId}/claim-sheet`, data).then(r => r.data),

    // REQ-279 — solo disponible con la hoja ya Completada (RN2). Mismo patrón blob que
    // inspectionReports.downloadPdf().
    downloadPdf: async (ticketId: number, ticketNumero: string): Promise<void> => {
      const res = await api.get(`/servicios/tickets/${ticketId}/claim-sheet/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `Hoja-Reclamo-Ticket-${ticketNumero}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },
  },

  // Fase 4 — Servicios, Batch 11 (REQ-229→234). Cotización de Servicio.
  serviceQuotes: {
    // REQ-229 — precarga + cotización más reciente (o null si nunca se generó ninguna).
    get: (ticketId: number): Promise<ServiceQuoteDetail> =>
      api.get<ServiceQuoteDetail>(`/servicios/tickets/${ticketId}/quote`).then(r => r.data),

    // REQ-229 RN2 / REQ-234 — "Generar cotización" (primera vez) o "Generar nueva cotización"
    // (la más reciente está Rechazada). 422 con { message } si el gate de Informe de Inspección
    // no está listo, o si ya existe una cotización que no está Rechazada.
    generate: (ticketId: number): Promise<ServiceQuoteDetail> =>
      api.post<ServiceQuoteDetail>(`/servicios/tickets/${ticketId}/quote`).then(r => r.data),

    // REQ-233 — "Guardar" sobre el Borrador (descuento/observaciones). Nunca cambia el estado.
    save: (ticketId: number, data: SaveServiceQuotePayload): Promise<ServiceQuoteDetail> =>
      api.put<ServiceQuoteDetail>(`/servicios/tickets/${ticketId}/quote`, data).then(r => r.data),

    // REQ-234 — único disparador de Borrador -> Enviada. 422 si no tiene ítems.
    send: (ticketId: number): Promise<ServiceQuoteDetail> =>
      api.patch<ServiceQuoteDetail>(`/servicios/tickets/${ticketId}/quote/enviar`).then(r => r.data),

    // REQ-234 — Aprobar/Rechazar, exclusivo de Aaron/lider_servicios (ver la ruta).
    decide: (ticketId: number, estado: Extract<ServiceQuoteStatus, 'approved' | 'rejected'>): Promise<ServiceQuoteDetail> =>
      api.patch<ServiceQuoteDetail>(`/servicios/tickets/${ticketId}/quote/decidir`, { estado }).then(r => r.data),

    // Batch 12 (REQ-235/236, SCRUM-298/299) — documento formal "Ver/Imprimir" de una versión
    // puntual (draft/sent/approved/rejected, cualquiera del historial — REQ-236 abre cada fila
    // del historial con este mismo endpoint, ver docblock de ServiceQuoteController::document()).
    //
    // A diferencia de tickets.downloadPdf()/inspectionReports.downloadPdf() (que SÍ deben forzar
    // una descarga a disco — son documentos que el usuario archiva), acá el mismo PDF cubre DOS
    // roles distintos del ticket: "Ver" (REQ-236 RN2/Escenario 2 — historial, "abre esa cotización
    // específica en modo de solo lectura") e "Imprimir" (REQ-235 RN4 — deben ser exactamente el
    // mismo documento). El diseño original forzaba `<a download>` en los dos casos, rompiendo
    // "Ver": el navegador nunca renderizaba nada, solo guardaba el archivo en Descargas sin abrir
    // ninguna vista (hallazgo Visual Review, Batch 12). Ahora solo trae el Blob — el caller
    // (ServiceQuoteModal/ServiceQuotesHistoryPage) lo muestra en `ServiceQuotePdfViewerModal`
    // (iframe embebido en la propia app, ver docblock de ese componente para por qué NO es una
    // pestaña nueva — Chrome bloquea la navegación de una pestaña nueva a un `blob:` ajeno).
    document: (ticketId: number, quoteId: number): Promise<Blob> =>
      api.get(`/servicios/tickets/${ticketId}/quote/${quoteId}/document`, { responseType: 'blob' }).then(r => r.data as Blob),

    // REQ-236 — historial completo del ticket, TODAS las versiones (incluidas las reemplazadas),
    // más reciente primero.
    history: (ticketId: number): Promise<ServiceQuoteHistoryEntry[]> =>
      api.get<{ data: ServiceQuoteHistoryEntry[] }>(`/servicios/tickets/${ticketId}/quotes`).then(r => r.data.data),

    // REQ-250 — historial global transversal a todo el equipo (no anidado bajo /tickets/{id}).
    // `estado` filtra la lista; `counts` siempre refleja el total sin filtrar.
    globalHistory: (estado?: ServiceQuoteStatus): Promise<ServiceQuoteGlobalHistoryResponse> =>
      api.get<ServiceQuoteGlobalHistoryResponse>('/servicios/quotes', {
        params: estado ? { estado } : {},
      }).then(r => r.data),

    items: {
      // Devuelve solo { id } — el caller siempre refetchea el detalle completo de la cotización
      // (mismo patrón liviano que el resto de sub-recursos de este módulo).
      store: (ticketId: number, data: ServiceQuoteItemPayload): Promise<{ id: number }> =>
        api.post<{ id: number }>(`/servicios/tickets/${ticketId}/quote/items`, data).then(r => r.data),

      update: (ticketId: number, itemId: number, data: Partial<ServiceQuoteItemPayload>): Promise<{ id: number }> =>
        api.patch<{ id: number }>(`/servicios/tickets/${ticketId}/quote/items/${itemId}`, data).then(r => r.data),

      destroy: (ticketId: number, itemId: number): Promise<void> =>
        api.delete(`/servicios/tickets/${ticketId}/quote/items/${itemId}`).then(() => undefined),
    },
  },

  // Fase 4 — Servicios, Batch 17/18 (REQ-280→286, SCRUM-350→356). Página "Reportes". `year`/`month`
  // opcionales en los primeros 4 (default mes/año actual América/Panamá, resuelto server-side);
  // `completadosAnio` solo toma `year`; `biblioteca` no tiene período. El backend devuelve 422 si
  // `year`/`month` caen fuera de rango — el caller no necesita normalizarlos de antemano.
  reportes: {
    panoramaMes: (params: Partial<ReportsPeriodParams> = {}): Promise<ReportsPanoramaMes> =>
      api.get<ReportsPanoramaMes>('/servicios/reportes/panorama-mes', { params }).then(r => r.data),

    instalacionesCotizadasVsRealizadas: (params: Partial<ReportsPeriodParams> = {}): Promise<ReportsInstalacionesCotizadasVsRealizadas> =>
      api.get<ReportsInstalacionesCotizadasVsRealizadas>('/servicios/reportes/instalaciones-cotizadas-vs-realizadas', { params })
        .then(r => r.data),

    // Envuelto en { data: [...] } — se desenvuelve acá, mismo patrón que tickets.list().
    distribucionTipo: (params: Partial<ReportsPeriodParams> = {}): Promise<ReportsDistribucionTipoItem[]> =>
      api.get<{ data: ReportsDistribucionTipoItem[] }>('/servicios/reportes/distribucion-tipo', { params })
        .then(r => r.data.data),

    distribucionTecnico: (params: Partial<ReportsPeriodParams> = {}): Promise<ReportsDistribucionTecnicoItem[]> =>
      api.get<{ data: ReportsDistribucionTecnicoItem[] }>('/servicios/reportes/distribucion-tecnico', { params })
        .then(r => r.data.data),

    // Siempre desde enero (el backend ignora cualquier mes que se le mande) — solo `year` importa.
    completadosAnio: (year?: number): Promise<ReportsCompletadosAnioItem[]> =>
      api.get<{ data: ReportsCompletadosAnioItem[] }>('/servicios/reportes/completados-anio', {
        params: year ? { year } : {},
      }).then(r => r.data.data),

    // REQ-286 — 403 si el actor no califica (ni Gerencia ni el propio Tecnico Servicios Test). El caller
    // (ReportsCommissionSection) no debe llamar este endpoint si no califica (`enabled: false`),
    // el 403 acá es solo la segunda línea de defensa del backend, no un caso que el frontend maneje.
    comisionCarlosVergara: (params: Partial<ReportsPeriodParams> = {}): Promise<ReportsComisionCarlosVergara> =>
      api.get<{ data: ReportsComisionCarlosVergara }>('/servicios/reportes/comision-carlos-vergara', { params })
        .then(r => r.data.data),

    // Devuelve { data, meta } completo, sin desenvolver — se pasa directo a <Pagination meta={...}/>.
    biblioteca: (filters: ReportsBibliotecaFilters = {}): Promise<ReportsBibliotecaResponse> =>
      api.get<ReportsBibliotecaResponse>('/servicios/reportes/biblioteca', { params: filters }).then(r => r.data),
  },

  // Fase 4 — Servicios, Batch 13 Grupo D parte 1 (REQ-268→272). Herramientas.
  // Contrato RECONCILIADO 2026-08-12 contra ToolController.php/ToolService.php reales (Backend
  // Dev, commit 3fb46bb) — ver docblock en types/servicios.ts sobre los 3 puntos que difirieron
  // del contrato asumido originalmente.
  tools: {
    // REQ-268 — listado plano de unidades, agrupado en el cliente (mismo criterio que
    // externalTechnicians: sin endpoint de "grupos" propio). NO incluye las solicitudes de
    // herramienta nueva (REQ-271) — esas viven en purchaseRequests() abajo.
    list: (filters: ToolFilters = {}): Promise<Tool[]> =>
      api.get<{ data: Tool[] }>('/servicios/tools', { params: filters }).then(r => r.data.data),

    // GET /servicios/tools/purchase-requests — TODAS las solicitudes (pendientes y ya recibidas).
    // El cliente filtra `estado === 'solicitado' && source_tool_id === null` para las filas
    // "pendiente de recibir" de REQ-271 (ver ToolTable.tsx).
    purchaseRequests: (): Promise<ToolPurchaseRequest[]> =>
      api.get<ToolPurchaseRequestsResponse>('/servicios/tools/purchase-requests').then(r => r.data.data),

    // REQ-269 — el backend resuelve `responsable_incidente` server-side, el frontend solo manda
    // el estado nuevo. SCRUM-779 — `detalle` opcional (obligatorio en la UI para
    // Dañada/Perdida/Desgaste, ver ToolEstadoSelect.tsx) — sin él el Kardex quedaba sin
    // descripción del incidente para esos 3 tipos.
    changeEstado: (id: number, estado: ToolEstado, detalle?: string): Promise<Tool> =>
      api.patch<Tool>(`/servicios/tools/${id}/estado`, { estado, detalle }).then(r => r.data),

    // REQ-270 — `assignedToTechnicianId` null = "En bodega de herramientas". El backend devuelve
    // `assigned_since` ya actualizada, nunca se calcula en el cliente.
    reassign: (id: number, assignedToTechnicianId: number | null): Promise<Tool> =>
      api.patch<Tool>(`/servicios/tools/${id}/asignacion`, { assigned_to_technician_id: assignedToTechnicianId })
        .then(r => r.data),

    // REQ-271 (alta nueva, `{ nombre, cantidad }`) / REQ-272 (reposición, `{ tool_id, cantidad }`).
    // Asimetría real: el body manda `tool_id`, pero la respuesta usa `source_tool_id` (ver
    // ToolPurchaseRequest en types/servicios.ts) — no se unifica, así confirmó Backend Dev que
    // viaja de verdad.
    requestPurchase: (data: CreateToolPurchaseRequestPayload): Promise<ToolPurchaseRequest> =>
      api.post<ToolPurchaseRequest>('/servicios/tools/purchase-requests', data).then(r => r.data),

    // Genera las unidades reales (cada una con código nuevo, todas en bodega). La respuesta real
    // es la purchase request actualizada (estado 'recibida') spreadeada + `tools: Tool[]` — no
    // `{ data: Tool[] }` como se había asumido originalmente.
    receivePurchase: (requestId: number): Promise<Tool[]> =>
      api.post<ReceiveToolPurchaseResponse>(`/servicios/tools/purchase-requests/${requestId}/recibir`)
        .then(r => r.data.tools),
  },

  // Fase 4 — Servicios, Batch Grupo D parte 2 (REQ-273→275, SCRUM-343→345). Insumos.
  // Contrato RECONCILIADO 2026-08-13 contra InsumoController/InsumoService reales — ver los 5
  // puntos de ajuste en docblock de types/servicios.ts (Insumo/InsumoPurchaseRequest).
  insumos: {
    list: (): Promise<Insumo[]> =>
      api.get<{ data: Insumo[] }>('/servicios/insumos').then(r => r.data.data),

    // REQ-274 — RECONCILIADO 2026-08-13: la respuesta NO es el `Insumo` actualizado (se había
    // asumido eso originalmente) — es el resource `InsumoPurchaseRequest`, forma distinta. El
    // caller (InsumoRequestModal) no intenta mergearla en la fila, solo invalida `insumos.list()`.
    requestPurchase: (id: number, data: CreateInsumoSolicitudPayload): Promise<InsumoPurchaseRequest> =>
      api.post<InsumoPurchaseRequest>(`/servicios/insumos/${id}/solicitar`, data).then(r => r.data),

    // REQ-275 — RECONCILIADO 2026-08-13: NO existe /servicios/insumos/catalog-search — el
    // catálogo real es el mismo lookup.products() de tickets (ver `lookup` abajo), ya excluyendo
    // los insumos ya trackeados vía `exclude` (mismo criterio que TicketCreateModal).

    create: (data: CreateInsumoPayload): Promise<Insumo> =>
      api.post<Insumo>('/servicios/insumos', data).then(r => r.data),
  },

  // Fase 4 — Servicios, Batch Grupo D parte 2 (REQ-276, SCRUM-346). Kardex de herramientas — solo
  // lectura, sin mutaciones. Contrato RECONCILIADO 2026-08-13 — ver docblock de ToolKardexEntry en
  // types/servicios.ts sobre por qué no hay cantidad/saldo (pregunta de producto abierta a Luis).
  toolMovements: {
    list: (filters: ToolKardexFilters = {}): Promise<ToolKardexEntry[]> =>
      api.get<{ data: ToolKardexEntry[] }>('/servicios/tools/movements', { params: filters })
        .then(r => r.data.data),
  },
}
