import api from './authApi'
import type { OutlookCalendarEvent } from '@/types/calendar'
import type {
  FiscalSettings, FiscalSettingsPayload, ItbmsRate, CreateItbmsRatePayload,
  CompanyProfile, CompanyProfilePayload, Location, CreateLocationPayload, Contact, CreateContactPayload,
  BankAccount, CreateBankAccountPayload, BankMovement,
  InvoiceSummary, InvoiceListFilters, InvoiceListResult, InvoicePreviewResponse, CreateInvoicePayload,
  CreateInvoiceResult, InvoiceExportFormat, InvoiceDetail, InvoiceAgingResult,
  PaymentSummary, PaymentClientOption, OpenInvoicesResult, CreatePaymentPayload, Payment, PaymentMethod,
  PaymentHistorialFilters, PaymentHistorialResult, PaymentDetail, PaymentAttachmentDetail,
  AccountStatementClientOption, AccountStatementProjectOption, AccountStatement, AccountStatementFilters,
  NotaCreditoResumenMes, NotaCreditoItbmsRateOption, NotaCreditoFacturaOrigen,
  CreateNotaCreditoPayload, NotaCredito,
  PreviewCorreccionPayload, PreviewCorreccionResponse, RegisterCorreccionPayload,
  NotaCreditoHistorialFilters, NotaCreditoHistorialResult, NotaCreditoDetalle,
  NotaCreditoDevolucionDetail, NotaCreditoDecisionPayload, NotaCreditoComprobanteDetail,
  CommissionTier, CreateCommissionTierPayload, CommissionInternalSummary, CommissionInternalFilters,
  CommissionVendorOption, CommissionExportFormat, CommissionAccountStatement,
  CommissionExternalSummary, CommissionExternalFilters, ArchitectOption, ArchitectFiscalProfilePayload,
  BankAccountOption, ProposePercentPayload, DecidePercentPayload, UpdateCuentaPagoPayload,
  CashPositionHeader, CashPositionWindowDays, CashPositionProjected, CashPositionReal,
  DailyCashCount, UpdateDailyCashCountEntryPayload, CashFlowExportView,
  DailyCashCountHistoryResult, UploadRetentionAttachmentResult,
  PettyCashSummary, PettyCashPendingResult, PettyCashNewExpenseLine, PettyCashReportListItem,
  PettyCashReportDetail, PettyCashApproveResponse, CreatePettyCashReportPayload,
  PettyCashRejectedLine, PettyCashExpenseDetail, UpdatePettyCashExpensePayload,
  RejectPettyCashExpenseResponse, RejectPettyCashReportResponse,
  ReportsPeriodo, ReportsFelixCommission, ReportsCartera, ReportsVentas, ReportsFlujoCaja,
  CarteraCommissionTier, CreateCarteraCommissionTierPayload,
  ReportsComisiones, ReportsNotasCredito,
  ClientCollectionReport, ClientCollectionReportParams,
  InvoiceBookReport, InvoiceBookReportParams,
  PaymentMethodSalesReport, PaymentMethodSalesReportParams,
  HomePendientes,
  HomeResumenMes,
  HomeVencidosPorVencer,
} from '@/types/adminContab'

