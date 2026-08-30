import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminContabApi } from '@/api/adminContabApi'
import { rangeForPill } from '@/lib/dateGrid'
import type {
  FiscalSettingsPayload, CreateItbmsRatePayload,
  CompanyProfilePayload, CreateLocationPayload, CreateContactPayload,
  CreateBankAccountPayload, InvoiceListFilters, CreateInvoicePayload, InvoiceExportFormat,
  PaymentMethod, CreatePaymentPayload, PaymentHistorialFilters, AccountStatementFilters,
  CreateNotaCreditoPayload, PreviewCorreccionPayload, RegisterCorreccionPayload,
  NotaCreditoHistorialFilters, NotaCreditoDecisionPayload,
  CreateCommissionTierPayload, CommissionInternalFilters, CommissionExportFormat,
  CommissionExternalFilters, ArchitectFiscalProfilePayload,
  ProposePercentPayload, DecidePercentPayload, UpdateCuentaPagoPayload,
  CashPositionWindowDays, UpdateDailyCashCountEntryPayload, CashFlowExportView,
  PettyCashNewExpenseLine, CreatePettyCashReportPayload, UpdatePettyCashExpensePayload,
  ReportsPeriodo, ClientCollectionReportParams,
  InvoiceBookReportParams, PaymentMethodSalesReportParams,
} from '@/types/adminContab'

const FISCAL_SETTINGS_KEY  = ['admin-contab', 'fiscal-settings']
const ITBMS_RATES_KEY      = ['admin-contab', 'itbms-rates']
const COMPANY_PROFILE_KEY  = ['admin-contab', 'company-profile']
const LOCATIONS_KEY        = ['admin-contab', 'locations']
const CONTACTS_KEY         = ['admin-contab', 'contacts']
const BANK_ACCOUNTS_KEY    = ['admin-contab', 'bank-accounts']
const bankMovementsKey     = (bankAccountId?: number) => ['admin-contab', 'bank-movements', bankAccountId ?? 'all']

export function useFiscalSettings() {
  return useQuery({
    queryKey: FISCAL_SETTINGS_KEY,
    queryFn:  () => adminContabApi.fiscalSettings.get(),
    // 403 (pantalla exclusiva de Mark) no es un error transitorio — reintentar no lo resuelve.
    retry: false,
  })
}

export function useUpdateFiscalSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<FiscalSettingsPayload>) => adminContabApi.fiscalSettings.update(data),
    onSuccess: (data) => qc.setQueryData(FISCAL_SETTINGS_KEY, data),
  })
}

export function useItbmsRates(enabled = true) {
  return useQuery({
    queryKey: ITBMS_RATES_KEY,
    queryFn:  () => adminContabApi.itbmsRates.list(),
    enabled,
    retry: false,
  })
}

export function useCreateItbmsRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateItbmsRatePayload) => adminContabApi.itbmsRates.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITBMS_RATES_KEY }),
  })
}

export function useSetItbmsRateActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activa }: { id: number; activa: boolean }) => adminContabApi.itbmsRates.setActive(id, activa),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITBMS_RATES_KEY }),
  })
}

export function useDeleteItbmsRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => adminContabApi.itbmsRates.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITBMS_RATES_KEY }),
  })
}

// Batch Datos de la Empresa (SCRUM-638→642)

export function useCompanyProfile() {
  return useQuery({
    queryKey: COMPANY_PROFILE_KEY,
    queryFn:  () => adminContabApi.companyProfile.get(),
    retry: false,
  })
}

export function useUpdateCompanyProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<CompanyProfilePayload>) => adminContabApi.companyProfile.update(data),
    onSuccess: (data) => qc.setQueryData(COMPANY_PROFILE_KEY, data),
  })
}

export function useUploadCompanyLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => adminContabApi.companyProfile.uploadLogo(file),
    onSuccess: ({ logo_url }) =>
      qc.setQueryData(COMPANY_PROFILE_KEY, (prev: unknown) =>
        prev && typeof prev === 'object' ? { ...prev, logo_url } : prev),
  })
}

export function useLocations(enabled = true) {
  return useQuery({
    queryKey: LOCATIONS_KEY,
    queryFn:  () => adminContabApi.locations.list(),
    enabled,
    retry: false,
  })
}

export function useCreateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateLocationPayload) => adminContabApi.locations.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOCATIONS_KEY }),
  })
}

export function useSetLocationActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activa }: { id: number; activa: boolean }) => adminContabApi.locations.setActive(id, activa),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOCATIONS_KEY }),
  })
}

export function useContacts(enabled = true) {
  return useQuery({
    queryKey: CONTACTS_KEY,
    queryFn:  () => adminContabApi.contacts.list(),
    enabled,
    retry: false,
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateContactPayload) => adminContabApi.contacts.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACTS_KEY }),
  })
}

export function useSetContactActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => adminContabApi.contacts.setActive(id, activo),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACTS_KEY }),
  })
}

// Batch 1 del cuerpo principal (SCRUM-607→611) — Cuentas Bancarias.

export function useBankAccounts() {
  return useQuery({
    queryKey: BANK_ACCOUNTS_KEY,
    queryFn:  () => adminContabApi.bankAccounts.list(),
  })
}

export function useCreateBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBankAccountPayload) => adminContabApi.bankAccounts.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: BANK_ACCOUNTS_KEY }),
  })
}

export function useDeactivateBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => adminContabApi.bankAccounts.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: BANK_ACCOUNTS_KEY }),
  })
}

export function useReactivateBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => adminContabApi.bankAccounts.reactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: BANK_ACCOUNTS_KEY }),
  })
}

export function useBankMovements(bankAccountId?: number) {
  return useQuery({
    queryKey: bankMovementsKey(bankAccountId),
    queryFn:  () => adminContabApi.bankMovements.list(bankAccountId),
  })
}

export function useAssignBankMovementAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, bankAccountId }: { id: number; bankAccountId: number }) =>
      adminContabApi.bankMovements.assignAccount(id, bankAccountId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-contab', 'bank-movements'] })
      qc.invalidateQueries({ queryKey: BANK_ACCOUNTS_KEY })
    },
  })
}

