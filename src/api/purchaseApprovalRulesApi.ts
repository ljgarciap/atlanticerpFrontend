import api from './authApi'

export type ShippingType = 'aereo' | 'maritimo' | 'terrestre'
export type ShippingPayer = 'atlantic' | 'proveedor'

export interface PurchaseApprovalRule {
  id:                number
  name:              string
  sort_order:        number
  is_active:         boolean
  shipping_type:     ShippingType | null
  who_pays_shipping: ShippingPayer | null
  min_amount:        number | null
  max_amount:        number | null
  requires_approval: boolean
}

export interface RuleWarning { rule_id: number, name: string, message: string }

export type PurchaseApprovalRuleSaved = PurchaseApprovalRule & { warnings?: RuleWarning[] }

export interface CoverageGap { from: number, to: number | null }

export interface CoverageCombo { shipping_type: ShippingType, who_pays_shipping: ShippingPayer | null, gaps: CoverageGap[] }

export interface RuleCoverage { no_rule_requires_approval: boolean, has_gaps: boolean, combos: CoverageCombo[] }

export type PurchaseApprovalRuleInput = Omit<PurchaseApprovalRule, 'id'>

export interface ApprovalPreviewInput {
  shipping_type:     ShippingType | null
  who_pays_shipping: ShippingPayer | null
  amount:            number
}

export interface ApprovalPreview {
  requires_approval: boolean
  rule:              { id: number, name: string } | null
}

/** Fase 14a — reglas de aprobación de órdenes de compra (solo superadmin). */
export const purchaseApprovalRulesApi = {
  list: (): Promise<PurchaseApprovalRule[]> =>
    api.get<{ data: PurchaseApprovalRule[] }>('/admin/purchase-approval-rules').then(r => r.data.data),

  create: (input: PurchaseApprovalRuleInput): Promise<PurchaseApprovalRuleSaved> =>
    api.post<PurchaseApprovalRuleSaved>('/admin/purchase-approval-rules', input).then(r => r.data),

  update: (id: number, input: PurchaseApprovalRuleInput): Promise<PurchaseApprovalRuleSaved> =>
    api.put<PurchaseApprovalRuleSaved>(`/admin/purchase-approval-rules/${id}`, input).then(r => r.data),

  remove: (id: number): Promise<void> =>
    api.delete(`/admin/purchase-approval-rules/${id}`).then(() => undefined),

  /** Fase 20d — rangos de monto que ninguna regla activa cubre, por tipo de envío y pagador. */
  coverage: (): Promise<RuleCoverage> =>
    api.get<RuleCoverage>('/admin/purchase-approval-rules/coverage').then(r => r.data),

  preview: (input: ApprovalPreviewInput): Promise<ApprovalPreview> =>
    api.post<ApprovalPreview>('/admin/purchase-approval-rules/preview', input).then(r => r.data),
}
