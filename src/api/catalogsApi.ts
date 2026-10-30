import api from './authApi'
import type { CatalogDomain, CatalogEntry } from '@/types/catalogs'

/**
 * Fase 7a — catálogos de vocabulario por empresa. Lectura general (`/catalogs/...`, entradas activas) y administración de superadmin
 * (`/admin/catalogs/...`, también las inactivas).
 */
export const catalogsApi = {
  domains: (): Promise<CatalogDomain[]> => api.get<CatalogDomain[]>('/catalogs/domains').then(r => r.data),

  list: (domain: string): Promise<CatalogEntry[]> => api.get<CatalogEntry[]>(`/catalogs/${domain}`).then(r => r.data),

  adminList: (domain: string): Promise<CatalogEntry[]> => api.get<CatalogEntry[]>(`/admin/catalogs/${domain}`).then(r => r.data),

  create: (domain: string, body: { key: string, label: string, labels?: Record<string, string>, sort_order?: number, props?: CatalogEntry['props'] }): Promise<CatalogEntry> =>
    api.post<CatalogEntry>(`/admin/catalogs/${domain}`, body).then(r => r.data),

  update: (domain: string, id: number, body: Partial<Pick<CatalogEntry, 'label' | 'labels' | 'sort_order' | 'is_active' | 'props'>>): Promise<CatalogEntry> =>
    api.put<CatalogEntry>(`/admin/catalogs/${domain}/${id}`, body).then(r => r.data),

  remove: (domain: string, id: number): Promise<void> => api.delete(`/admin/catalogs/${domain}/${id}`).then(() => undefined),
}
