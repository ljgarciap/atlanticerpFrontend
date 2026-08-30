export interface MonthlyKpis {
  leads_nuevos:  number
  valor_nuevos:  number
  cerrados:      number
  valor_cerrado: number
  perdidos:      number
  valor_perdido: number
  tasa_cierre:   number
  actividades:   number
  documentos:    number
}

export interface ActivityBreakdown {
  llamada:  number
  email:    number
  reunion:  number
  whatsapp: number
  visita:   number
  otro:     number
}

export interface TeamMemberMonthly {
  user_id:       number
  first_name:    string
  last_name:     string
  leads_nuevos:  number
  cerrados:      number
  perdidos:      number
  tasa_cierre:   number
  actividades:   number
  documentos:    number
  valor_cerrado: number
  valor_nuevos:  number
}

export interface NuevoProject {
  id:         number
  created_at: string
  nombre:     string
  contacto:   string | null
  tipo:       string
  ubicacion:  string | null
  etapa:      string
  valor:      number
  assignees:  { id: number; first_name: string; last_name: string }[]
}

export interface BitacoraEntry {
  id:                number
  fecha:             string
  tipo:              string
  user_id:           number
  user_name:         string
  project_id:        number
  project_nombre:    string
  project_contacto:  string | null
  notas:             string | null
}

export interface MonthlyReport {
  month:                 string
  month_label:           string
  user_title:            string
  kpis:                  MonthlyKpis
  actividades_por_tipo:  ActivityBreakdown
  team_breakdown:        TeamMemberMonthly[]
  proyectos_nuevos:      NuevoProject[]
  bitacora:              BitacoraEntry[]
}

export interface TeamMember {
  user_id:       number
  first_name:    string
  last_name:     string
  email:         string
  counts: {
    lead:        number
    diseno:      number
    cotizacion:  number
    propuesta:   number
    cerrado:     number
    perdido:     number
  }
  valor_activo:  number
  valor_cerrado: number
  vencidos:      number
}