// Batch Configuración Fiscal (SCRUM-632→637). Pantalla exclusiva de Mark — el backend devuelve
// 403 en TODAS estas rutas (incluido el GET) para cualquier otro usuario, no solo en mutaciones.
export const adminContabApi = {
  fiscalSettings: {
    get: (): Promise<FiscalSettings> =>
      api.get<FiscalSettings>('/admin-contab/fiscal-settings').then(r => r.data),

    update: (data: Partial<FiscalSettingsPayload>): Promise<FiscalSettings> =>
      api.put<FiscalSettings>('/admin-contab/fiscal-settings', data).then(r => r.data),
  },

  itbmsRates: {
    list: (): Promise<ItbmsRate[]> =>
      api.get<ItbmsRate[]>('/admin-contab/itbms-rates').then(r => r.data),

    create: (data: CreateItbmsRatePayload): Promise<ItbmsRate> =>
      api.post<ItbmsRate>('/admin-contab/itbms-rates', data).then(r => r.data),

    // REQ-559 — desde el modal de detalle solo se puede activar/desactivar, no editar
    // nombre/descripción/porcentaje de una tasa ya creada (ningún REQ lo pide).
    setActive: (id: number, activa: boolean): Promise<ItbmsRate> =>
      api.put<ItbmsRate>(`/admin-contab/itbms-rates/${id}`, { activa }).then(r => r.data),

    remove: (id: number): Promise<void> =>
      api.delete(`/admin-contab/itbms-rates/${id}`).then(() => undefined),
  },

  // Batch Datos de la Empresa (SCRUM-638→642). Misma pantalla exclusiva de Mark.
  companyProfile: {
    get: (): Promise<CompanyProfile> =>
      api.get<CompanyProfile>('/admin-contab/company-profile').then(r => r.data),

    update: (data: Partial<CompanyProfilePayload>): Promise<CompanyProfile> =>
      api.put<CompanyProfile>('/admin-contab/company-profile', data).then(r => r.data),

    uploadLogo: (file: File): Promise<{ logo_url: string }> => {
      const form = new FormData()
      form.append('file', file)
      return api.post<{ logo_url: string }>('/admin-contab/company-profile/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },
  },

  locations: {
    list: (): Promise<Location[]> =>
      api.get<Location[]>('/admin-contab/locations').then(r => r.data),

    create: (data: CreateLocationPayload): Promise<Location> =>
      api.post<Location>('/admin-contab/locations', data).then(r => r.data),

    setActive: (id: number, activa: boolean): Promise<Location> =>
      api.put<Location>(`/admin-contab/locations/${id}`, { activa }).then(r => r.data),
  },

  contacts: {
    list: (): Promise<Contact[]> =>
      api.get<Contact[]>('/admin-contab/contacts').then(r => r.data),

    create: (data: CreateContactPayload): Promise<Contact> =>
      api.post<Contact>('/admin-contab/contacts', data).then(r => r.data),

    setActive: (id: number, activo: boolean): Promise<Contact> =>
      api.put<Contact>(`/admin-contab/contacts/${id}`, { activo }).then(r => r.data),
  },

  // Batch 1 del cuerpo principal (SCRUM-607→611). NO exclusiva de Mark — varios roles, el backend
  // gatea quién puede ver/editar cada acción (403 normal, no "acceso restringido" de pantalla).
  bankAccounts: {
    list: (): Promise<BankAccount[]> =>
      api.get<BankAccount[]>('/admin-contab/bank-accounts').then(r => r.data),

    create: (data: CreateBankAccountPayload): Promise<BankAccount> =>
      api.post<BankAccount>('/admin-contab/bank-accounts', data).then(r => r.data),

    deactivate: (id: number): Promise<BankAccount> =>
      api.put<BankAccount>(`/admin-contab/bank-accounts/${id}/deactivate`).then(r => r.data),

    reactivate: (id: number): Promise<BankAccount> =>
      api.put<BankAccount>(`/admin-contab/bank-accounts/${id}/reactivate`).then(r => r.data),
  },

  bankMovements: {
    list: (bankAccountId?: number): Promise<BankMovement[]> =>
      api.get<BankMovement[]>('/admin-contab/bank-movements', {
        params: bankAccountId !== undefined ? { bank_account_id: bankAccountId } : undefined,
      }).then(r => r.data),

    assignAccount: (id: number, bankAccountId: number): Promise<BankMovement> =>
      api.put<BankMovement>(`/admin-contab/bank-movements/${id}/assign-account`, { bank_account_id: bankAccountId }).then(r => r.data),
  },

  // Batch 2 del cuerpo principal (SCRUM-513→518). Ver nota de reconciliación en types/adminContab.ts
  // sobre `puede_facturar`/`estado` — siempre vienen calculados del backend.
  invoices: {
    summary: (): Promise<InvoiceSummary> =>
      api.get<InvoiceSummary>('/admin-contab/invoices/summary').then(r => r.data),

    list: (filters: InvoiceListFilters): Promise<InvoiceListResult> =>
      api.get<InvoiceListResult>('/admin-contab/invoices', { params: filters }).then(r => r.data),

    // aplicarSaldoFavor default true — RN1 REQ-442, la vista previa ofrece aplicar el saldo por defecto.
    preview: (orderIds: number[], aplicarSaldoFavor = true): Promise<InvoicePreviewResponse> =>
      api.post<InvoicePreviewResponse>('/admin-contab/invoices/preview', {
        order_ids: orderIds,
        aplicar_saldo_favor: aplicarSaldoFavor,
      }).then(r => r.data),

    create: (data: CreateInvoicePayload): Promise<CreateInvoiceResult> =>
      api.post<CreateInvoiceResult>('/admin-contab/invoices', data).then(r => r.data),

    // REQ-446 — descarga directa, mismo patrón que ventasDisenoApi.projects.exportCsv().
    export: async (format: InvoiceExportFormat, filters: Omit<InvoiceListFilters, 'view'>): Promise<void> => {
      const res = await api.get('/admin-contab/invoices/export', {
        params: { ...filters, format },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `facturacion-${new Date().toISOString().slice(0, 10)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
      a.click()
      URL.revokeObjectURL(url)
    },

    // Batch 4 (SCRUM-524→528).
    detail: (orderId: number): Promise<InvoiceDetail> =>
      api.get<InvoiceDetail>(`/admin-contab/invoices/${orderId}/detail`).then(r => r.data),

    markUncollectible: (orderId: number, motivo: string): Promise<InvoiceDetail> =>
      api.post<InvoiceDetail>(`/admin-contab/invoices/${orderId}/mark-uncollectible`, { motivo }).then(r => r.data),

    decideUncollectible: (orderId: number, approve: boolean): Promise<InvoiceDetail> =>
      api.put<InvoiceDetail>(`/admin-contab/invoices/${orderId}/uncollectible-decision`, { approve }).then(r => r.data),

    aging: (): Promise<InvoiceAgingResult> =>
      api.get<InvoiceAgingResult>('/admin-contab/invoices/aging').then(r => r.data),

    // Mismo patrón blob que export() — el endpoint exige el JWT en header, no se puede abrir con
    // un <a href> plano.
    downloadPdf: async (orderId: number, orderNumber: string): Promise<void> => {
      const res = await api.get(`/admin-contab/invoices/${orderId}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `factura-${orderNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },
  },

  // Batch 5 del cuerpo principal (SCRUM-539→544, REQ-462→467) — Cobros.
  payments: {
    summary: (): Promise<PaymentSummary> =>
      api.get<PaymentSummary>('/admin-contab/payments/summary').then(r => r.data),

    searchClients: (search: string): Promise<PaymentClientOption[]> =>
      api.get<{ data: PaymentClientOption[] }>('/admin-contab/payments/clients', { params: { search } })
        .then(r => r.data.data),

    openInvoices: (masterClientId: number): Promise<OpenInvoicesResult> =>
      api.get<OpenInvoicesResult>('/admin-contab/payments/open-invoices', { params: { master_client_id: masterClientId } })
        .then(r => r.data),

    defaultBankAccount: (metodoPago: PaymentMethod): Promise<{ id: number; label: string } | null> =>
      api.get<{ data: { id: number; label: string } | null }>('/admin-contab/payments/default-bank-account', {
        params: { metodo_pago: metodoPago },
      }).then(r => r.data.data),

    // REQ-468 — multipart cuando trae `comprobante` (archivo real), JSON en caso contrario.
    register: (payload: CreatePaymentPayload): Promise<Payment> => {
      if (!payload.comprobante) {
        return api.post<Payment>('/admin-contab/payments', payload).then(r => r.data)
      }

      const form = new FormData()
      for (const [key, value] of Object.entries(payload)) {
        if (value === null || value === undefined) continue
        if (key === 'comprobante') { form.append('comprobante', value as File); continue }
        if (key === 'invoice_ids') { (value as number[]).forEach(id => form.append('invoice_ids[]', String(id))); continue }
        // Laravel's `boolean` rule solo acepta 1/0/"1"/"0" — "true"/"false" (lo que da
        // String(bool) en JS) lo rechaza, así que un multipart con aplicar_saldo_favor:true fallaba
        // 422 en silencio antes de este ajuste.
        if (typeof value === 'boolean') { form.append(key, value ? '1' : '0'); continue }
        form.append(key, String(value))
      }
      return api.post<Payment>('/admin-contab/payments', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // Batch 6 del cuerpo principal (SCRUM-545→548, REQ-468→471) — historial+filtros y detalle.
    historial: (filters: PaymentHistorialFilters): Promise<PaymentHistorialResult> =>
      api.get<PaymentHistorialResult>('/admin-contab/payments', {
        params: {
          search: filters.search || undefined,
          cliente: filters.cliente || undefined,
          metodo: filters.metodo || undefined,
          estado: filters.estado || undefined,
          desde: filters.desde || undefined,
          hasta: filters.hasta || undefined,
        },
      }).then(r => r.data),

    detail: (id: number): Promise<PaymentDetail> =>
      api.get<PaymentDetail>(`/admin-contab/payments/${id}`).then(r => r.data),

    // Batch 7 del cuerpo principal (SCRUM-549→552, REQ-472→475) — ver comprobante/recibo formal/
    // confirmación manual. REQ-474 (apertura automática) no agrega nada acá, ya la cubre Batch 5.

    attachment: (id: number): Promise<PaymentAttachmentDetail | null> =>
      api.get<{ data: PaymentAttachmentDetail | null }>(`/admin-contab/payments/${id}/attachment`)
        .then(r => r.data.data),

    // Mismo patrón blob que invoices.downloadPdf() — el endpoint exige el JWT en header.
    downloadReceiptPdf: async (id: number, numeroRecibo: string): Promise<void> => {
      const res = await api.get(`/admin-contab/payments/${id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `recibo-${numeroRecibo}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },

    confirm: (id: number): Promise<PaymentDetail> =>
      api.put<PaymentDetail>(`/admin-contab/payments/${id}/confirm`).then(r => r.data),

    // Batch 19 (SCRUM-602→606, REQ-525) — constancia de retención, tabla propia
    // (`payment_retention_attachments`), distinta del comprobante de `attachment()` de arriba (ver
    // ADR-SCRUM602-606 §6). "Subir"/"Reemplazar" es el mismo endpoint, mismo criterio que
    // `commissionsExternal.uploadCuentaCobro()` — el backend decide server-side si crea o reemplaza.
    uploadRetentionAttachment: (paymentId: number, file: File): Promise<UploadRetentionAttachmentResult> => {
      const form = new FormData()
      form.append('file', file)
      return api.post<UploadRetentionAttachmentResult>(
        `/admin-contab/payments/${paymentId}/retention-attachment`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      ).then(r => r.data)
    },
  },

  // Batch 8 del cuerpo principal (SCRUM-529→533, REQ-452→456) — Estado de Cuenta. Batch 9
  // (SCRUM-534→538, REQ-457→461) agrega desde/hasta al mismo endpoint (respuesta superset).
  accountStatement: {
    searchClients: (search: string): Promise<AccountStatementClientOption[]> =>
      api.get<{ data: AccountStatementClientOption[] }>('/admin-contab/account-statement/clients', { params: { search } })
        .then(r => r.data.data),

    projects: (masterClientId: number): Promise<AccountStatementProjectOption[]> =>
      api.get<{ data: AccountStatementProjectOption[] }>('/admin-contab/account-statement/projects', {
        params: { master_client_id: masterClientId },
      }).then(r => r.data.data),

    generate: (filters: AccountStatementFilters): Promise<AccountStatement> =>
      api.get<AccountStatement>('/admin-contab/account-statement', {
        params: {
          master_client_id: filters.masterClientId,
          sales_project_id: filters.salesProjectId ?? undefined,
          desde: filters.desde || undefined,
          hasta: filters.hasta || undefined,
        },
      }).then(r => r.data),

    // Mismo patrón blob que los demás export/download de Admin&Cont.
    downloadExcel: async (filters: AccountStatementFilters): Promise<void> => {
      const res = await api.get('/admin-contab/account-statement/export', {
        params: {
          master_client_id: filters.masterClientId,
          sales_project_id: filters.salesProjectId ?? undefined,
          desde: filters.desde || undefined,
          hasta: filters.hasta || undefined,
        },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `estado-cuenta-${filters.masterClientId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    },
  },

  // Batch 10 — apertura de Notas Crédito y Devoluciones (SCRUM-553→558). Sin endpoint de
  // creación todavía — ese es Batch 11 (REQ-482→487).
  notasCredito: {
    resumenMes: (): Promise<NotaCreditoResumenMes> =>
      api.get<NotaCreditoResumenMes>('/admin-contab/notas-credito/summary').then(r => r.data),

    // Endpoint distinto de `itbmsRates.list()` (ese es exclusivo de Mark) — ver docblock de
    // `NotaCreditoItbmsRateOption` en types/adminContab.ts.
    itbmsRates: (): Promise<NotaCreditoItbmsRateOption[]> =>
      api.get<NotaCreditoItbmsRateOption[]>('/admin-contab/notas-credito/itbms-rates').then(r => r.data),

    // Batch 11 (REQ-483) — TODAS las facturas del cliente, incluidas las de saldo $0.
    facturas: (masterClientId: number): Promise<NotaCreditoFacturaOrigen[]> =>
      api.get<{ data: NotaCreditoFacturaOrigen[] }>(`/admin-contab/notas-credito/clientes/${masterClientId}/facturas`)
        .then(r => r.data.data),

    // REQ-482→487 — siempre multipart (mismo criterio que `payments.register`: aunque no traiga
    // comprobante, un JSON simple alcanzaría, pero mantener un solo camino evita 2 rutas de
    // serialización distintas para el mismo endpoint).
    register: (payload: CreateNotaCreditoPayload): Promise<NotaCredito> => {
      const form = new FormData()
      for (const [key, value] of Object.entries(payload)) {
        if (value === null || value === undefined) continue
        if (key === 'comprobante') { form.append('comprobante', value as File); continue }
        // Laravel's `boolean` rule solo acepta 1/0/"1"/"0" — "true"/"false" (String(bool) en JS)
        // lo rechaza (mismo gotcha ya resuelto en `payments.register`).
        if (typeof value === 'boolean') { form.append(key, value ? '1' : '0'); continue }
        form.append(key, String(value))
      }
      return api.post<NotaCredito>('/admin-contab/notas-credito', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // Batch 12 del cuerpo principal (SCRUM-565→570, REQ-488→493) — submit real de "Corrección de
    // datos", cola de Bodega, historial+filtros y detalle. Ver ADR-SCRUM565-570.

    // REQ-489 — solo lectura, nada se persiste (RN1). JSON simple, sin comprobante todavía.
    previewCorreccion: (payload: PreviewCorreccionPayload): Promise<PreviewCorreccionResponse> =>
      api.post<PreviewCorreccionResponse>('/admin-contab/notas-credito/correccion/preview', payload).then(r => r.data),

    // REQ-490 — mismo criterio multipart que `register()` (comprobante opcional según umbral).
    registerCorreccion: (payload: RegisterCorreccionPayload): Promise<NotaCredito> => {
      const form = new FormData()
      for (const [key, value] of Object.entries(payload)) {
        if (value === null || value === undefined) continue
        if (key === 'comprobante') { form.append('comprobante', value as File); continue }
        form.append(key, String(value))
      }
      return api.post<NotaCredito>('/admin-contab/notas-credito/correccion', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // REQ-492 — historial combinado (notas reales + cola de Bodega) con filtros. Sin paginación —
    // mismo criterio que el resto de listados de AdminCont.
    historial: (filters: NotaCreditoHistorialFilters): Promise<NotaCreditoHistorialResult> =>
      api.get<NotaCreditoHistorialResult>('/admin-contab/notas-credito', {
        params: {
          search: filters.search || undefined,
          cliente: filters.cliente || undefined,
          tipo: filters.tipo || undefined,
          estado: filters.estado || undefined,
        },
      }).then(r => r.data),

    // REQ-493 — nunca se llama con una fila virtual de la cola (`id: null`).
    detail: (id: number): Promise<NotaCreditoDetalle> =>
      api.get<NotaCreditoDetalle>(`/admin-contab/notas-credito/${id}`).then(r => r.data),

    // REQ-491 — precarga de una fila de la cola de Bodega, endpoint propio (no viaja embebido en
    // el historial, ver docblock de `NotaCreditoDevolucionDetail`).
    devolucionDetail: (customerReturnId: number): Promise<NotaCreditoDevolucionDetail> =>
      api.get<NotaCreditoDevolucionDetail>(`/admin-contab/notas-credito/devoluciones/${customerReturnId}`).then(r => r.data),

    // Batch 13 (SCRUM-571→574, REQ-494→497) — aprobación de Mark, comprobante, documento formal,
    // factura relacionada. Ver ADR-SCRUM571-574.

    // REQ-494 — mismo patrón que `invoices.decideUncollectible()`, bajo `primary_approver_only` del lado del
    // backend (no un chequeo de rol distinto acá, el 403 real lo decide el servidor).
    decide: (id: number, payload: NotaCreditoDecisionPayload): Promise<NotaCreditoDetalle> =>
      api.put<NotaCreditoDetalle>(`/admin-contab/notas-credito/${id}/decision`, payload).then(r => r.data),

    // REQ-495 — mismo patrón que `payments.attachment()`, pero la respuesta siempre trae
    // `tiene_comprobante` explícito (RN2) en vez de `null`.
    comprobante: (id: number): Promise<NotaCreditoComprobanteDetail> =>
      api.get<NotaCreditoComprobanteDetail>(`/admin-contab/notas-credito/${id}/comprobante`).then(r => r.data),

    // REQ-496 — mismo patrón blob que `payments.downloadReceiptPdf()`/`invoices.downloadPdf()` —
    // el endpoint exige el JWT en header, no se puede abrir con un <a href> plano.
    downloadPdf: async (id: number, numero: string): Promise<void> => {
      const res = await api.get(`/admin-contab/notas-credito/${id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `nota-credito-${numero}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },
  },

  // Batch 14 del cuerpo principal (SCRUM-575→579, REQ-498→502) — Comisiones Internas. Ver
  // ADR-SCRUM575-579-batch14-comisiones-internas.md. Deliberadamente sin relación con
  // `ventasDisenoApi.commissions` (REQ-073) — coexisten, decisión de Luis.
  commissionsInternal: {
    tiers: {
      list: (): Promise<CommissionTier[]> =>
        api.get<CommissionTier[]>('/admin-contab/commissions/internal/tiers').then(r => r.data),

      create: (data: CreateCommissionTierPayload): Promise<CommissionTier> =>
        api.post<CommissionTier>('/admin-contab/commissions/internal/tiers', data).then(r => r.data),

      update: (id: number, data: Partial<CreateCommissionTierPayload>): Promise<CommissionTier> =>
        api.put<CommissionTier>(`/admin-contab/commissions/internal/tiers/${id}`, data).then(r => r.data),

      remove: (id: number): Promise<void> =>
        api.delete(`/admin-contab/commissions/internal/tiers/${id}`).then(() => undefined),
    },

    summary: (filters: CommissionInternalFilters): Promise<CommissionInternalSummary> =>
      api.get<CommissionInternalSummary>('/admin-contab/commissions/internal', { params: filters }).then(r => r.data),

    vendorOptions: (): Promise<CommissionVendorOption[]> =>
      api.get<CommissionVendorOption[]>('/admin-contab/commissions/internal/vendors').then(r => r.data),

    // Mismo patrón blob que invoices.export()/notasCredito.downloadPdf() — respeta el filtro de
    // mes+vendedor activo al momento de exportar (RN2 REQ-498).
    export: async (format: CommissionExportFormat, filters: CommissionInternalFilters): Promise<void> => {
      const res = await api.get('/admin-contab/commissions/internal/export', {
        params: { ...filters, format },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `comisiones-internas-${filters.mes}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
      a.click()
      URL.revokeObjectURL(url)
    },

    // Batch 15 (SCRUM-580→584, REQ-507). Contrato asumido contra el ADR (Backend Dev implementa
    // en paralelo) — 2 rutas: la del documento (JSON, para el modal) y la del PDF (blob, botón
    // "Ver/Imprimir PDF"), mismo criterio que tiers/summary vs export de arriba.
    accountStatement: (vendedorId: number, mes: string): Promise<CommissionAccountStatement> =>
      api.get<CommissionAccountStatement>(`/admin-contab/commissions/internal/${vendedorId}/account-statement`, { params: { mes } }).then(r => r.data),

    downloadAccountStatementPdf: async (vendedorId: number, vendedorNombre: string, mes: string): Promise<void> => {
      const res = await api.get(`/admin-contab/commissions/internal/${vendedorId}/account-statement/pdf`, {
        params: { mes },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `estado-cuenta-${vendedorNombre.replace(/\s+/g, '-').toLowerCase()}-${mes}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },
  },

  // Batch 16 (SCRUM-585→590, REQ-508→513) — Comisiones Externas (arquitectos). Ver
  // ADR-SCRUM585-590-batch16-comisiones-externas.md. Deliberadamente independiente de
  // `commissionsInternal` (misma decisión ya documentada ahí para no forzar reuso entre motores
  // de comisión de distinta audiencia).
  commissionsExternal: {
    summary: (filters: CommissionExternalFilters): Promise<CommissionExternalSummary> =>
      api.get<CommissionExternalSummary>('/admin-contab/commissions/external', { params: filters }).then(r => r.data),

    architectOptions: (): Promise<ArchitectOption[]> =>
      api.get<ArchitectOption[]>('/admin-contab/commissions/external/architects').then(r => r.data),

    // REQ-510 — los 3 campos van juntos, el backend rechaza (422) si falta alguno.
    updateFiscalProfile: (architectId: number, data: ArchitectFiscalProfilePayload): Promise<unknown> =>
      api.put(`/admin-contab/commissions/external/architects/${architectId}/fiscal-profile`, data).then(r => r.data),

    // REQ-513 — RN3: "Subir"/"Reemplazar" es el mismo endpoint, el backend decide server-side.
    uploadCuentaCobro: (pipelineCardId: number, file: File): Promise<{ nombre_archivo: string; uploaded_at: string }> => {
      const form = new FormData()
      form.append('file', file)
      return api.post<{ nombre_archivo: string; uploaded_at: string }>(
        `/admin-contab/commissions/external/projects/${pipelineCardId}/cuenta-cobro`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      ).then(r => r.data)
    },

    // Mismo patrón que OrderStatusDetailModal/GuiaEntregaModal — pide la URL firmada y el llamador
    // hace window.open().
    viewCuentaCobro: (pipelineCardId: number): Promise<{ url: string }> =>
      api.get<{ url: string }>(`/admin-contab/commissions/external/projects/${pipelineCardId}/cuenta-cobro`).then(r => r.data),

    // Batch 17 (SCRUM-591→596, REQ-514→519).

    // REQ-514 — mismo patrón que uploadCuentaCobro, RN1 restringido a régimen retención_50
    // (validado server-side, el frontend solo oculta el botón cuando el régimen no aplica).
    uploadComprobanteRetencion: (pipelineCardId: number, file: File): Promise<{ nombre_archivo: string; uploaded_at: string }> => {
      const form = new FormData()
      form.append('file', file)
      return api.post<{ nombre_archivo: string; uploaded_at: string }>(
        `/admin-contab/commissions/external/projects/${pipelineCardId}/comprobante-retencion`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      ).then(r => r.data)
    },

    viewComprobanteRetencion: (pipelineCardId: number): Promise<{ url: string }> =>
      api.get<{ url: string }>(`/admin-contab/commissions/external/projects/${pipelineCardId}/comprobante-retencion`).then(r => r.data),

    bankAccountOptions: (): Promise<BankAccountOption[]> =>
      api.get<BankAccountOption[]>('/admin-contab/commissions/external/bank-accounts').then(r => r.data),

    // REQ-517 — bloqueado server-side (422) una vez la comisión está pagada.
    updateCuentaPago: (pipelineCardId: number, data: UpdateCuentaPagoPayload): Promise<{ bank_account_id: number | null }> =>
      api.put<{ bank_account_id: number | null }>(`/admin-contab/commissions/external/projects/${pipelineCardId}/cuenta-pago`, data).then(r => r.data),

    // REQ-516 RN3 — Felix/Yaneth/Mark/Gerencia proponen, queda pendiente de Mark.
    proposePercent: (pipelineCardId: number, data: ProposePercentPayload): Promise<{ porcentaje_pendiente: number }> =>
      api.post<{ porcentaje_pendiente: number }>(`/admin-contab/commissions/external/projects/${pipelineCardId}/percent/propose`, data).then(r => r.data),

    // REQ-516 RN4 — exclusivo de Mark, 403 para cualquier otro rol (mismo gate `primary_approver_only`).
    decidePercent: (pipelineCardId: number, data: DecidePercentPayload): Promise<{ porcentaje_aprobado: number | null }> =>
      api.post<{ porcentaje_aprobado: number | null }>(`/admin-contab/commissions/external/projects/${pipelineCardId}/percent/decide`, data).then(r => r.data),

    // REQ-515 — cadena de validación completa en el backend (autoridad final); el frontend hace el
    // mismo chequeo antes de ofrecer el botón, solo para evitar un viaje al servidor que va a fallar.
    markPaid: (pipelineCardId: number): Promise<{ fecha_pago: string }> =>
      api.post<{ fecha_pago: string }>(`/admin-contab/commissions/external/projects/${pipelineCardId}/mark-paid`).then(r => r.data),

    // REQ-518 — despacha un correo async al arquitecto, solo disponible en "Pendiente de factura".
    sendReminder: (pipelineCardId: number): Promise<void> =>
      api.post(`/admin-contab/commissions/external/projects/${pipelineCardId}/remind`).then(() => undefined),
  },

  // Batch 18 (SCRUM-597→601, REQ-520→524) — Arqueo / Flujo de Caja, parte 1. Ver
  // ADR-SCRUM597-601-batch18-arqueo-caja.md para el contrato completo. `projected`/`real` 403 para
  // asistente_administrativa (Yaneth) — REQ-521/523 no la incluyen; `daily-count` 403 para
  // management/superadmin-no-Mark si el backend decide gatear distinto — el frontend nunca asume,
  // solo maneja el 403 con el estado vacío/oculto correspondiente (ver ArqueoCajaPage).
  cashPosition: {
    header: (): Promise<CashPositionHeader> =>
      api.get<CashPositionHeader>('/admin-contab/cash-position').then(r => r.data),

    projected: (windowDays: CashPositionWindowDays): Promise<CashPositionProjected> =>
      api.get<CashPositionProjected>('/admin-contab/cash-position/projected', { params: { window: windowDays } })
        .then(r => r.data),

    real: (windowDays: 30 | 90): Promise<CashPositionReal> =>
      api.get<CashPositionReal>('/admin-contab/cash-position/real', { params: { window: windowDays } })
        .then(r => r.data),

    dailyCount: (): Promise<DailyCashCount> =>
      api.get<DailyCashCount>('/admin-contab/cash-position/daily-count').then(r => r.data),

    updateEntryObservation: (payload: UpdateDailyCashCountEntryPayload): Promise<void> =>
      api.put('/admin-contab/cash-position/daily-count/entries', payload).then(() => undefined),

    updateGeneralObservation: (observacion: string | null): Promise<void> =>
      api.put('/admin-contab/cash-position/daily-count/general-observation', { observacion }).then(() => undefined),

    // RN3 REQ-520 — el backend rechaza view=real&window=0 con 422; el frontend nunca ofrece esa
    // combinación (el menú de exportar ya está oculto en Real+Hoy, ver ArqueoCajaPage).
    export: async (view: CashFlowExportView, windowDays: CashPositionWindowDays, format: 'pdf' | 'excel'): Promise<void> => {
      const res = await api.get('/admin-contab/cash-position/export', {
        params: { view, window: windowDays, format },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `flujo-caja-${view}-${new Date().toISOString().slice(0, 10)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
      a.click()
      URL.revokeObjectURL(url)
    },

    // Batch 19 (SCRUM-602→606, REQ-525→529) — ver ADR-SCRUM602-606-batch19-arqueo-caja-parte2.md.

    // REQ-526 — cierra el arqueo activo. 409 (mensaje del backend) si ya no está `abierto` (doble
    // click / carrera); ArqueoCajaPage lo muestra tal cual, sin reintentar.
    closeDailyCount: (): Promise<DailyCashCount> =>
      api.post<DailyCashCount>('/admin-contab/cash-position/daily-count/close').then(r => r.data),

    // REQ-528 — historial de arqueos cerrados, paginado.
    history: (page: number): Promise<DailyCashCountHistoryResult> =>
      api.get<DailyCashCountHistoryResult>('/admin-contab/cash-position/history', { params: { page } }).then(r => r.data),

    // REQ-528/529 — detalle de solo lectura de un arqueo del historial (mismo shape que el activo).
    historyDetail: (id: number): Promise<DailyCashCount> =>
      api.get<DailyCashCount>(`/admin-contab/cash-position/history/${id}`).then(r => r.data),

    // REQ-528 RN2/RN4 — exclusivo Mark (`primary_approver_only` en el backend). 409 si el arqueo ya no está
    // `pendiente_aprobacion` (aprobado por otra sesión mientras el modal estaba abierto).
    approve: (id: number): Promise<DailyCashCount> =>
      api.post<DailyCashCount>(`/admin-contab/cash-position/history/${id}/approve`).then(r => r.data),

    // REQ-529 Escenario 1 — resumen del arqueo activo, mismo gate que `daily-count` (Felix+Yaneth,
    // ver ADR §9).
    exportDailyCount: async (numero: number | null): Promise<void> => {
      const res = await api.get('/admin-contab/cash-position/daily-count/export', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `arqueo-${numero ?? new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },

    // REQ-529 Escenario 2 — resumen de un arqueo del historial, gate amplio (Felix/Yaneth/Mark/
    // Gerencia, ver ADR §9).
    exportHistory: async (id: number, numero: number | null): Promise<void> => {
      const res = await api.get(`/admin-contab/cash-position/history/${id}/export`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `arqueo-${numero ?? id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },
  },

  // Batch 20 (SCRUM-612→617, REQ-535→540) — Caja Chica.
  pettyCash: {
    summary: (): Promise<PettyCashSummary> =>
      api.get<PettyCashSummary>('/admin-contab/petty-cash/summary').then(r => r.data),

    pending: (): Promise<PettyCashPendingResult> =>
      api.get<PettyCashPendingResult>('/admin-contab/petty-cash/pending').then(r => r.data),

    // REQ-535 — siempre multipart, cada línea trae una foto de recibo obligatoria.
    createExpenses: (lineas: PettyCashNewExpenseLine[]): Promise<void> => {
      const form = new FormData()
      lineas.forEach((l, i) => {
        form.append(`lineas[${i}][fecha]`, l.fecha)
        form.append(`lineas[${i}][solicitante_id]`, String(l.solicitante_id ?? ''))
        form.append(`lineas[${i}][proveedor]`, l.proveedor)
        form.append(`lineas[${i}][descripcion]`, l.descripcion)
        form.append(`lineas[${i}][monto_bruto]`, l.monto_bruto)
        form.append(`lineas[${i}][itbms]`, l.itbms)
        if (l.foto) form.append(`lineas[${i}][foto]`, l.foto)
      })
      return api.post('/admin-contab/petty-cash/expenses', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(() => undefined)
    },

    generateReport: (payload: CreatePettyCashReportPayload): Promise<PettyCashReportListItem> =>
      api.post<PettyCashReportListItem>('/admin-contab/petty-cash/reports', payload).then(r => r.data),

    reports: (): Promise<PettyCashReportListItem[]> =>
      api.get<PettyCashReportListItem[]>('/admin-contab/petty-cash/reports').then(r => r.data),

    reportDetail: (numero: string): Promise<PettyCashReportDetail> =>
      api.get<PettyCashReportDetail>(`/admin-contab/petty-cash/reports/${numero}`).then(r => r.data),

    attachmentUrl: (expenseId: number, attachmentId: number): Promise<string> =>
      api.get<{ url: string }>(`/admin-contab/petty-cash/expenses/${expenseId}/attachments/${attachmentId}/url`)
        .then(r => r.data.url),

    approveReport: (numero: string): Promise<PettyCashApproveResponse> =>
      api.put<PettyCashApproveResponse>(`/admin-contab/petty-cash/reports/${numero}/approve`).then(r => r.data),

    // Mismo patrón blob que payments.downloadReceiptPdf() — el endpoint exige el JWT en header.
    downloadReportPdf: async (numero: string): Promise<void> => {
      const res = await api.get(`/admin-contab/petty-cash/reports/${numero}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `caja-chica-${numero}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    },

    // Batch 21 (SCRUM-618→623, REQ-541→546) — rechazo/reapertura de líneas.

    // REQ-543 — solo líneas con intentos_rechazo >= 2, sin importar el reporte de origen.
    // El backend envuelve la lista en { lineas: [...] } (AdminContPettyCashService::rejected()),
    // no un array bare — sin este unwrap, RechazadosPanel llama .map() sobre un objeto y crashea
    // toda la SPA (hallazgo CRÍTICO de Pre-QA, Batch 21, 2026-08-27).
    rejected: (): Promise<PettyCashRejectedLine[]> =>
      api.get<{ lineas: PettyCashRejectedLine[] }>('/admin-contab/petty-cash/rejected').then(r => r.data.lineas),

    // REQ-545 — modal unificado, funciona igual en Pendientes/Reporte/Rechazados.
    expenseDetail: (id: number): Promise<PettyCashExpenseDetail> =>
      api.get<PettyCashExpenseDetail>(`/admin-contab/petty-cash/expenses/${id}`).then(r => r.data),

    // REQ-545 RN1/RN4 — solo Pendientes/Rechazados, nunca solicitante_id.
    updateExpense: (id: number, payload: UpdatePettyCashExpensePayload): Promise<PettyCashExpenseDetail> =>
      api.put<PettyCashExpenseDetail>(`/admin-contab/petty-cash/expenses/${id}`, payload).then(r => r.data),

    // REQ-545 RN2 — Pendientes/Rechazados o dentro de un reporte todavía pendiente de aprobación.
    addAttachment: (id: number, foto: File): Promise<PettyCashExpenseDetail> => {
      const form = new FormData()
      form.append('foto', foto)
      return api.post<PettyCashExpenseDetail>(`/admin-contab/petty-cash/expenses/${id}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // REQ-541 — exclusivo Mark (gate real en el backend, `primary_approver_only`). Respuesta angosta a
    // propósito, ver docblock de RejectPettyCashExpenseResponse.
    rejectExpense: (id: number, motivo: string): Promise<RejectPettyCashExpenseResponse> =>
      api.put<RejectPettyCashExpenseResponse>(`/admin-contab/petty-cash/expenses/${id}/reject`, { motivo }).then(r => r.data),

    // REQ-541 — exclusivo Mark, rechaza TODAS las líneas del reporte con un solo motivo.
    rejectReport: (numero: string, motivo: string): Promise<RejectPettyCashReportResponse> =>
      api.put<RejectPettyCashReportResponse>(`/admin-contab/petty-cash/reports/${numero}/reject`, { motivo }).then(r => r.data),

    // REQ-544 — Felix/Yaneth, NUNCA Mark (al revés que rechazar — el backend nunca deja pasar a
    // Mark acá, no es el mismo gate que approve/reject).
    reopenExpense: (id: number, motivo: string): Promise<PettyCashExpenseDetail> =>
      api.put<PettyCashExpenseDetail>(`/admin-contab/petty-cash/expenses/${id}/reopen`, { motivo }).then(r => r.data),
  },

  // Batch 22 (SCRUM-643→647, REQ-566→570) — home de Reportes. Comisión Felix y Cartera (RN4/RN3)
  // nunca reciben `periodo` — siempre mes/estado en curso, mismo criterio que `cash-position`
  // (header vs. projected).
  reports: {
    felixCommission: (): Promise<ReportsFelixCommission> =>
      api.get<ReportsFelixCommission>('/admin-contab/reports/felix-commission').then(r => r.data),

    cartera: (): Promise<ReportsCartera> =>
      api.get<ReportsCartera>('/admin-contab/reports/cartera').then(r => r.data),

    ventas: (periodo: ReportsPeriodo): Promise<ReportsVentas> =>
      api.get<ReportsVentas>('/admin-contab/reports/ventas', { params: { periodo } }).then(r => r.data),

    flujoCaja: (periodo: ReportsPeriodo): Promise<ReportsFlujoCaja> =>
      api.get<ReportsFlujoCaja>('/admin-contab/reports/flujo-caja', { params: { periodo } }).then(r => r.data),

    // Batch 23 (SCRUM-648/649, REQ-571/572).
    comisiones: (periodo: ReportsPeriodo): Promise<ReportsComisiones> =>
      api.get<ReportsComisiones>('/admin-contab/reports/comisiones', { params: { periodo } }).then(r => r.data),

    notasCredito: (): Promise<ReportsNotasCredito> =>
      api.get<ReportsNotasCredito>('/admin-contab/reports/notas-credito').then(r => r.data),

    // Batch 23 Grupo 2 (SCRUM-651→660, REQ-574→583).
    mensualCliente: (params: ClientCollectionReportParams): Promise<ClientCollectionReport> =>
      api.get<ClientCollectionReport>('/admin-contab/reports/mensual-cliente', { params: clientCollectionQuery(params) }).then(r => r.data),

    mensualClienteExcel: (params: ClientCollectionReportParams): Promise<void> =>
      downloadClientCollectionExcel('/admin-contab/reports/mensual-cliente/excel', params, 'Reporte_mensual_cliente'),

    mensualClienteAcumulado: (params: ClientCollectionReportParams): Promise<ClientCollectionReport> =>
      api.get<ClientCollectionReport>('/admin-contab/reports/mensual-cliente-acumulado', { params: clientCollectionQuery(params) }).then(r => r.data),

    mensualClienteAcumuladoExcel: (params: ClientCollectionReportParams): Promise<void> =>
      downloadClientCollectionExcel('/admin-contab/reports/mensual-cliente-acumulado/excel', params, 'Reporte_mensual_cliente_acumulado'),

    // Batch 23 Grupo 3 (SCRUM-661→664, REQ-584→587) — "Libro de facturas".
    libroFacturas: (params: InvoiceBookReportParams): Promise<InvoiceBookReport> =>
      api.get<InvoiceBookReport>('/admin-contab/reports/libro-facturas', { params: invoiceBookQuery(params) }).then(r => r.data),

    libroFacturasExcel: async (params: InvoiceBookReportParams): Promise<void> => {
      const res = await api.get('/admin-contab/reports/libro-facturas/excel', { params: invoiceBookQuery(params), responseType: 'blob' })
      downloadBlob(res.data as Blob, `Libro_de_facturas_${new Date().toISOString().slice(0, 10)}.xlsx`)
    },

    // Batch 23 Grupo 3 (SCRUM-665→669, REQ-588→592) — "Ventas por medio de pago". A diferencia de
    // Mensual por Cliente, `master_client_id` es opcional de verdad (RN1 REQ-588) — sin cliente
    // seleccionado, se piden igual todos los clientes, nunca un estado vacío.
    ventasMedioPago: (params: PaymentMethodSalesReportParams): Promise<PaymentMethodSalesReport> =>
      api.get<PaymentMethodSalesReport>('/admin-contab/reports/ventas-medio-pago', { params: paymentMethodSalesQuery(params) }).then(r => r.data),

    ventasMedioPagoExcel: async (params: PaymentMethodSalesReportParams): Promise<void> => {
      const res = await api.get('/admin-contab/reports/ventas-medio-pago/excel', { params: paymentMethodSalesQuery(params), responseType: 'blob' })
      downloadBlob(res.data as Blob, `Ventas_por_medio_pago_${new Date().toISOString().slice(0, 10)}.xlsx`)
    },
  },

  // CRUD de tramos de comisión de cartera — sin pantalla de administración en este batch (decisión
  // confirmada con Luis), expuesto acá por completitud del contrato para uso futuro.
  carteraCommissionTiers: {
    list: (): Promise<CarteraCommissionTier[]> =>
      api.get<CarteraCommissionTier[]>('/admin-contab/commissions/cartera/tiers').then(r => r.data),

    create: (payload: CreateCarteraCommissionTierPayload): Promise<CarteraCommissionTier> =>
      api.post<CarteraCommissionTier>('/admin-contab/commissions/cartera/tiers', payload).then(r => r.data),

    update: (id: number, payload: Partial<CreateCarteraCommissionTierPayload>): Promise<CarteraCommissionTier> =>
      api.put<CarteraCommissionTier>(`/admin-contab/commissions/cartera/tiers/${id}`, payload).then(r => r.data),

    destroy: (id: number): Promise<void> =>
      api.delete(`/admin-contab/commissions/cartera/tiers/${id}`).then(() => undefined),
  },

  // Batch Home (SCRUM-503→512, REQ-426→435) — "Inicio", épica completa.
  home: {
    resumenMes: (): Promise<HomeResumenMes> =>
      api.get<HomeResumenMes>('/admin-contab/home/resumen-mes').then(r => r.data),

    // Grupo 2 (SCRUM-509, REQ-432) — "Mi calendario". Mismo endpoint compartido con Ventas &
    // Diseño/Compras/Servicios (OutlookCalendarController, module=admin_contab) — sin `scope`/
    // `owner_id`, ver docblock de AdminContMyCalendarPanel.tsx (RN1: nadie ve el calendario de
    // otro usuario desde Inicio, mismo criterio que Servicios/SCRUM-272).
    calendar: {
      list: (filters: { from?: string; to?: string } = {}): Promise<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }> =>
        api.get<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }>('/admin-contab/calendar', { params: filters }).then(r => r.data),
    },

    // Grupo 3 (SCRUM-510, REQ-433) — panel "Pendientes".
    pendientes: (): Promise<HomePendientes> =>
      api.get<HomePendientes>('/admin-contab/home/pendientes').then(r => r.data),

    // Grupo 4 (SCRUM-511, REQ-434) — panel "Vencidos y por vencer". REQ-435 ("Antigüedad de
    // cuentas por cobrar") no tiene endpoint propio acá — reusa `invoices.aging()` de abajo
    // directo (RN1 del ticket: debe ser siempre la misma fuente que Facturación).
    vencidosPorVencer: (): Promise<HomeVencidosPorVencer> =>
      api.get<HomeVencidosPorVencer>('/admin-contab/home/vencidos-por-vencer').then(r => r.data),
  },
}

// Batch 23 Grupo 2 (SCRUM-651→660, REQ-574→583) — "Mensual por cliente" (día) y "Acumulado"
// (año-mes). `master_client_id=todos` combina todos los clientes (RN2 REQ-574/579).
function clientCollectionQuery(params: ClientCollectionReportParams) {
  return {
    master_client_id: params.masterClientId,
    desde: params.desde || undefined,
    hasta: params.hasta || undefined,
  }
}

async function downloadClientCollectionExcel(url: string, params: ClientCollectionReportParams, prefix: string): Promise<void> {
  const res = await api.get(url, { params: clientCollectionQuery(params), responseType: 'blob' })
  downloadBlob(res.data as Blob, `${prefix}_${params.masterClientId}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function downloadBlob(blob: Blob, filename: string): void {
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(objUrl)
}

// Batch 23 Grupo 3 (SCRUM-661→664, REQ-584→587) — "Libro de facturas".
function invoiceBookQuery(params: InvoiceBookReportParams) {
  return { desde: params.desde || undefined, hasta: params.hasta || undefined, tipo: params.tipo || undefined }
}

// Batch 23 Grupo 3 (SCRUM-665→669, REQ-588→592) — "Ventas por medio de pago".
function paymentMethodSalesQuery(params: PaymentMethodSalesReportParams) {
  return { master_client_id: params.masterClientId || undefined, desde: params.desde || undefined, hasta: params.hasta || undefined }
}