// Batch 2 del cuerpo principal (SCRUM-513→518) — Facturación.

const INVOICE_SUMMARY_KEY = ['admin-contab', 'invoices', 'summary']
const invoiceListKey = (filters: InvoiceListFilters) => ['admin-contab', 'invoices', 'list', filters]

export function useInvoiceSummary() {
  return useQuery({
    // RN4 REQ-437 — no depende de la pestaña/filtros activos, siempre el total real.
    queryKey: INVOICE_SUMMARY_KEY,
    queryFn:  () => adminContabApi.invoices.summary(),
  })
}

export function useInvoiceList(filters: InvoiceListFilters) {
  return useQuery({
    queryKey: invoiceListKey(filters),
    queryFn:  () => adminContabApi.invoices.list(filters),
  })
}

export function useInvoicePreview() {
  return useMutation({
    mutationFn: ({ orderIds, aplicarSaldoFavor }: { orderIds: number[]; aplicarSaldoFavor?: boolean }) =>
      adminContabApi.invoices.preview(orderIds, aplicarSaldoFavor),
  })
}

export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateInvoicePayload) => adminContabApi.invoices.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-contab', 'invoices'] })
    },
  })
}

/** REQ-446 — exporta la vista actual (tab + filtros), respetando RN1 (nunca el total sin filtrar). */
export function useInvoiceExport() {
  return useMutation({
    mutationFn: ({ format, filters }: { format: InvoiceExportFormat; filters: Omit<InvoiceListFilters, 'view'> }) =>
      adminContabApi.invoices.export(format, filters),
  })
}

// Batch 4 del cuerpo principal (SCRUM-524→528) — modal de detalle/trazabilidad, cobrabilidad,
// impresión fiscal, antigüedad de cartera.

const invoiceDetailKey = (orderId: number) => ['admin-contab', 'invoices', 'detail', orderId]
const INVOICE_AGING_KEY = ['admin-contab', 'invoices', 'aging']

export function useInvoiceDetail(orderId: number | null) {
  return useQuery({
    queryKey: invoiceDetailKey(orderId ?? -1),
    queryFn:  () => adminContabApi.invoices.detail(orderId as number),
    enabled:  orderId !== null,
  })
}

export function useMarkUncollectible() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, motivo }: { orderId: number; motivo: string }) =>
      adminContabApi.invoices.markUncollectible(orderId, motivo),
    onSuccess: (_data, { orderId }) => {
      qc.invalidateQueries({ queryKey: invoiceDetailKey(orderId) })
      qc.invalidateQueries({ queryKey: ['admin-contab', 'invoices', 'list'] })
    },
  })
}

export function useDecideUncollectible() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, approve }: { orderId: number; approve: boolean }) =>
      adminContabApi.invoices.decideUncollectible(orderId, approve),
    onSuccess: (_data, { orderId }) => {
      qc.invalidateQueries({ queryKey: invoiceDetailKey(orderId) })
      qc.invalidateQueries({ queryKey: ['admin-contab', 'invoices', 'list'] })
      qc.invalidateQueries({ queryKey: INVOICE_AGING_KEY })
    },
  })
}

export function useInvoiceAging() {
  return useQuery({
    queryKey: INVOICE_AGING_KEY,
    queryFn:  () => adminContabApi.invoices.aging(),
  })
}

export function useDownloadInvoicePdf() {
  return useMutation({
    mutationFn: ({ orderId, orderNumber }: { orderId: number; orderNumber: string }) =>
      adminContabApi.invoices.downloadPdf(orderId, orderNumber),
  })
}

// Batch 5 del cuerpo principal (SCRUM-539→544) — Cobros.

const PAYMENT_SUMMARY_KEY = ['admin-contab', 'payments', 'summary']
const paymentClientsKey   = (search: string) => ['admin-contab', 'payments', 'clients', search]
const openInvoicesKey     = (masterClientId: number | null) => ['admin-contab', 'payments', 'open-invoices', masterClientId ?? -1]
const defaultBankAccountKey = (metodoPago: PaymentMethod | null) => ['admin-contab', 'payments', 'default-bank-account', metodoPago ?? '']

export function usePaymentSummary() {
  return useQuery({
    queryKey: PAYMENT_SUMMARY_KEY,
    queryFn:  () => adminContabApi.payments.summary(),
  })
}

export function usePaymentClients(search: string) {
  return useQuery({
    queryKey: paymentClientsKey(search),
    queryFn:  () => adminContabApi.payments.searchClients(search),
  })
}

export function useOpenInvoices(masterClientId: number | null) {
  return useQuery({
    queryKey: openInvoicesKey(masterClientId),
    queryFn:  () => adminContabApi.payments.openInvoices(masterClientId as number),
    enabled:  masterClientId !== null,
  })
}

export function useDefaultBankAccount(metodoPago: PaymentMethod | null) {
  return useQuery({
    queryKey: defaultBankAccountKey(metodoPago),
    queryFn:  () => adminContabApi.payments.defaultBankAccount(metodoPago as PaymentMethod),
    enabled:  metodoPago !== null,
  })
}

export function useRegisterPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePaymentPayload) => adminContabApi.payments.register(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENT_SUMMARY_KEY })
      qc.invalidateQueries({ queryKey: ['admin-contab', 'payments', 'open-invoices'] })
      qc.invalidateQueries({ queryKey: ['admin-contab', 'payments', 'historial'] })
    },
  })
}

// Batch 6 del cuerpo principal (SCRUM-545→548, REQ-468→471) — historial+filtros y detalle.

const paymentHistorialKey = (filters: PaymentHistorialFilters) => ['admin-contab', 'payments', 'historial', filters]
const paymentDetailKey    = (id: number | null) => ['admin-contab', 'payments', 'detail', id ?? -1]

export function usePaymentHistorial(filters: PaymentHistorialFilters) {
  return useQuery({
    queryKey: paymentHistorialKey(filters),
    queryFn:  () => adminContabApi.payments.historial(filters),
  })
}

