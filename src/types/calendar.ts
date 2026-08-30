// SCRUM-66/177 — evento real de Outlook (Microsoft Graph), solo lectura. Compartido entre
// Ventas & Diseño (tarjeta "Mi calendario" en Inicio) y Compras (panel "Mi calendario"), ambos
// consumen el mismo endpoint backend (OutlookCalendarController).
export interface OutlookCalendarEvent {
  id:          string
  title:       string
  start_at:    string | null
  end_at:      string | null
  all_day:     boolean
  location:    string | null
  organizer:   string | null
  owner_email: string
  // SCRUM-368 — nombre resuelto por el backend a partir de owner_email (mismo dominio interno),
  // null si el email no corresponde a ningún User conocido. Solo se muestra en scope "team".
  owner_name:  string | null
}
