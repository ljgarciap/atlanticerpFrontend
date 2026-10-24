import api from './authApi'
import type {
  Manual,
  ManualUploadInitRequest,
  ManualUploadInitResponse,
  ManualUrlAction,
  ManualUrlResponse,
  ManualesConfig,
} from '@/types/manuales'

// SCRUM-984 — el backend expone la biblioteca; los archivos viven en el bucket S3 compartido y se
// leen/escriben siempre con URLs prefirmadas (nunca pasan por PHP).
export const manualesApi = {
  list: (): Promise<Manual[]> =>
    api.get<Manual[] | { data: Manual[] }>('/biblioteca').then(r =>
      Array.isArray(r.data) ? r.data : r.data.data,
    ),

  getUrl: (id: string, accion: ManualUrlAction): Promise<ManualUrlResponse> =>
    api.get<ManualUrlResponse>(`/biblioteca/${encodeURIComponent(id)}/url`, { params: { accion } }).then(r => r.data),

  // Requiere manuales.manage.
  getConfig: (): Promise<ManualesConfig> =>
    api.get<ManualesConfig>('/biblioteca/config').then(r => r.data),

  initUpload: (body: ManualUploadInitRequest): Promise<ManualUploadInitResponse> =>
    api.post<ManualUploadInitResponse>('/biblioteca/uploads', body).then(r => r.data),

  finalizeUpload: (uploadId: string): Promise<Manual> =>
    api.post<Manual>(`/biblioteca/uploads/${encodeURIComponent(uploadId)}/finalize`).then(r => r.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/biblioteca/${encodeURIComponent(id)}`).then(() => undefined),
}