export function usePaymentDetail(id: number | null) {
  return useQuery({
    queryKey: paymentDetailKey(id),
    queryFn:  () => adminContabApi.payments.detail(id as number),
    enabled:  id !== null,
  })
}

// Batch 7 del cuerpo principal (SCRUM-549→552, REQ-472→475) — ver comprobante/recibo formal/
// confirmación manual.

const paymentAttachmentKey = (id: number | null) => ['admin-contab', 'payments', 'attachment', id ?? -1]

export function usePaymentAttachment(id: number | null) {
  return useQuery({
    queryKey: paymentAttachmentKey(id),
    queryFn:  () => adminContabApi.payments.attachment(id as number),
    enabled:  id !== null,
  })
}

export function useDownloadPaymentReceipt() {
  return useMutation({
    mutationFn: ({ id, numeroRecibo }: { id: number; numeroRecibo: string }) =>
      adminContabApi.payments.downloadReceiptPdf(id, numeroRecibo),
  })
}

export function useConfirmPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => adminContabApi.payments.confirm(id),
    onSuccess: (payment) => {
      qc.setQueryData(paymentDetailKey(payment.id), payment)
      qc.invalidateQueries({ queryKey: PAYMENT_SUMMARY_KEY })
      qc.invalidateQueries({ queryKey: ['admin-contab', 'payments', 'historial'] })
    },
  })
}

// Batch 8 del cuerpo principal (SCRUM-529→533, REQ-452→456) — Estado de Cuenta.

const accountStatementClientsKey  = (search: string) => ['admin-contab', 'account-statement', 'clients', search]
const accountStatementProjectsKey = (masterClientId: number | null) => ['admin-contab', 'account-statement', 'projects', masterClientId ?? -1]

export function useAccountStatementClients(search: string) {
  return useQuery({
    queryKey: accountStatementClientsKey(search),
    queryFn:  () => adminContabApi.accountStatement.searchClients(search),
  })
}

export function useAccountStatementProjects(masterClientId: number | null) {
  return useQuery({
    queryKey: accountStatementProjectsKey(masterClientId),
    queryFn:  () => adminContabApi.accountStatement.projects(masterClientId as number),
    enabled:  masterClientId !== null,
  })
}

export function useGenerateAccountStatement() {
  return useMutation({
    mutationFn: (filters: AccountStatementFilters) => adminContabApi.accountStatement.generate(filters),
  })
}

export function useDownloadAccountStatementExcel() {
  return useMutation({
    mutationFn: (filters: AccountStatementFilters) => adminContabApi.accountStatement.downloadExcel(filters),
  })
}

// Batch 10 — apertura de Notas Crédito y Devoluciones (SCRUM-553→558, REQ-476→481).

const NOTA_CREDITO_RESUMEN_MES_KEY = ['admin-contab', 'notas-credito', 'resumen-mes']
const NOTA_CREDITO_ITBMS_RATES_KEY = ['admin-contab', 'notas-credito', 'itbms-rates']

export function useNotaCreditoResumenMes() {
  return useQuery({
    queryKey: NOTA_CREDITO_RESUMEN_MES_KEY,
    queryFn:  () => adminContabApi.notasCredito.resumenMes(),
  })
}

export function useNotaCreditoItbmsRates(enabled = true) {
  return useQuery({
    queryKey: NOTA_CREDITO_ITBMS_RATES_KEY,
    queryFn:  () => adminContabApi.notasCredito.itbmsRates(),
    enabled,
  })
}

// Batch 11 (SCRUM-559→564, REQ-482→487) — submit real: factura de origen + registro.

const notaCreditoFacturasKey = (masterClientId: number | null) => ['admin-contab', 'notas-credito', 'facturas', masterClientId ?? -1]

export function useNotaCreditoFacturas(masterClientId: number | null) {
  return useQuery({
    queryKey: notaCreditoFacturasKey(masterClientId),
    queryFn:  () => adminContabApi.notasCredito.facturas(masterClientId as number),
    enabled:  masterClientId !== null,
  })
}

export function useRegisterNotaCredito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateNotaCreditoPayload) => adminContabApi.notasCredito.register(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTA_CREDITO_RESUMEN_MES_KEY })
      qc.invalidateQueries({ queryKey: ['admin-contab', 'notas-credito', 'facturas'] })
      qc.invalidateQueries({ queryKey: ['admin-contab', 'notas-credito', 'historial'] })
    },
  })
}

// Batch 12 del cuerpo principal (SCRUM-565→570, REQ-488→493) — submit real de "Corrección de
// datos", cola de Bodega, historial+filtros y detalle. Ver ADR-SCRUM565-570.

export function usePreviewCorreccionNotaCredito() {
  return useMutation({
    mutationFn: (payload: PreviewCorreccionPayload) => adminContabApi.notasCredito.previewCorreccion(payload),
  })
}

export function useRegisterCorreccionNotaCredito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: RegisterCorreccionPayload) => adminContabApi.notasCredito.registerCorreccion(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTA_CREDITO_RESUMEN_MES_KEY })
      qc.invalidateQueries({ queryKey: ['admin-contab', 'notas-credito', 'historial'] })
    },
  })
}

const notaCreditoHistorialKey = (filters: NotaCreditoHistorialFilters) => ['admin-contab', 'notas-credito', 'historial', filters]
const notaCreditoDetailKey    = (id: number | null) => ['admin-contab', 'notas-credito', 'detail', id ?? -1]

export function useNotaCreditoHistorial(filters: NotaCreditoHistorialFilters) {
  return useQuery({
    queryKey: notaCreditoHistorialKey(filters),
    queryFn:  () => adminContabApi.notasCredito.historial(filters),
  })
}

export function useNotaCreditoDetalle(id: number | null) {
  return useQuery({
    queryKey: notaCreditoDetailKey(id),
    queryFn:  () => adminContabApi.notasCredito.detail(id as number),
    enabled:  id !== null,
  })
}

// REQ-491 — precarga de una fila de la cola de Bodega. Mutation (no query) porque se dispara al
// hacer clic en la fila, no al montar un componente.
export function useNotaCreditoDevolucionDetail() {
  return useMutation({
    mutationFn: (customerReturnId: number) => adminContabApi.notasCredito.devolucionDetail(customerReturnId),
  })
}

