export type DirectoryType = 'developer' | 'arquitecto' | 'encargado' | 'contacto'

export interface DirectoryEntry {
  nombre:           string
  project_count:    number
  areas:            string[]
  ubicaciones:      string[]
  valor_total:      number
  valor_cerrado:    number
  emails:           string[]
  telefonos:        string[]
  ultima_actividad: string | null
}

export interface DirectoryStats {
  total_entries:  number
  total_projects: number
  total_valor:    number
  total_cerrado:  number
}

export interface DirectoryResponse {
  stats:   DirectoryStats
  entries: DirectoryEntry[]
}

// SCRUM-29 BUG-21/22: label fijo eliminado — resolver siempre vía
// t(`crm:directory.types.${type}`) en el componente.
