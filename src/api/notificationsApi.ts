import api from './authApi'

export interface NotificationContent {
  subject:  string
  body:     string
  cta_url?: string
}

export interface Notification {
  id:         number
  content:    NotificationContent
  link_url:   string | null
  is_read:    boolean
  read_at:    string | null
  created_at: string
}

export interface NotificationListResponse {
  data: Notification[]
  meta: {
    total:        number
    per_page:     number
    current_page: number
    last_page:    number
  }
}

export const notificationsApi = {
  list: (page = 1): Promise<NotificationListResponse> =>
    api.get('/notifications', { params: { page } }).then(r => r.data as NotificationListResponse),

  unreadCount: (): Promise<number> =>
    api.get('/notifications/unread-count').then(r => (r.data as { count: number }).count),

  markRead: (id: number): Promise<Notification> =>
    api.post(`/notifications/${id}/read`).then(r => r.data as Notification),

  markAllRead: (): Promise<void> =>
    api.post('/notifications/read-all').then(() => undefined),
}