// Batch 13 (SCRUM-571→574, REQ-494→497) — aprobación de Mark, comprobante, documento formal,
// factura relacionada. Ver ADR-SCRUM571-574.

export function useDecideNotaCredito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: NotaCreditoDecisionPayload }) =>
      adminContabApi.notasCredito.decide(id, payload),
    onSuccess: (note) => {
      qc.setQueryData(notaCreditoDetailKey(note.id), note)
      qc.invalidateQueries({ queryKey: NOTA_CREDITO_RESUMEN_MES_KEY })
      qc.invalidateQueries({ queryKey: ['admin-contab', 'notas-credito', 'historial'] })
    },
  })
}

const notaCreditoComprobanteKey = (id: number | null) => ['admin-contab', 'notas-credito', 'comprobante', id ?? -1]

export function useNotaCreditoComprobante(id: number | null) {
  return useQuery({
    queryKey: notaCreditoComprobanteKey(id),
    queryFn:  () => adminContabApi.notasCredito.comprobante(id as number),
    enabled:  id !== null,
  })
}

export function useDownloadNotaCreditoPdf() {
  return useMutation({
    mutationFn: ({ id, numero }: { id: number; numero: string }) => adminContabApi.notasCredito.downloadPdf(id, numero),
  })
}

// Batch 14 del cuerpo principal (SCRUM-575→579, REQ-498→502) — Comisiones Internas. Ver
// ADR-SCRUM575-579-batch14-comisiones-internas.md.

const COMMISSION_TIERS_KEY = ['admin-contab', 'commissions-internal', 'tiers']
const commissionSummaryKey = (filters: CommissionInternalFilters) => ['admin-contab', 'commissions-internal', 'summary', filters]
const COMMISSION_VENDOR_OPTIONS_KEY = ['admin-contab', 'commissions-internal', 'vendors']

export function useCommissionTiers() {
  return useQuery({
    queryKey: COMMISSION_TIERS_KEY,
    queryFn:  () => adminContabApi.commissionsInternal.tiers.list(),
  })
}

export function useCreateCommissionTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateCommissionTierPayload) => adminContabApi.commissionsInternal.tiers.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: COMMISSION_TIERS_KEY }),
  })
}

export function useUpdateCommissionTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateCommissionTierPayload> }) =>
      adminContabApi.commissionsInternal.tiers.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: COMMISSION_TIERS_KEY }),
  })
}

export function useDeleteCommissionTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => adminContabApi.commissionsInternal.tiers.remove(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: COMMISSION_TIERS_KEY }),
  })
}

export function useCommissionInternalSummary(filters: CommissionInternalFilters) {
  return useQuery({
    queryKey: commissionSummaryKey(filters),
    queryFn:  () => adminContabApi.commissionsInternal.summary(filters),
  })
}

// `enabled` — un vendedor (`view` sin `view_team`) no necesita esta lista, ya que no tiene
// selector de vendedor (REQ-577 permisos, ve solo su propio historial). Evita un request/403
// innecesario.
export function useCommissionVendorOptions(enabled = true) {
  return useQuery({
    queryKey: COMMISSION_VENDOR_OPTIONS_KEY,
    queryFn:  () => adminContabApi.commissionsInternal.vendorOptions(),
    enabled,
  })
}

export function useCommissionInternalExport() {
  return useMutation({
    mutationFn: ({ format, filters }: { format: CommissionExportFormat; filters: CommissionInternalFilters }) =>
      adminContabApi.commissionsInternal.export(format, filters),
  })
}

// Batch 15 (SCRUM-580→584, REQ-507). `enabled` — el modal solo lo pide mientras está abierto
// (mismo criterio que useCommissionVendorOptions con `canViewTeam`), evita un request de más al
// simplemente expandir la fila de un vendedor.
export function useCommissionAccountStatement(vendedorId: number, mes: string, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-contab', 'commissions-internal', 'account-statement', vendedorId, mes],
    queryFn:  () => adminContabApi.commissionsInternal.accountStatement(vendedorId, mes),
    enabled,
  })
}

export function useCommissionAccountStatementPdf() {
  return useMutation({
    mutationFn: ({ vendedorId, vendedorNombre, mes }: { vendedorId: number; vendedorNombre: string; mes: string }) =>
      adminContabApi.commissionsInternal.downloadAccountStatementPdf(vendedorId, vendedorNombre, mes),
  })
}

// Batch 16 (SCRUM-585→590, REQ-508→513) — Comisiones Externas. Ver
// ADR-SCRUM585-590-batch16-comisiones-externas.md.
const commissionExternalSummaryKey = (filters: CommissionExternalFilters) => ['admin-contab', 'commissions-external', 'summary', filters]
const ARCHITECT_OPTIONS_KEY = ['admin-contab', 'commissions-external', 'architects']

export function useCommissionExternalSummary(filters: CommissionExternalFilters) {
  return useQuery({
    queryKey: commissionExternalSummaryKey(filters),
    queryFn:  () => adminContabApi.commissionsExternal.summary(filters),
  })
}

export function useArchitectOptions() {
  return useQuery({
    queryKey: ARCHITECT_OPTIONS_KEY,
    queryFn:  () => adminContabApi.commissionsExternal.architectOptions(),
  })
}

export function useUpdateArchitectFiscalProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ architectId, data }: { architectId: number; data: ArchitectFiscalProfilePayload }) =>
      adminContabApi.commissionsExternal.updateFiscalProfile(architectId, data),
    // Invalida todo `commissions-external` (summary con cualquier filtro) — más simple que
    // reconstruir la queryKey exacta del filtro activo, mismo criterio ya usado para tiers.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-contab', 'commissions-external'] }),
  })
}

export function useUploadArchitectCuentaCobro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pipelineCardId, file }: { pipelineCardId: number; file: File }) =>
      adminContabApi.commissionsExternal.uploadCuentaCobro(pipelineCardId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-contab', 'commissions-external'] }),
  })
}

