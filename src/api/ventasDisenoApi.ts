import api from './authApi'
import type { ApprovalPendingItem } from '@/lib/homeCards'
import type {
  PipelineCard, PipelineCardDetail, PipelineCardCreatePayload, PipelineCardUpdatePayload, PipelineCardContact,
  MasterClientRef, SubClientRef, PipelineStage, PipelineFileType, PipelineCardFile, PipelineCardFileUrl,
  ClientListResult, ClientDetail, ClientProjectRow, SubClientDetail, SubClientContact,
  CreateClientPayload, CreateSubClientPayload, SubClientCategory, TaxIdValidationResult, UpdateSubClientTaxDataPayload, FiscalDirectoryResult,
  Vendor, HomeSummary, DashboardSummary, DashboardRemindResult, CalendarEvent, CalendarEventPayload,
  Architect, ArchitectDetail, SalesProjectRef, QuoteDetail, QuotePayload, QuoteCreatePayload, QuoteCreateResult, QuoteContactRef,
  QuotePartRef, QuoteItemRef, QuoteItemPayload, QuoteValidationResult,
  ReportsSummary, ReportPeriod, SalesGoalRow, SalesGoalPayload, ReportSettingsValue,
  CommissionsSummary, QuoteListResult, AuditLogResult, PricingSettingsValue, QuoteConditionsSettingsValue, CatalogProductRef,
  SalesCommissionTier, SalesCommissionTierInput,
  CatalogProductFamilyRef, CatalogProductFamilyDetail, QuoteItemBulkResult,
  ProjectListResult, CatalogListResult, CatalogItem, CatalogTechnicalSheetUploadResult,
  CatalogPdfExportStatus, CatalogSendPdfResult,
  OrderListResult, OrderDetail, OrderStatus, OrdersSettingsValue, QuoteVersionsResult, QuoteItemPricePreview,
  PipelineCardProductDeliveryRow, PipelineCardProductDeliveryAssignmentPayload,
  Associate, AssociateInput, AssociateType,
} from '@/types/ventasDiseno'
import type { CatalogProductCategory } from '@/types/compras'
import type { OutlookCalendarEvent } from '@/types/calendar'

export interface PipelineFilters {
  scope?:    'own' | 'team'
  chip?:     'all' | 'final_stage' | 'stagnant' | 'approved'
  search?:   string
  order?:    'days' | 'value'
  owner_id?: number
  // SCRUM-854 — filtro multi-selección Vendedor/Diseñador (OR entre seleccionados), reemplaza
  // el uso de `owner_id` singular en este endpoint. `owner_id` queda para otros callers que ya
  // lo usaban (deep-links con un solo vendedor).
  owner_ids?: number[]
  // SCRUM-796 (secc. 1.1/1.2) — filtro NUEVO e independiente de `chip`, para deep-links
  // a cualquiera de los otros 5 stages (approved sigue yendo por `chip`, sin cambios).
  stage?:    PipelineStage
  // SCRUM-1128 — filtro "Pedidos": approved = paso a pedido completado, pending = aprobado en Pipeline
  // sin paso a pedido todavía.
  orders?:   'approved' | 'pending'
  // SCRUM-796 (secc. 1.3) — filtro por etiqueta de tipo de solicitud: SalesProject.tag
  // es un enum de 3 valores (design/quote/both), 'both' ya ES "Diseño + Cotización" —
  // un único valor, nunca una lista.
  tag?:      string
}

export interface ProjectListFilters {
  scope?:     'own' | 'team'
  owner_id?:  number
  // SCRUM-854 — filtro multi-selección Vendedor/Diseñador (OR entre seleccionados).
  owner_ids?: number[]
  search?:    string
  stage?:     PipelineStage
  tag?:       'design' | 'quote' | 'both'
  page?:      number
  per_page?:  number | 'all'
}

export interface ContactPayload {
  name:   string
  role:   string
  phone?: string | null
  email?: string | null
}

/** Lee un Blob como texto con `FileReader` (`Blob.text()` no existe en todos los entornos, p. ej. jsdom). */
function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

/**
 * Partidas e ítems de una cotización (`/ventas-diseno/quotes/{id}/parts/...`).
 */
