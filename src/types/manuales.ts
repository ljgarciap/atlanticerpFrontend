// SCRUM-984 — Manuales de usuario (biblioteca PDF/video en el bucket S3 compartido).
// Contrato API fijado en docs/architecture/manuales-usuario-tareas-scrum984.md (atlanticerp-backend).

export type ManualModule =
  | 'crm'
  | 'ventas_diseno'
  | 'compras'
  | 'bodega'
  | 'servicios'
  | 'admin_contabilidad'
  | 'gerencia'

export type ManualType = 'pdf' | 'video'

export interface Manual {
  id:         string
  name:       string
  module:     ManualModule
  type:       ManualType
  size_bytes: number
  created_at: string
}

export interface ManualUrlResponse {
  url:        string
  expires_at: string
}

export type ManualUrlAction = 'ver' | 'descargar'

/** Límites de subida — vienen de auth.system_settings vía backend, nunca hardcodeados en el front. */
export interface ManualesConfig {
  max_pdf_bytes:      number
  max_video_bytes:    number
  allowed_extensions: string[]
  modules:            ManualModule[]
}

export interface ManualUploadInitRequest {
  module:     ManualModule
  name:       string
  filename:   string
  // El backend valida `content_type` (BibliotecaController::initUpload); `mime` daba 422 en toda subida.
  content_type: string
  size_bytes: number
}

export interface ManualUploadInitResponse {
  upload_id:  string
  url:        string
  headers:    Record<string, string>
  expires_at?: string
}