export function useViewArchitectCuentaCobro() {
  return useMutation({
    mutationFn: (pipelineCardId: number) => adminContabApi.commissionsExternal.viewCuentaCobro(pipelineCardId),
  })
}

// Batch 17 (SCRUM-591→596, REQ-514→519). Todas las mutaciones invalidan `commissions-external`
// completo — mismo criterio que arriba, más simple que reconstruir la queryKey del filtro activo.
const BANK_ACCOUNT_OPTIONS_KEY = ['admin-contab', 'commissions-external', 'bank-accounts']

export function useUploadArchitectComprobanteRetencion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pipelineCardId, file }: { pipelineCardId: number; file: File }) =>
      adminContabApi.commissionsExternal.uploadComprobanteRetencion(pipelineCardId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-contab', 'commissions-external'] }),
  })
}

export function useViewArchitectComprobanteRetencion() {
  return useMutation({
    mutationFn: (pipelineCardId: number) => adminContabApi.commissionsExternal.viewComprobanteRetencion(pipelineCardId),
  })
}

export function useBankAccountOptions() {
  return useQuery({
    queryKey: BANK_ACCOUNT_OPTIONS_KEY,
    queryFn:  () => adminContabApi.commissionsExternal.bankAccountOptions(),
  })
}

export function useUpdateArchitectCuentaPago() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pipelineCardId, data }: { pipelineCardId: number; data: UpdateCuentaPagoPayload }) =>
      adminContabApi.commissionsExternal.updateCuentaPago(pipelineCardId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-contab', 'commissions-external'] }),
  })
}

export function useProposeArchitectPercent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pipelineCardId, data }: { pipelineCardId: number; data: ProposePercentPayload }) =>
      adminContabApi.commissionsExternal.proposePercent(pipelineCardId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-contab', 'commissions-external'] }),
  })
}

export function useDecideArchitectPercent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pipelineCardId, data }: { pipelineCardId: number; data: DecidePercentPayload }) =>
      adminContabApi.commissionsExternal.decidePercent(pipelineCardId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-contab', 'commissions-external'] }),
  })
}

export function useMarkArchitectCommissionPaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pipelineCardId: number) => adminContabApi.commissionsExternal.markPaid(pipelineCardId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-contab', 'commissions-external'] }),
  })
}

export function useSendArchitectReminder() {
  return useMutation({
    mutationFn: (pipelineCardId: number) => adminContabApi.commissionsExternal.sendReminder(pipelineCardId),
  })
}

// Batch 18 (SCRUM-597→601, REQ-520→524) — Arqueo / Flujo de Caja, parte 1. Ver
// ADR-SCRUM597-601-batch18-arqueo-caja.md.

const CASH_POSITION_HEADER_KEY = ['admin-contab', 'cash-position', 'header']
const cashPositionProjectedKey = (windowDays: CashPositionWindowDays) => ['admin-contab', 'cash-position', 'projected', windowDays]
const cashPositionRealKey      = (windowDays: 30 | 90) => ['admin-contab', 'cash-position', 'real', windowDays]
const DAILY_CASH_COUNT_KEY     = ['admin-contab', 'cash-position', 'daily-count']

export function useCashPositionHeader() {
  return useQuery({
    queryKey: CASH_POSITION_HEADER_KEY,
    queryFn:  () => adminContabApi.cashPosition.header(),
  })
}

// `enabled` — Yaneth (asistente_administrativa) no tiene acceso a REQ-521 (ver ADR, reconciliación
// punto 8); ArqueoCajaPage nunca la deja seleccionar Proyectado, así que este hook nunca dispara
// para ella, evitando un 403 innecesario.
export function useCashPositionProjected(windowDays: CashPositionWindowDays, enabled = true) {
  return useQuery({
    queryKey: cashPositionProjectedKey(windowDays),
    queryFn:  () => adminContabApi.cashPosition.projected(windowDays),
    enabled,
  })
}

export function useCashPositionReal(windowDays: 30 | 90, enabled = true) {
  return useQuery({
    queryKey: cashPositionRealKey(windowDays),
    queryFn:  () => adminContabApi.cashPosition.real(windowDays),
    enabled,
  })
}

export function useDailyCashCount(enabled = true) {
  return useQuery({
    queryKey: DAILY_CASH_COUNT_KEY,
    queryFn:  () => adminContabApi.cashPosition.dailyCount(),
    enabled,
  })
}

export function useUpdateDailyCashCountEntryObservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateDailyCashCountEntryPayload) => adminContabApi.cashPosition.updateEntryObservation(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: DAILY_CASH_COUNT_KEY }),
  })
}

export function useUpdateDailyCashCountGeneralObservation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (observacion: string | null) => adminContabApi.cashPosition.updateGeneralObservation(observacion),
    onSuccess: () => qc.invalidateQueries({ queryKey: DAILY_CASH_COUNT_KEY }),
  })
}

export function useCashPositionExport() {
  return useMutation({
    mutationFn: ({ view, windowDays, format }: { view: CashFlowExportView; windowDays: CashPositionWindowDays; format: 'pdf' | 'excel' }) =>
      adminContabApi.cashPosition.export(view, windowDays, format),
  })
}

// Batch 19 (SCRUM-602→606, REQ-525→529) — Arqueo / Flujo de Caja, parte 2. Ver
// ADR-SCRUM602-606-batch19-arqueo-caja-parte2.md.

const DAILY_CASH_COUNT_HISTORY_KEY = (page: number) => ['admin-contab', 'cash-position', 'history', page]
const dailyCashCountHistoryDetailKey = (id: number | null) => ['admin-contab', 'cash-position', 'history-detail', id ?? -1]

// REQ-526 — al cerrar, el arqueo activo avanza solo (REQ-527 RN3): invalidar la query del activo
// alcanza, el siguiente fetch ya resuelve la nueva fecha activa. También invalida el historial (el
// arqueo recién cerrado aparece ahí) y su contador de pendientes.
export function useCloseDailyCashCount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => adminContabApi.cashPosition.closeDailyCount(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DAILY_CASH_COUNT_KEY })
      qc.invalidateQueries({ queryKey: ['admin-contab', 'cash-position', 'history'] })
    },
  })
}