export function buildQuotePartsApi(base: 'quotes') {
  return {
    create: (quoteId: number, name: string): Promise<QuotePartRef> =>
      api.post<QuotePartRef>(`/ventas-diseno/${base}/${quoteId}/parts`, { name }).then(r => r.data),

    update: (quoteId: number, partId: number, name: string): Promise<QuotePartRef> =>
      api.put<QuotePartRef>(`/ventas-diseno/${base}/${quoteId}/parts/${partId}`, { name }).then(r => r.data),

    remove: (quoteId: number, partId: number): Promise<void> =>
      api.delete(`/ventas-diseno/${base}/${quoteId}/parts/${partId}`).then(() => undefined),

    // SCRUM-849.7 — copia la partida (productos/referencias/descripciones) a una nueva,
    // independiente de la original. El caller solo invalida ['ventas-diseno-quote', quoteId].
    duplicate: (quoteId: number, partId: number): Promise<QuotePartRef> =>
      api.post<QuotePartRef>(`/ventas-diseno/${base}/${quoteId}/parts/${partId}/duplicate`).then(r => r.data),

    // SCRUM-1161 — drag and drop: manda TODAS las partidas de la cotización en el nuevo orden.
    reorder: (quoteId: number, partIds: number[]): Promise<void> =>
      api.put(`/ventas-diseno/${base}/${quoteId}/parts/reorder`, { part_ids: partIds }).then(() => undefined),

    items: {
      // SCRUM-1161 — drag and drop dentro de UNA partida: manda todos sus productos en el nuevo orden.
      reorder: (quoteId: number, partId: number, itemIds: number[]): Promise<void> =>
        api.put(`/ventas-diseno/${base}/${quoteId}/parts/${partId}/items/reorder`, { item_ids: itemIds }).then(() => undefined),

      create: (quoteId: number, partId: number, data: QuoteItemPayload): Promise<QuoteItemRef> =>
        api.post<QuoteItemRef>(`/ventas-diseno/${base}/${quoteId}/parts/${partId}/items`, data).then(r => r.data),

      update: (quoteId: number, partId: number, itemId: number, data: QuoteItemPayload): Promise<QuoteItemRef> =>
        api.put<QuoteItemRef>(`/ventas-diseno/${base}/${quoteId}/parts/${partId}/items/${itemId}`, data).then(r => r.data),

      // SCRUM-734 (RN9.1) — validación de margen en vivo, sin persistir.
      previewPrice: (quoteId: number, partId: number, itemId: number, unitPrice: number): Promise<QuoteItemPricePreview> =>
        api.post<QuoteItemPricePreview>(
          `/ventas-diseno/${base}/${quoteId}/parts/${partId}/items/${itemId}/preview-price`, { unit_price: unitPrice },
        ).then(r => r.data),

      remove: (quoteId: number, partId: number, itemId: number): Promise<void> =>
        api.delete(`/ventas-diseno/${base}/${quoteId}/parts/${partId}/items/${itemId}`).then(() => undefined),

      // SCRUM-849.6 — foto ad-hoc de un ítem personalizado (rechazada 422 para un ítem de
      // Catálogo real, ver QuoteItemController::uploadPhoto()).
      uploadPhoto: (quoteId: number, partId: number, itemId: number, file: File): Promise<QuoteItemRef> => {
        const form = new FormData()
        form.append('file', file)
        return api.post<QuoteItemRef>(
          `/ventas-diseno/${base}/${quoteId}/parts/${partId}/items/${itemId}/photo`, form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        ).then(r => r.data)
      },

      // REQ-037: agrega todos los productos de una familia de una sola vez.
      bulkCreate: (quoteId: number, partId: number, catalogProductIds: number[]): Promise<QuoteItemBulkResult> =>
        api.post<QuoteItemBulkResult>(`/ventas-diseno/${base}/${quoteId}/parts/${partId}/items/bulk`, {
          catalog_product_ids: catalogProductIds,
        }).then(r => r.data),
    },
  }
}

export type QuotePartsApi = ReturnType<typeof buildQuotePartsApi>

