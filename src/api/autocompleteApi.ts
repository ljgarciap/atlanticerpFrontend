import api from './authApi'

export type AutocompleteField =
  | 'encargado'
  | 'developer'
  | 'arquitecto'
  | 'despacho'
  | 'ubicacion'
  | 'contacto'

export interface AutocompleteUser {
  id:         number
  first_name: string
  last_name:  string
  email:      string
}

export interface ContactSuggestion {
  nombre:   string
  email:    string | null
  telefono: string | null
}

export const autocompleteApi = {
  fields: (field: AutocompleteField, q = ''): Promise<string[]> =>
    api
      .get<{ data: string[] }>('/crm/autocomplete/fields', { params: { field, q } })
      .then(r => r.data.data),

  users: (q = ''): Promise<AutocompleteUser[]> =>
    api
      .get<{ data: AutocompleteUser[] }>('/crm/autocomplete/users', { params: { q } })
      .then(r => r.data.data),

  contacts: (q = ''): Promise<ContactSuggestion[]> =>
    api
      .get<{ data: ContactSuggestion[] }>('/crm/autocomplete/contacts', { params: { q } })
      .then(r => r.data.data),
}