export function useDailyCashCountHistory(page: number) {
  return useQuery({
    queryKey: DAILY_CASH_COUNT_HISTORY_KEY(page),
    queryFn:  () => adminContabApi.cashPosition.history(page),
  })
}

export function useDailyCashCountHistoryDetail(id: number | null) {
  return useQuery({
    queryKey: dailyCashCountHistoryDetailKey(id),
    queryFn:  () => adminContabApi.cashPosition.historyDetail(id as number),
    enabled:  id !== null,
  })
}

export function useApproveDailyCashCount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => adminContabApi.cashPosition.approve(id),
    onSuccess: (data, id) => {
      qc.setQueryData(dailyCashCountHistoryDetailKey(id), data)
      qc.invalidateQueries({ queryKey: ['admin-contab', 'cash-position', 'history'] })
    },
  })
}

export function useExportDailyCashCount() {
  return useMutation({
    mutationFn: (numero: number | null) => adminContabApi.cashPosition.exportDailyCount(numero),
  })
}

export function useExportDailyCashCountHistory() {
  return useMutation({
    mutationFn: ({ id, numero }: { id: number; numero: number | null }) => adminContabApi.cashPosition.exportHistory(id, numero),
  })
}

// REQ-525 — sube/reemplaza la constancia de retención de un cobro puntual. Invalida el arqueo
// activo Y el detalle del historial (RN4: se puede subir después de cerrado) — más simple que
// intentar adivinar cuál de los dos la tenía abierta.
export function useUploadRetentionAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ paymentId, file }: { paymentId: number; file: File }) =>
      adminContabApi.payments.uploadRetentionAttachment(paymentId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DAILY_CASH_COUNT_KEY })
      qc.invalidateQueries({ queryKey: ['admin-contab', 'cash-position', 'history-detail'] })
    },
  })
}

// Batch 20 (SCRUM-612→617, REQ-535→540) — Caja Chica.

const PETTY_CASH_SUMMARY_KEY = ['admin-contab', 'petty-cash', 'summary']
const PETTY_CASH_PENDING_KEY = ['admin-contab', 'petty-cash', 'pending']
const PETTY_CASH_REPORTS_KEY = ['admin-contab', 'petty-cash', 'reports']
const PETTY_CASH_REJECTED_KEY = ['admin-contab', 'petty-cash', 'rejected']
const pettyCashReportDetailKey = (numero: string) => ['admin-contab', 'petty-cash', 'reports', numero]
const pettyCashExpenseDetailKey = (id: number) => ['admin-contab', 'petty-cash', 'expenses', id]

export function usePettyCashSummary() {
  return useQuery({ queryKey: PETTY_CASH_SUMMARY_KEY, queryFn: () => adminContabApi.pettyCash.summary() })
}

export function usePettyCashPending() {
  return useQuery({ queryKey: PETTY_CASH_PENDING_KEY, queryFn: () => adminContabApi.pettyCash.pending() })
}

function invalidatePettyCashLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: PETTY_CASH_SUMMARY_KEY })
  qc.invalidateQueries({ queryKey: PETTY_CASH_PENDING_KEY })
  qc.invalidateQueries({ queryKey: PETTY_CASH_REPORTS_KEY })
}

export function useCreatePettyCashExpenses() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (lineas: PettyCashNewExpenseLine[]) => adminContabApi.pettyCash.createExpenses(lineas),
    onSuccess: () => invalidatePettyCashLists(qc),
  })
}

export function useGeneratePettyCashReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePettyCashReportPayload) => adminContabApi.pettyCash.generateReport(payload),
    onSuccess: () => invalidatePettyCashLists(qc),
  })
}

export function usePettyCashReports() {
  return useQuery({ queryKey: PETTY_CASH_REPORTS_KEY, queryFn: () => adminContabApi.pettyCash.reports() })
}

export function usePettyCashReportDetail(numero: string | null) {
  return useQuery({
    queryKey: pettyCashReportDetailKey(numero ?? ''),
    queryFn:  () => adminContabApi.pettyCash.reportDetail(numero as string),
    enabled:  numero !== null,
  })
}

export function usePettyCashAttachmentUrl() {
  return useMutation({
    mutationFn: ({ expenseId, attachmentId }: { expenseId: number; attachmentId: number }) =>
      adminContabApi.pettyCash.attachmentUrl(expenseId, attachmentId),
  })
}

export function useApprovePettyCashReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (numero: string) => adminContabApi.pettyCash.approveReport(numero),
    // El endpoint de approve devuelve solo { numero, estado } (REQ-540) — pisar el cache del
    // detalle completo (grupos, total_general, etc.) con esa respuesta angosta rompía el render
    // (hallazgo Pre-QA Batch 20, SCRUM-617). Invalidar en vez de sobreescribir fuerza un refetch
    // real de GET /reports/{numero}, que sí trae el shape completo.
    onSuccess: (_data, numero) => {
      qc.invalidateQueries({ queryKey: pettyCashReportDetailKey(numero) })
      qc.invalidateQueries({ queryKey: PETTY_CASH_REPORTS_KEY })
      qc.invalidateQueries({ queryKey: PETTY_CASH_SUMMARY_KEY })
    },
  })
}

export function useDownloadPettyCashReportPdf() {
  return useMutation({
    mutationFn: (numero: string) => adminContabApi.pettyCash.downloadReportPdf(numero),
  })
}

// Batch 21 (SCRUM-618→623, REQ-541→546) — rechazo/reapertura de líneas.

export function usePettyCashRejected() {
  return useQuery({ queryKey: PETTY_CASH_REJECTED_KEY, queryFn: () => adminContabApi.pettyCash.rejected() })
}

export function usePettyCashExpenseDetail(id: number | null) {
  return useQuery({
    queryKey: pettyCashExpenseDetailKey(id ?? -1),
    queryFn:  () => adminContabApi.pettyCash.expenseDetail(id as number),
    enabled:  id !== null,
  })
}

