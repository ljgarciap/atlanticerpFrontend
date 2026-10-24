export type Etapa = 'lead' | 'diseno' | 'cotizacion' | 'propuesta' | 'cerrado' | 'perdido'
export type TipoSolicitud = 'diseno' | 'cotizacion' | 'ambos'
export type TipoActividad = 'llamada' | 'email' | 'reunion' | 'whatsapp' | 'visita' | 'otro'
export type Urgency  = 'ok' | 'proximo' | 'vencido'
export type Freshness = 'recent' | 'stale' | 'cold'

// El `value` es el dato real guardado en BD (no se traduce, se usa para filtrar/enviar
// al backend); `key` resuelve la etiqueta visible vía t(`crm:areas.${key}`).
export const AREA_OPTS: { value: string; key: string }[] = [
  { value: 'Residencial',      key: 'residencial' },
  { value: 'Comercial',        key: 'comercial' },
  { value: 'Corporativo',      key: 'corporativo' },
  { value: 'Hotelero',         key: 'hotelero' },
  { value: 'Industrial',       key: 'industrial' },
  { value: 'Educativo',        key: 'educativo' },
  { value: 'Salud',            key: 'salud' },
  { value: 'Restaurante',      key: 'restaurante' },
  { value: 'Retail',           key: 'retail' },
  { value: 'Espacio Público',  key: 'espacioPublico' },
  { value: 'Otro',             key: 'otro' },
]

export interface Assignee {
  id:         number
  first_name: string
  last_name:  string
}

export interface LatestActivity {
  tipo:  TipoActividad
  fecha: string
  notas: string | null
}

export interface Activity {
  id:          number
  project_id:  number
  tipo:        TipoActividad
  fecha:       string
  notas:       string | null
  siguiente:   string | null
  user:        Assignee
  created_at:  string
}

export interface Reminder {
  id:          number
  project_id:  number
  tipo:        string
  fecha:       string   // YYYY-MM-DD
  nota:        string | null
  completado:  boolean
  created_at:  string
}

export interface DashboardReminder {
  id:             number
  project_id:     number
  project_name:   string
  project_etapa:  Etapa
  tipo:           string
  fecha:          string
  nota:           string | null
}

export type DocumentCategoria =
  | 'cotizacion' | 'diseno' | 'presentacion' | 'plano'
  | 'render' | 'ficha' | 'modelo_3d' | 'otro'

export interface Document {
  id:             number
  project_id:     number
  categoria:      DocumentCategoria
  nombre_archivo: string
  size_bytes:     number
  mime_type:      string
  storage_zone:   'private' | 'public'
  is_current:     boolean
  version:        number
  uploader:       { id: number; first_name: string; last_name: string }
  created_at:     string
}

export interface DocumentVersion extends Document {
  parent_document_id: number | null
}

// El token real solo existe una vez, en la respuesta de creación — a partir de ahí
// solo se persiste su hash, así que un ShareLink ya listado nunca vuelve a exponer
// url/token (ver ShareLink::createFor() en el backend).
export interface ShareLink {
  id:                 number
  expires_at:         string
  revoked_at:         string | null
  access_count:       number
  last_accessed_at:   string | null
  created_by:         { id: number; first_name: string; last_name: string }
  created_at:         string
}

export interface CreatedShareLink extends ShareLink {
  url: string
}

export interface Project {
  id:              number
  nombre:          string
  contacto:        string | null
  email:           string | null
  celular:         string | null
  encargado:       string | null
  developer:       string | null
  arquitecto:      string | null
  tipo:            TipoSolicitud
  dialux:          boolean
  area:            string | null
  despacho:        string | null
  ubicacion:       string | null
  etapa:           Etapa
  fecha_entrega:   string | null
  valor:           number | null
  notas:           string | null
  urgency:         Urgency
  freshness:       Freshness
  assignees:        Assignee[]
  latest_activity:  LatestActivity | null
  reminders?:       Reminder[]   // present in detail view (show endpoint)
  documents_count:  number
  created_by:       number | null
  created_at:      string
  updated_at:      string
}

export interface PaginatedProjects {
  data: Project[]
  meta: {
    total:        number
    per_page:     number
    current_page: number
    last_page:    number
  }
}

export interface AlertProject {
  id:            number
  nombre:        string
  contacto:      string | null
  etapa:         Etapa
  fecha_entrega: string | null
  dias:          number | null
  assignees:     { name: string; email: string | null }[]
}

export interface AlertColdProject {
  id:     number
  nombre: string
}

export interface KpiData {
  counts_by_stage:          Record<Etapa, number>
  counts_by_tipo:           Record<TipoSolicitud, number>
  pipeline_activo:          number
  pipeline_cerrado:         number
  alerts_vencidos:          number
  alerts_proximos:          number
  alerts_frios:             number
  alerts_vencidos_projects: AlertProject[]
  alerts_proximos_projects: AlertProject[]
  alerts_frios_projects:    AlertColdProject[]
  management_emails:        string[]
}

// SCRUM-29 BUG-15/16/17/19/20: `label` se eliminó a propósito — resolver siempre
// vía t(`crm:stages.${id}`) en el componente, nunca un string fijo aquí.
export const STAGES: { id: Etapa; color: string }[] = [
  { id: 'lead',       color: '#eab308' },
  { id: 'diseno',     color: '#3b82f6' },
  { id: 'cotizacion', color: '#a855f7' },
  { id: 'propuesta',  color: '#f97316' },
  { id: 'cerrado',    color: '#16a34a' },
  { id: 'perdido',    color: '#64748b' },
]

// Idem — resolver label vía t(`crm:activityTypes.${tipo}`).
// `icon` referencia el nombre de un componente de '@/components/icons' (no un glyph
// literal) — se resuelve en el componente que lo consume, ver ACTIVITY_ICONS ahí.
export const ACTIVITY_META: Record<TipoActividad, { color: string; icon: string }> = {
  llamada:  { color: '#3b82f6', icon: 'IcoPhone' },
  email:    { color: '#a855f7', icon: 'IcoMail' },
  reunion:  { color: '#16a34a', icon: 'IcoCalendar' },
  whatsapp: { color: '#22c55e', icon: 'IcoChat' },
  visita:   { color: '#f59e0b', icon: 'IcoMapPin' },
  otro:     { color: '#64748b', icon: 'IcoClock' },
}

/** SCRUM-944/945 — umbrales de días configurables de CRM, ver `App\Modules\CRM\Services\CrmSettingsService`. */
export interface CrmSettings {
  /** Días hacia adelante desde hoy para "entrega próxima" (Dashboard + filtro urgency=proximo). */
  entrega_proxima_dias: number
  /** Días hacia atrás de actividad para que un proyecto cuente como "reciente" (filtro freshness=recent). */
  freshness_recent_dias: number
  /** Días sin actividad a partir de los cuales un proyecto cuenta como "frío"/stale. */
  freshness_stale_dias: number
  /** SCRUM-998 — máximo de productos para un PDF de Catálogo plano y síncrono; por encima se genera un ZIP de volúmenes en segundo plano. */
  catalog_pdf_max_single_products: number
  /** SCRUM-998 — máximo de productos CON foto para un PDF plano; por encima se genera el ZIP en segundo plano (cada foto remota es una descarga). */
  catalog_pdf_max_single_photos: number
  /** SCRUM-998 — productos por volumen (un PDF por tanda) del ZIP en segundo plano. */
  catalog_pdf_volume_size: number
  /** SCRUM-998 — días que se conserva el ZIP generado antes de borrarlo. */
  catalog_pdf_export_retention_days: number
}
