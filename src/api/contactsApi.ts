import api from './authApi'
import type { DirectoryType } from '@/types/directory'

export interface Contact {
  id:               number
  nombre:           string
  tipo:             DirectoryType
  email:            string | null
  telefono:         string | null
  empresa:          string | null
  notas:            string | null
  source:           'contacts'
  project_count:    number
  areas:            string[]
  ubicaciones:      string[]
  valor_total:      number
  valor_cerrado:    number
  ultima_actividad: string | null
}

export interface ContactsResponse {
  stats: {
    total:          number
    total_projects: number
    total_valor:    number
    total_cerrado:  number
  }
  entries: Contact[]
}

export interface ContactPayload {
  nombre:   string
  tipo:     DirectoryType
  email?:   string | null
  telefono?: string | null
  empresa?: string | null
  notas?:   string | null
}

export const contactsApi = {
  list: (type = '', q = ''): Promise<ContactsResponse> =>
    api.get<ContactsResponse>('/crm/contacts', {
      params: { type: type || undefined, q: q || undefined },
    }).then(r => r.data),

  create: (data: ContactPayload): Promise<Contact> =>
    api.post<Contact>('/crm/contacts', data).then(r => r.data),

  update: (id: number, data: Partial<ContactPayload>): Promise<Contact> =>
    api.put<Contact>(`/crm/contacts/${id}`, data).then(r => r.data),

  remove: (id: number): Promise<void> =>
    api.delete(`/crm/contacts/${id}`).then(() => undefined),

  importFromProjects: (): Promise<{ created: number; updated: number; skipped: number }> =>
    api.post<{ created: number; updated: number; skipped: number }>('/crm/contacts/import').then(r => r.data),
}