export function useUpdatePettyCashExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdatePettyCashExpensePayload }) =>
      adminContabApi.pettyCash.updateExpense(id, payload),
    // El detalle actualizado viene completo (mismo shape de GET), así que setQueryData es seguro
    // acá — pero igual invalidamos Pendientes/Rechazados porque esas listas muestran los mismos
    // campos (fecha/proveedor/descripción/montos) y no se actualizan solas.
    onSuccess: (detail) => {
      qc.setQueryData(pettyCashExpenseDetailKey(detail.id), detail)
      qc.invalidateQueries({ queryKey: PETTY_CASH_PENDING_KEY })
      qc.invalidateQueries({ queryKey: PETTY_CASH_REJECTED_KEY })
    },
  })
}

export function useAddPettyCashExpenseAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, foto }: { id: number; foto: File }) => adminContabApi.pettyCash.addAttachment(id, foto),
    onSuccess: (detail) => {
      qc.setQueryData(pettyCashExpenseDetailKey(detail.id), detail)
      qc.invalidateQueries({ queryKey: PETTY_CASH_PENDING_KEY })
      qc.invalidateQueries({ queryKey: PETTY_CASH_REJECTED_KEY })
      if (detail.reporte_numero) qc.invalidateQueries({ queryKey: pettyCashReportDetailKey(detail.reporte_numero) })
    },
  })
}

// REQ-541 — se dispara desde el detalle de un REPORTE, no desde el detalle de la línea (la línea
// puede dejar de existir en ese contexto tras el rechazo), así que invalida el reporte y las 3
// listas en vez de intentar pisar el cache de un objeto puntual. Respuesta angosta a propósito
// (ver RejectPettyCashExpenseResponse) — nunca setQueryData con esto.
export function useRejectPettyCashExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => adminContabApi.pettyCash.rejectExpense(id, motivo),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: PETTY_CASH_SUMMARY_KEY })
      qc.invalidateQueries({ queryKey: PETTY_CASH_PENDING_KEY })
      qc.invalidateQueries({ queryKey: PETTY_CASH_REJECTED_KEY })
      qc.invalidateQueries({ queryKey: PETTY_CASH_REPORTS_KEY })
      qc.invalidateQueries({ queryKey: pettyCashExpenseDetailKey(id) })
    },
  })
}

export function useRejectPettyCashReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ numero, motivo }: { numero: string; motivo: string }) => adminContabApi.pettyCash.rejectReport(numero, motivo),
    onSuccess: (_data, { numero }) => {
      qc.invalidateQueries({ queryKey: pettyCashReportDetailKey(numero) })
      qc.invalidateQueries({ queryKey: PETTY_CASH_REPORTS_KEY })
      qc.invalidateQueries({ queryKey: PETTY_CASH_PENDING_KEY })
      qc.invalidateQueries({ queryKey: PETTY_CASH_REJECTED_KEY })
      qc.invalidateQueries({ queryKey: PETTY_CASH_SUMMARY_KEY })
      // SCRUM-621 rebote — rechazar el reporte completo deja stale el detalle unificado
      // (editable/puede_reabrir) de cada línea que tenía abierta su propia query cacheada;
      // a diferencia de useRejectPettyCashExpense() no conocemos acá los ids de esas líneas,
      // así que invalidamos por prefijo (todas las expenses/{id}) en vez de una por una.
      qc.invalidateQueries({ queryKey: ['admin-contab', 'petty-cash', 'expenses'] })
    },
  })
}

// REQ-544 — Felix/Yaneth, no Mark. El detalle actualizado viene completo, setQueryData es seguro.
export function useReopenPettyCashExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => adminContabApi.pettyCash.reopenExpense(id, motivo),
    onSuccess: (detail) => {
      qc.setQueryData(pettyCashExpenseDetailKey(detail.id), detail)
      qc.invalidateQueries({ queryKey: PETTY_CASH_PENDING_KEY })
      qc.invalidateQueries({ queryKey: PETTY_CASH_REJECTED_KEY })
      qc.invalidateQueries({ queryKey: PETTY_CASH_SUMMARY_KEY })
    },
  })
}

// Batch 22 (SCRUM-643→647, REQ-566→570) — home de Reportes. Comisión Felix y Cartera (RN4 REQ-567
// / RN3 REQ-568) nunca dependen del selector de período — sus query keys NO llevan `periodo`, así
// que cambiar el selector jamás las re-dispara (mismo criterio que `CASH_POSITION_HEADER_KEY` vs.
// `cashPositionProjectedKey`).

const REPORTS_FELIX_COMMISSION_KEY = ['admin-contab', 'reports', 'felix-commission']
const REPORTS_CARTERA_KEY          = ['admin-contab', 'reports', 'cartera']
const reportsVentasKey             = (periodo: ReportsPeriodo) => ['admin-contab', 'reports', 'ventas', periodo]
const reportsFlujoCajaKey          = (periodo: ReportsPeriodo) => ['admin-contab', 'reports', 'flujo-caja', periodo]

export function useReportsFelixCommission() {
  return useQuery({
    queryKey: REPORTS_FELIX_COMMISSION_KEY,
    queryFn:  () => adminContabApi.reports.felixCommission(),
  })
}

export function useReportsCartera() {
  return useQuery({
    queryKey: REPORTS_CARTERA_KEY,
    queryFn:  () => adminContabApi.reports.cartera(),
  })
}

export function useReportsVentas(periodo: ReportsPeriodo) {
  return useQuery({
    queryKey: reportsVentasKey(periodo),
    queryFn:  () => adminContabApi.reports.ventas(periodo),
  })
}

export function useReportsFlujoCaja(periodo: ReportsPeriodo) {
  return useQuery({
    queryKey: reportsFlujoCajaKey(periodo),
    queryFn:  () => adminContabApi.reports.flujoCaja(periodo),
  })
}

