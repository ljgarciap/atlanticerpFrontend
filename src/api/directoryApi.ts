import api from './authApi'
import type { DirectoryResponse, DirectoryType } from '@/types/directory'

export const directoryApi = {
  get: (type: DirectoryType, q = ''): Promise<DirectoryResponse> =>
    api
      .get<DirectoryResponse>('/crm/directory', { params: { type, q: q || undefined } })
      .then(r => r.data),
}