export const ventasDisenoApi = {
  pipeline: {
    list: (filters: PipelineFilters = {}): Promise<PipelineCard[]> =>
      api.get<{ data: PipelineCard[] }>('/ventas-diseno/pipeline', { params: filters }).then(r => r.data.data),

    get: (id: number): Promise<PipelineCardDetail> =>
      api.get<PipelineCardDetail>(`/ventas-diseno/pipeline/${id}`).then(r => r.data),

    create: (data: PipelineCardCreatePayload): Promise<PipelineCardDetail> =>
      api.post<PipelineCardDetail>('/ventas-diseno/pipeline', data).then(r => r.data),

    update: (id: number, data: PipelineCardUpdatePayload): Promise<PipelineCardDetail> =>
      api.put<PipelineCardDetail>(`/ventas-diseno/pipeline/${id}`, data).then(r => r.data),

    changeStage: (id: number, stage: PipelineStage): Promise<PipelineCardDetail> =>
      api.patch<PipelineCardDetail>(`/ventas-diseno/pipeline/${id}/stage`, { stage }).then(r => r.data),

    // SCRUM-1128 — aprobación explícita de Gerencia/Contabilidad; el backend genera el pedido una sola vez.
    passToOrder: (id: number): Promise<PipelineCardDetail> =>
      api.post<PipelineCardDetail>(`/ventas-diseno/pipeline/${id}/pass-to-order`).then(r => r.data),

    uploadFile: (id: number, type: PipelineFileType, file: File): Promise<PipelineCardFile> => {
      const form = new FormData()
      form.append('type', type)
      form.append('file', file)
      return api.post<PipelineCardFile>(`/ventas-diseno/pipeline/${id}/files`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // SCRUM-767 — URL presignada bajo demanda, nunca embebida en el listado (expira en 15 min).
    // `disposition` controla el Content-Disposition real que S3 devuelve: 'inline' (default, para
    // el visor embebido) vs 'attachment' (para forzar la descarga con el nombre de archivo
    // correcto — sin esto el navegador guarda el archivo con la key UUID interna de S3).
    fileUrl: (cardId: number, fileId: number, disposition: 'inline' | 'attachment' = 'inline'): Promise<PipelineCardFileUrl> =>
      api.get<PipelineCardFileUrl>(`/ventas-diseno/pipeline/${cardId}/files/${fileId}/url`, { params: { disposition } }).then(r => r.data),

    deleteFile: (cardId: number, fileId: number): Promise<void> =>
      api.delete(`/ventas-diseno/pipeline/${cardId}/files/${fileId}`).then(() => {}),

    // SCRUM-1121 — asociados del proyecto de la tarjeta (los mismos que ven sus cotizaciones).

    contacts: {
      create: (cardId: number, data: ContactPayload): Promise<PipelineCardContact> =>
        api.post<PipelineCardContact>(`/ventas-diseno/pipeline/${cardId}/contacts`, data).then(r => r.data),

      update: (cardId: number, contactId: number, data: ContactPayload): Promise<PipelineCardContact> =>
        api.put<PipelineCardContact>(`/ventas-diseno/pipeline/${cardId}/contacts/${contactId}`, data).then(r => r.data),

      remove: (cardId: number, contactId: number): Promise<void> =>
        api.delete(`/ventas-diseno/pipeline/${cardId}/contacts/${contactId}`).then(() => undefined),
    },

    // SCRUM-909 — "Asignar productos a entrega" (solo aplica con delivery_type==='partial').
    // Contrato asumido heurísticamente en paralelo con Backend Dev (worktree separado) — si el
    // shape real difiere, el Arquitecto lo reconcilia.
    productDeliveryAssignments: {
      // SCRUM-1027 — `draftDates`: fechas del borrador de edición (aún sin guardar), solo para
      // que el backend calcule la fecha sugerida sobre ellas.
      list: (cardId: number, draftDates?: string[]): Promise<PipelineCardProductDeliveryRow[]> =>
        api.get<{ data: PipelineCardProductDeliveryRow[] }>(
          `/ventas-diseno/pipeline/${cardId}/product-delivery-assignments`,
          draftDates && draftDates.length > 0 ? { params: { dates: draftDates } } : undefined,
        ).then(r => r.data.data),

      save: (cardId: number, assignments: PipelineCardProductDeliveryAssignmentPayload[]): Promise<PipelineCardProductDeliveryRow[]> =>
        api.put<{ data: PipelineCardProductDeliveryRow[] }>(`/ventas-diseno/pipeline/${cardId}/product-delivery-assignments`, { assignments }).then(r => r.data.data),
    },
  },

  // SCRUM-690/691/693 (REQ-610/611/613, Batch D) — pantalla "Lista de Proyectos". A diferencia
  // de pipeline.list() (client-side, hasta 500 filas), pagina desde el backend.
  projects: {
    list: (filters: ProjectListFilters = {}): Promise<ProjectListResult> =>
      api.get<ProjectListResult>('/ventas-diseno/projects', { params: filters }).then(r => r.data),

    // RN1 (REQ-613): descarga directa, no una pestaña nueva (mismo patrón que adminApi.exportCrm()).
    exportCsv: async (filters: ProjectListFilters = {}): Promise<void> => {
      const res = await api.get('/ventas-diseno/projects/export', { params: filters, responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `lista-proyectos-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    },
  },

  masterClients: {
    list: (search = ''): Promise<MasterClientRef[]> =>
      api.get<{ data: MasterClientRef[] }>('/ventas-diseno/master-clients', { params: { search } }).then(r => r.data.data),

    create: (name: string): Promise<MasterClientRef> =>
      api.post<MasterClientRef>('/ventas-diseno/master-clients', { name }).then(r => r.data),
  },

  subClients: {
    list: (masterClientId: number, search = ''): Promise<SubClientRef[]> =>
      api.get<{ data: SubClientRef[] }>('/ventas-diseno/sub-clients', { params: { master_client_id: masterClientId, search } }).then(r => r.data.data),

    /**
     * SCRUM-1011 — `fromDesignContext: true` solo desde el modal de nuevo proyecto en Diseño:
     * el Subcliente se crea sin su tarjeta Lead automática (acá no se está creando un Lead).
     */
    create: (masterClientId: number, businessName: string, taxId: string, taxIdDv: string, fromDesignContext = false): Promise<SubClientRef> =>
      api.post<SubClientRef>('/ventas-diseno/sub-clients', {
        master_client_id: masterClientId, business_name: businessName, tax_id: taxId, tax_id_dv: taxIdDv,
        ...(fromDesignContext ? { from_design_context: true } : {}),
      }).then(r => r.data),

    contacts: {
      list: (subClientId: number, search = ''): Promise<SubClientContact[]> =>
        api.get<{ data: SubClientContact[] }>(`/ventas-diseno/sub-clients/${subClientId}/contacts`, { params: { search } }).then(r => r.data.data),

      create: (subClientId: number, data: ContactPayload): Promise<SubClientContact> =>
        api.post<SubClientContact>(`/ventas-diseno/sub-clients/${subClientId}/contacts`, data).then(r => r.data),

      update: (subClientId: number, contactId: number, data: ContactPayload): Promise<SubClientContact> =>
        api.put<SubClientContact>(`/ventas-diseno/sub-clients/${subClientId}/contacts/${contactId}`, data).then(r => r.data),

      remove: (subClientId: number, contactId: number): Promise<void> =>
        api.delete(`/ventas-diseno/sub-clients/${subClientId}/contacts/${contactId}`).then(() => undefined),
    },

  },

  // Grupo 2 — pantalla Clientes (REQ-063 a REQ-070). Distinto de masterClients/
  // subClients arriba (esos cubren solo el flujo mínimo de vinculación desde
  // Pipeline, REQ-010).
  clients: {
    // SCRUM-754 (2026-08-18) — paginación real de backend, mismo contrato que projects.list.
    list: (filters: { search?: string; category?: SubClientCategory[]; stale?: boolean; page?: number; per_page?: number | 'all' } = {}): Promise<ClientListResult> =>
      api.get<ClientListResult>('/ventas-diseno/clients', { params: filters }).then(r => r.data),

    get: (id: number): Promise<ClientDetail> =>
      api.get<ClientDetail>(`/ventas-diseno/clients/${id}`).then(r => r.data),

    projects: (id: number): Promise<ClientProjectRow[]> =>
      api.get<{ data: ClientProjectRow[] }>(`/ventas-diseno/clients/${id}/projects`).then(r => r.data.data),

    create: (data: CreateClientPayload): Promise<ClientDetail> =>
      api.post<ClientDetail>('/ventas-diseno/clients', data).then(r => r.data),

    addSubClient: (masterClientId: number, data: CreateSubClientPayload): Promise<SubClientDetail> =>
      api.post<SubClientDetail>(`/ventas-diseno/clients/${masterClientId}/sub-clients`, data).then(r => r.data),

    updateSubClientCategory: (subClientId: number, category: SubClientCategory | null): Promise<SubClientDetail> =>
      api.patch<SubClientDetail>(`/ventas-diseno/clients/sub-clients/${subClientId}/category`, { category }).then(r => r.data),

    // SCRUM-1002 — valida un RUC/Cédula contra la DGI (vía MSL) y edita los datos fiscales de un SubCliente.
    fiscalDirectory: (params: { search?: string; page?: number; per_page?: number }): Promise<FiscalDirectoryResult> =>
      api.get<FiscalDirectoryResult>('/ventas-diseno/clients/fiscal-directory', { params }).then(r => r.data),

    validateTaxId: (taxId: string): Promise<TaxIdValidationResult> =>
      api.post<TaxIdValidationResult>('/ventas-diseno/clients/validate-tax-id', { tax_id: taxId }).then(r => r.data),

    updateSubClientTaxData: (subClientId: number, data: UpdateSubClientTaxDataPayload): Promise<Pick<SubClientDetail, 'id' | 'master_client_id' | 'business_name' | 'receptor_tipo' | 'tax_id' | 'tax_id_dv'> & { itbms_exento?: boolean; exencion_a_revisar?: boolean }> =>
      api.patch(`/ventas-diseno/clients/sub-clients/${subClientId}/tax-data`, data).then(r => r.data),
  },

  // Grupo 3 — pantalla Inicio (REQ-056 a REQ-062).
  home: {
    vendors: (): Promise<Vendor[]> =>
      api.get<{ data: Vendor[] }>('/ventas-diseno/home/vendors').then(r => r.data.data),

    summary: (filters: { scope?: 'own' | 'team'; owner_id?: number } = {}): Promise<HomeSummary> =>
      api.get<HomeSummary>('/ventas-diseno/home/summary', { params: filters }).then(r => r.data),

    // SCRUM-908 — tarjeta "Aprobaciones Pendientes".
    approvalsPending: (): Promise<{ data: ApprovalPendingItem[] }> =>
      api.get<{ data: ApprovalPendingItem[] }>('/ventas-diseno/home/approvals-pending').then(r => r.data),
  },

  // SCRUM-684→689 (REQ-604→609, Batch C) — Dashboard CRM, siempre equipo completo (sin scope).
  dashboard: {
    // SCRUM-854 — owner_ids filtra el mismo resumen por varios vendedores/diseñadores a la vez
    // (OR), recalculado en el backend, no un post-filtro visual.
    summary: (ownerIds?: number[]): Promise<DashboardSummary> =>
      api.get<DashboardSummary>('/ventas-diseno/dashboard/summary', {
        params: ownerIds && ownerIds.length > 0 ? { owner_ids: ownerIds } : undefined,
      }).then(r => r.data),

    remind: (): Promise<DashboardRemindResult> =>
      api.post<DashboardRemindResult>('/ventas-diseno/dashboard/remind').then(r => r.data),
  },

  // SCRUM-66 — lectura de Outlook real (Microsoft Graph), reemplaza a calendarEvents como fuente
  // de datos de la tarjeta "Mi calendario". Solo lectura, sin create/update/remove.
  calendar: {
    list: (filters: { scope?: 'own' | 'team'; owner_id?: number; from?: string; to?: string } = {}): Promise<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }> =>
      api.get<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }>('/ventas-diseno/calendar', { params: filters }).then(r => r.data),
  },

  calendarEvents: {
    list: (filters: { scope?: 'own' | 'team'; owner_id?: number; from?: string; to?: string } = {}): Promise<CalendarEvent[]> =>
      api.get<{ data: CalendarEvent[] }>('/ventas-diseno/calendar-events', { params: filters }).then(r => r.data.data),

    create: (data: CalendarEventPayload): Promise<CalendarEvent> =>
      api.post<CalendarEvent>('/ventas-diseno/calendar-events', data).then(r => r.data),

    update: (id: number, data: CalendarEventPayload): Promise<CalendarEvent> =>
      api.put<CalendarEvent>(`/ventas-diseno/calendar-events/${id}`, data).then(r => r.data),

    remove: (id: number): Promise<void> =>
      api.delete(`/ventas-diseno/calendar-events/${id}`).then(() => undefined),
  },

  // Cotización-A (REQ-024 a 032).
  quotes: {
    // Grupo 5 (REQ-079 a 082) — listado con tarjetas resumen, búsqueda y filtros.
    // SCRUM-854 — `owner_ids` es el filtro multi-selección nuevo (OR entre seleccionados);
    // `owner_id` queda para callers existentes con un solo vendedor.
    // SCRUM-912 (criterios 6/7) — `view: 'drafts'` pide la vista "Solo Borradores": el
    // backend ya excluye ahí los borradores de "nueva versión" de un proyecto confirmado.
    list: (filters: { scope?: 'own' | 'team'; owner_id?: number; owner_ids?: number[]; stage?: string; search?: string; view?: 'all' | 'drafts'; page?: number; per_page?: number | 'all' } = {}): Promise<QuoteListResult> =>
      api.get<QuoteListResult>('/ventas-diseno/quotes', { params: filters }).then(r => r.data),

    create: (data: QuoteCreatePayload): Promise<QuoteCreateResult> =>
      api.post<QuoteCreateResult>('/ventas-diseno/quotes', data).then(r => r.data),

    get: (id: number): Promise<QuoteDetail> =>
      api.get<QuoteDetail>(`/ventas-diseno/quotes/${id}`).then(r => r.data),

    validate: (id: number): Promise<QuoteValidationResult> =>
      api.get<QuoteValidationResult>(`/ventas-diseno/quotes/${id}/validate`).then(r => r.data),

    update: (id: number, data: QuotePayload): Promise<QuoteDetail> =>
      api.put<QuoteDetail>(`/ventas-diseno/quotes/${id}`, data).then(r => r.data),

    // Cotización-D (REQ-086/047/048): "Guardar borrador" bloquea (422 + missing)
    // si falta algún campo general; "Guardar y generar" además exige ≥1 ítem y
    // asigna folio. "Volver a Pipeline" mueve la tarjeta vinculada a "quote".
    saveDraft: (id: number, data: QuotePayload): Promise<QuoteDetail> =>
      api.post<QuoteDetail>(`/ventas-diseno/quotes/${id}/save-draft`, data).then(r => r.data),

    generate: (id: number): Promise<QuoteDetail> =>
      api.post<QuoteDetail>(`/ventas-diseno/quotes/${id}/generate`).then(r => r.data),

    // SCRUM-723 — reemplaza return-to-pipeline (ruta eliminada). Requiere folio ya
    // asignado (422 si no); marca la cotización como registrada oficialmente
    // (confirmed_at), lo que la hace visible en Pipeline/Cotizaciones/Reportes/Dashboard.
    // SCRUM-725 — `overrideMarginWarning` es la confirmación explícita del modal de
    // advertencia de margen (Gerencia/Gerencia2); sin violaciones de margen no hace nada.
    confirm: (id: number, overrideMarginWarning?: boolean): Promise<QuoteDetail> =>
      api.post<QuoteDetail>(`/ventas-diseno/quotes/${id}/confirm`, overrideMarginWarning ? { override_margin_warning: true } : undefined).then(r => r.data),

    // SCRUM-734 — "Usar como base para nueva versión": duplica una cotización YA
    // confirmada en un Borrador nuevo, editable, sobre el mismo proyecto.
    duplicate: (id: number): Promise<QuoteDetail> =>
      api.post<QuoteDetail>(`/ventas-diseno/quotes/${id}/duplicate`).then(r => r.data),

    // SCRUM-734 — historial de versiones confirmadas del proyecto al que pertenece
    // esta cotización, más la etapa actual de la tarjeta vinculada.
    versions: (id: number): Promise<QuoteVersionsResult> =>
      api.get<QuoteVersionsResult>(`/ventas-diseno/quotes/${id}/versions`).then(r => r.data),

    // SCRUM-766 — PDF real (plantilla única interna/externa/descarga, ver QuotePdfService en el
    // backend). Mismo patrón blob que serviciosApi.serviceQuotes.document() — se muestra en un
    // iframe (Object URL), nunca se navega directo a la URL del endpoint.
    pdf: (id: number, external: boolean): Promise<Blob> =>
      api.get(`/ventas-diseno/quotes/${id}/pdf`, { params: { external: external ? 1 : 0 }, responseType: 'blob' }).then(r => r.data as Blob),

    contacts: {
      create: (quoteId: number, subClientContactId: number): Promise<QuoteContactRef> =>
        api.post<QuoteContactRef>(`/ventas-diseno/quotes/${quoteId}/contacts`, { sub_client_contact_id: subClientContactId }).then(r => r.data),

      remove: (quoteId: number, contactId: number): Promise<void> =>
        api.delete(`/ventas-diseno/quotes/${quoteId}/contacts/${contactId}`).then(() => undefined),
    },

    // Cotización-B (REQ-035) — partidas e ítems (ver buildQuotePartsApi).
    parts: buildQuotePartsApi('quotes'),

    // SCRUM-1121 — asociados (base única): con proyecto son los del proyecto, sin proyecto los del borrador.
  },

  // Grupo 4 — pantalla Reportes (REQ-071 a 079).
  reports: {
    // SCRUM-854 — `owner_ids` filtra el recálculo de KPIs/gráficos/totales por varios
    // vendedores a la vez (OR), no un post-filtro visual sobre datos ya agregados.
    summary: (filters: { scope?: 'own' | 'team'; period?: ReportPeriod; owner_id?: number; owner_ids?: number[] } = {}): Promise<ReportsSummary> =>
      api.get<ReportsSummary>('/ventas-diseno/reports/summary', { params: filters }).then(r => r.data),

    goals: {
      list: (): Promise<SalesGoalRow[]> =>
        api.get<{ data: SalesGoalRow[] }>('/ventas-diseno/reports/goals').then(r => r.data.data),

      upsert: (userId: number, data: SalesGoalPayload): Promise<SalesGoalRow> =>
        api.put<SalesGoalRow>(`/ventas-diseno/reports/goals/${userId}`, data).then(r => r.data),
    },

    settings: {
      get: (): Promise<ReportSettingsValue> =>
        api.get<ReportSettingsValue>('/ventas-diseno/reports/settings').then(r => r.data),

      update: (data: Partial<ReportSettingsValue>): Promise<ReportSettingsValue> =>
        api.put<ReportSettingsValue>('/ventas-diseno/reports/settings', data).then(r => r.data),
    },

    commissions: {
      summary: (filters: { scope?: 'own' | 'team'; period?: ReportPeriod; owner_id?: number } = {}): Promise<CommissionsSummary> =>
        api.get<CommissionsSummary>('/ventas-diseno/reports/commissions', { params: filters }).then(r => r.data),

      markPaid: (cohortId: number): Promise<{ id: number; paid_at: string | null }> =>
        api.patch<{ id: number; paid_at: string | null }>(`/ventas-diseno/reports/commissions/${cohortId}/mark-paid`).then(r => r.data),
    },
  },

  // SCRUM-944/945 — tramos de comisión escalonada de vendedores (antes hardcodeados en
  // SalesTotalsService::percentFor()). Deliberadamente sin relación con
  // `adminContabApi.commissionsInternal.tiers` (Comisiones Internas) — coexisten, otro concepto.
  // Solo lectura + guardado atómico de la tabla completa: el backend retiró los endpoints por tramo
  // (Senior Review S1) porque permitían dejar huecos/solapamientos que el guardado atómico valida.
  salesCommissionTiers: {
    list: (): Promise<SalesCommissionTier[]> =>
      api.get<SalesCommissionTier[]>('/ventas-diseno/sales-commission-tiers').then(r => r.data),

    // Pre-QA SCRUM-945 (hallazgo A) — guardado atómico de la tabla completa: el backend valida
    // solapamientos/huecos sobre el conjunto entero (imposible tramo a tramo). Único punto de
    // contacto con ese contrato: `PUT` con `{ tiers: [...] }`, responde la lista guardada.
    replaceAll: (tiers: SalesCommissionTierInput[]): Promise<SalesCommissionTier[]> =>
      api.put<SalesCommissionTier[] | { data: SalesCommissionTier[] }>(
        '/ventas-diseno/sales-commission-tiers', { tiers },
      ).then(r => (Array.isArray(r.data) ? r.data : r.data.data)),
  },

  // REQ-033 (2026-07-12): fórmulas de Tipo de Precio configurables sin deploy.
  pricingSettings: {
    get: (): Promise<PricingSettingsValue> =>
      api.get<PricingSettingsValue>('/ventas-diseno/pricing-settings').then(r => r.data),

    update: (data: Partial<PricingSettingsValue>): Promise<PricingSettingsValue> =>
      api.put<PricingSettingsValue>('/ventas-diseno/pricing-settings', data).then(r => r.data),
  },

  // SCRUM-138 — texto global de Condiciones (REQ-046), reemplaza la edición por-cotización.
  quoteConditionsSettings: {
    get: (): Promise<QuoteConditionsSettingsValue> =>
      api.get<QuoteConditionsSettingsValue>('/ventas-diseno/quote-conditions-settings').then(r => r.data),

    update: (data: QuoteConditionsSettingsValue): Promise<QuoteConditionsSettingsValue> =>
      api.put<QuoteConditionsSettingsValue>('/ventas-diseno/quote-conditions-settings', data).then(r => r.data),
  },

  // REQ-036 (2026-07-12): buscador de productos del Catálogo.
  catalogProducts: {
    search: (search = ''): Promise<{ data: CatalogProductRef[]; fuzzy: boolean }> =>
      api.get<{ data: CatalogProductRef[]; fuzzy: boolean }>('/ventas-diseno/catalog-products', { params: { search } }).then(r => r.data),

    // SCRUM-734 (sección 9) — "Precio de catálogo" de referencia en el modal de
    // edición de precio de un ítem ya vinculado a un producto.
    get: (id: number): Promise<CatalogProductRef> =>
      api.get<CatalogProductRef>(`/ventas-diseno/catalog-products/${id}`).then(r => r.data),
  },

  // SCRUM-695→701 (REQ-615→622, Batch E del Epic CRM SCRUM-332) — pantalla "Catálogo" transversal.
  // Distinto de catalogProducts/catalogProductFamilies de arriba (esos son el buscador REQ-036
  // dentro de Cotización, sin cambios).
  catalog: {
    list: (filters: { search?: string; category?: CatalogProductCategory | ''; family_id?: number | ''; stock?: 'con' | 'sin' | ''; page?: number; per_page?: number | 'all' } = {}): Promise<CatalogListResult> =>
      api.get<CatalogListResult>('/ventas-diseno/catalog', { params: filters }).then(r => r.data),

    get: (id: number): Promise<CatalogItem> =>
      api.get<CatalogItem>(`/ventas-diseno/catalog/${id}`).then(r => r.data),

    technicalSheetUrl: (id: number): Promise<{ url: string }> =>
      api.get<{ url: string }>(`/ventas-diseno/catalog/${id}/technical-sheet`).then(r => r.data),

    uploadTechnicalSheet: (id: number, file: File): Promise<CatalogTechnicalSheetUploadResult> => {
      const form = new FormData()
      form.append('file', file)
      return api.post<CatalogTechnicalSheetUploadResult>(`/ventas-diseno/catalog/${id}/technical-sheet`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // RN2 (REQ-621): ejemplo fijo, no conectado a la selección real — descarga directa, mismo
    // patrón que projects.exportCsv().
    // SCRUM-702 (REQ-622): mecanismo real de "enviar catálogo" — genera un PDF dinámico en el
    // backend (completo o acotado a `product_ids`) y lo descarga, mismo patrón blob que
    // downloadExamplePdf().
    // SCRUM-998 — hasta `catalog_pdf_max_single_products` (configurable, 500 por defecto) el backend responde el PDF plano (200) y
    // se descarga acá mismo; por encima responde 202 con el identificador de una exportación en segundo plano (ZIP de volúmenes)
    // y el aviso con el enlace llega por notificación in-app. El 202 llega como Blob (`responseType: 'blob'`), por eso se parsea.
    sendPdf: async (mode: 'completo' | 'seleccionados', productIds?: number[]): Promise<CatalogSendPdfResult> => {
      const res = await api.post(
        '/ventas-diseno/catalog/send-pdf',
        { mode, ...(productIds ? { product_ids: productIds } : {}) },
        { responseType: 'blob' },
      )

      if (res.status === 202) {
        const body = JSON.parse(await blobToText(res.data as Blob)) as { export_id: string; total_products: number; volumes: number }

        return { queued: true, exportId: body.export_id, totalProducts: body.total_products, volumes: body.volumes }
      }

      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `Catalogo-Atlantic-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      return { queued: false }
    },

    // SCRUM-998 — estado (y, si está lista, la URL firmada de descarga) de una exportación en segundo plano.
    pdfExport: (exportId: string): Promise<CatalogPdfExportStatus> =>
      api.get<CatalogPdfExportStatus>(`/ventas-diseno/catalog/pdf-exports/${exportId}`).then(r => r.data),
  },

  // REQ-037 (2026-07-13): tab "Familias" del buscador de Catálogo.
  catalogProductFamilies: {
    list: (): Promise<{ data: CatalogProductFamilyRef[] }> =>
      api.get<{ data: CatalogProductFamilyRef[] }>('/ventas-diseno/catalog-product-families').then(r => r.data),

    get: (id: number): Promise<CatalogProductFamilyDetail> =>
      api.get<CatalogProductFamilyDetail>(`/ventas-diseno/catalog-product-families/${id}`).then(r => r.data),

    // SCRUM-237/240 (rebote de Gerencia Test 2026-08-12) — creación-por-nombre, antes inexistente
    // (solo había list/get). Usado por FamilyCombobox (src/components/compras/FamilyCombobox.tsx),
    // compartido entre el modal de edición (SCRUM-237) y el de creación (SCRUM-240) de producto.
    // TODO: backend batch4 — endpoint todavía no existe en el backend real al momento de este
    // commit (worktree de Backend Dev en paralelo, ver memoria
    // project_estrategia_batch4_compras_bodega_20260815.md). Shape esperado: body { name: string }
    // → 201 CatalogProductFamilyRef. Reconciliar en Senior Review si el shape real difiere.
    create: (name: string): Promise<CatalogProductFamilyRef> =>
      api.post<CatalogProductFamilyRef>('/ventas-diseno/catalog-product-families', { name }).then(r => r.data),
  },

  architects: {
    list: (subClientId: number, search = ''): Promise<Architect[]> =>
      api.get<{ data: Architect[] }>('/ventas-diseno/architects', { params: { sub_client_id: subClientId, search } }).then(r => r.data.data),

    // SCRUM-907 — directorio global (sin sub_client_id) para la pantalla "Arquitectos".
    listAll: (search = ''): Promise<Architect[]> =>
      api.get<{ data: Architect[] }>('/ventas-diseno/architects', { params: { search: search || undefined } }).then(r => r.data.data),

    get: (id: number): Promise<ArchitectDetail> =>
      api.get<ArchitectDetail>(`/ventas-diseno/architects/${id}`).then(r => r.data),

    // SCRUM-1121 — autocompletado de la base única de asociados (búsqueda global por nombre, correo, teléfono o documento).
    search: (query: string, type: AssociateType | 'all' = 'all'): Promise<Associate[]> =>
      api.get<{ data: Associate[] }>('/ventas-diseno/architects', { params: { search: query || undefined, type, limit: 20 } }).then(r => r.data.data),

    // SCRUM-1121 — `sub_client_id` ya no es obligatorio (la base es global). 409 = duplicado (ver AssociateDuplicateResponse);
    // `confirm_similar` reenvía una creación que solo tenía un nombre parecido.
    create: (data: { sub_client_id?: number | null; type?: AssociateType; name: string; phone?: string | null; email?: string | null; document?: string | null; confirm_similar?: boolean }): Promise<Architect> =>
      api.post<Architect>('/ventas-diseno/architects', data).then(r => r.data),

    createAssociate: (data: AssociateInput & { confirm_similar?: boolean }): Promise<Associate> =>
      api.post<Associate>('/ventas-diseno/architects', data).then(r => r.data),

    // SCRUM-734 (RN8.5) — edita el registro real del Arquitecto (asociado al
    // Subcliente), no una copia aislada de esta cotización.
    update: (id: number, data: { name: string; phone?: string | null; email?: string | null }): Promise<Architect> =>
      api.put<Architect>(`/ventas-diseno/architects/${id}`, data).then(r => r.data),
  },

  salesProjects: {
    list: (subClientId: number, search = ''): Promise<SalesProjectRef[]> =>
      api.get<{ data: SalesProjectRef[] }>('/ventas-diseno/sales-projects', { params: { sub_client_id: subClientId, search } }).then(r => r.data.data),

    create: (subClientId: number, name: string, tag?: string | null): Promise<SalesProjectRef> =>
      api.post<SalesProjectRef>('/ventas-diseno/sales-projects', { sub_client_id: subClientId, name, tag }).then(r => r.data),
  },

  // SCRUM-703→710 (REQ-623→630, Epic CRM Batch F) — "Pedidos". Sin scope Mías/Equipo explícito
  // en el filtro (REQ-629 RN4: el backend ya resuelve el alcance según el perfil, sin selector).
  orders: {
    // SCRUM-854 — `owner_ids` es el filtro multi-selección Vendedor/Diseñador (OR entre
    // seleccionados), mismo criterio que quotes.list de arriba.
    list: (filters: { search?: string; estado?: OrderStatus | ''; owner_ids?: number[]; page?: number; per_page?: number | 'all' } = {}): Promise<OrderListResult> =>
      api.get<OrderListResult>('/ventas-diseno/orders', { params: filters }).then(r => r.data),

    get: (id: number): Promise<OrderDetail> =>
      api.get<OrderDetail>(`/ventas-diseno/orders/${id}`).then(r => r.data),
  },

  ordersSettings: {
    get: (): Promise<OrdersSettingsValue> =>
      api.get<OrdersSettingsValue>('/ventas-diseno/orders-settings').then(r => r.data),

    update: (data: Partial<OrdersSettingsValue>): Promise<OrdersSettingsValue> =>
      api.put<OrdersSettingsValue>('/ventas-diseno/orders-settings', data).then(r => r.data),
  },

  auditLog: {
    list: (filters: { entity_type?: string; entity_id?: number; user_id?: number; from?: string; to?: string; page?: number } = {}): Promise<AuditLogResult> =>
      api.get<AuditLogResult>('/ventas-diseno/audit-log', { params: filters }).then(r => r.data),
  },
}