// Batch 23 (SCRUM-648/649, REQ-571/572). Comisiones SÍ depende del período (query key con
// `periodo`, mismo criterio que Ventas/Arqueo de Caja); Notas de Crédito nunca depende de él
// (mismo criterio que Felix/Cartera arriba).
const reportsComisionesKey = (periodo: ReportsPeriodo) => ['admin-contab', 'reports', 'comisiones', periodo]
const REPORTS_NOTAS_CREDITO_KEY = ['admin-contab', 'reports', 'notas-credito']

export function useReportsComisiones(periodo: ReportsPeriodo) {
  return useQuery({
    queryKey: reportsComisionesKey(periodo),
    queryFn:  () => adminContabApi.reports.comisiones(periodo),
  })
}

export function useReportsNotasCredito() {
  return useQuery({
    queryKey: REPORTS_NOTAS_CREDITO_KEY,
    queryFn:  () => adminContabApi.reports.notasCredito(),
  })
}

// Batch 23 Grupo 2 (SCRUM-651→660, REQ-574→583) — "Mensual por cliente" / "Acumulado". Mismo
// patrón que `useGenerateAccountStatement`/`useDownloadAccountStatementExcel` (mutation disparada
// por el botón "Filtrar" o al elegir cliente, no un `useQuery` reactivo — el mockup real solo
// recalcula al cambiar cliente o presionar Filtrar, nunca en cada tecleo de fecha).
export function useGenerateMensualClienteReport() {
  return useMutation({
    mutationFn: (params: ClientCollectionReportParams) => adminContabApi.reports.mensualCliente(params),
  })
}

export function useDownloadMensualClienteExcel() {
  return useMutation({
    mutationFn: (params: ClientCollectionReportParams) => adminContabApi.reports.mensualClienteExcel(params),
  })
}

export function useGenerateMensualClienteAcumuladoReport() {
  return useMutation({
    mutationFn: (params: ClientCollectionReportParams) => adminContabApi.reports.mensualClienteAcumulado(params),
  })
}

export function useDownloadMensualClienteAcumuladoExcel() {
  return useMutation({
    mutationFn: (params: ClientCollectionReportParams) => adminContabApi.reports.mensualClienteAcumuladoExcel(params),
  })
}

// Batch 23 Grupo 3 (SCRUM-661→664, REQ-584→587) — "Libro de facturas". A diferencia de Mensual
// por Cliente (Grupo 2), acá no hay un estado bloqueante "sin cliente" — la pantalla siempre tiene
// algo para mostrar (todos los documentos por defecto), así que un `useQuery` reactivo a los
// filtros ya aplicados es más simple que una mutation. El componente controla cuándo cambia la
// query key: el `<select>` de tipo la cambia de inmediato (RN2 REQ-584), las fechas solo al
// presionar "Filtrar" (mismo criterio ya usado en Grupo 2).
const libroFacturasKey = (params: InvoiceBookReportParams) => ['admin-contab', 'reports', 'libro-facturas', params.desde ?? null, params.hasta ?? null, params.tipo ?? null]

export function useLibroFacturas(params: InvoiceBookReportParams) {
  return useQuery({
    queryKey: libroFacturasKey(params),
    queryFn:  () => adminContabApi.reports.libroFacturas(params),
  })
}

export function useDownloadLibroFacturasExcel() {
  return useMutation({
    mutationFn: (params: InvoiceBookReportParams) => adminContabApi.reports.libroFacturasExcel(params),
  })
}

// Batch 23 Grupo 3 (SCRUM-665→669, REQ-588→592) — "Ventas por medio de pago". Mismo criterio que
// Libro de Facturas — sin estado bloqueante, `useQuery` reactivo a los filtros ya aplicados.
const ventasMedioPagoKey = (params: PaymentMethodSalesReportParams) => ['admin-contab', 'reports', 'ventas-medio-pago', params.masterClientId ?? null, params.desde ?? null, params.hasta ?? null]

export function useVentasMedioPago(params: PaymentMethodSalesReportParams) {
  return useQuery({
    queryKey: ventasMedioPagoKey(params),
    queryFn:  () => adminContabApi.reports.ventasMedioPago(params),
  })
}

export function useDownloadVentasMedioPagoExcel() {
  return useMutation({
    mutationFn: (params: PaymentMethodSalesReportParams) => adminContabApi.reports.ventasMedioPagoExcel(params),
  })
}

// Batch Home (SCRUM-503→512, REQ-426→435) — "Inicio". Grupo 1: "Resumen del mes" (REQ-427→431).
// Sin parámetros — siempre mes en curso a la fecha, mismo criterio que Comisión Felix/Cartera.
const HOME_RESUMEN_MES_KEY = ['admin-contab', 'home', 'resumen-mes']

export function useHomeResumenMes() {
  return useQuery({
    queryKey: HOME_RESUMEN_MES_KEY,
    queryFn:  () => adminContabApi.home.resumenMes(),
  })
}

const HOME_PENDIENTES_KEY = ['admin-contab', 'home', 'pendientes']

// Grupo 3 (SCRUM-510, REQ-433) — panel "Pendientes".
export function useHomePendientes() {
  return useQuery({
    queryKey: HOME_PENDIENTES_KEY,
    queryFn:  () => adminContabApi.home.pendientes(),
  })
}

const HOME_VENCIDOS_POR_VENCER_KEY = ['admin-contab', 'home', 'vencidos-por-vencer']

// Grupo 4 (SCRUM-511, REQ-434) — panel "Vencidos y por vencer".
export function useHomeVencidosPorVencer() {
  return useQuery({
    queryKey: HOME_VENCIDOS_POR_VENCER_KEY,
    queryFn:  () => adminContabApi.home.vencidosPorVencer(),
  })
}

// Grupo 5 (SCRUM-503, REQ-426) — encabezado, conteo de "reuniones" (RN3: eventos de HOY en "Mi
// calendario", mismo endpoint que AdminContMyCalendarPanel, solo que acotado a `pill: 'day'`
// siempre, sin importar qué vista tenga abierta el panel de calendario en ese momento).
export function useHomeCalendarToday() {
  const range = rangeForPill('day')

  return useQuery({
    queryKey: ['admin-contab', 'home', 'calendar', range.from, range.to],
    queryFn:  () => adminContabApi.home.calendar.list(range),
  })
}
