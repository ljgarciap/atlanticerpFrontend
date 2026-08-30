import api from './authApi'

export type TriggerType   = 'model_event' | 'date_proximity'
export type TriggerEvent  = 'created' | 'updated'
export type Operator      = 'changed' | 'changed_to' | 'equals' | 'gt' | 'lt' | 'gte' | 'lte'
export type RecipientType = 'user' | 'role' | 'project_assignees'
export type Channel       = 'in_app' | 'email'

export interface NotificationRule {
  id:               number
  name:             string
  trigger_type:     TriggerType
  trigger_model:    string | null
  trigger_event:    TriggerEvent | null
  field:            string | null
  operator:         Operator | null
  value:            unknown
  channels:         Channel[]
  recipient_type:   RecipientType
  recipient_value:  unknown
  is_active:        boolean
  created_at:       string
}

export interface NotificationRuleRegistry {
  models:           Record<string, string[]>
  operators:        Operator[]
  recipient_types:  RecipientType[]
}

export interface NotificationRuleListResponse {
  data:     NotificationRule[]
  registry: NotificationRuleRegistry
}

export interface NotificationRulePayload {
  name:             string
  trigger_type:     TriggerType
  trigger_model:    string
  trigger_event:    TriggerEvent
  field:            string | null
  operator:         Operator | null
  value:            unknown
  channels:         Channel[]
  recipient_type:   RecipientType
  recipient_value:  unknown
  is_active?:       boolean
}

export const notificationRulesApi = {
  list: (): Promise<NotificationRuleListResponse> =>
    api.get('/admin/notification-rules').then(r => r.data as NotificationRuleListResponse),

  create: (data: NotificationRulePayload): Promise<NotificationRule> =>
    api.post('/admin/notification-rules', data).then(r => r.data as NotificationRule),

  update: (id: number, data: NotificationRulePayload): Promise<NotificationRule> =>
    api.put(`/admin/notification-rules/${id}`, data).then(r => r.data as NotificationRule),

  remove: (id: number): Promise<void> =>
    api.delete(`/admin/notification-rules/${id}`).then(() => undefined),
}
