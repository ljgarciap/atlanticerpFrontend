import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { IcoMapPin, IcoClock } from '@/components/icons'
import type { HomeRouteVisit, HomeRutasDia } from '@/types/servicios'

interface Props {
  data: HomeRutasDia | undefined
}

// REQ-208 — botón Waze/Maps: abre la dirección en la app de navegación configurada en el
// dispositivo (RN5). Google Maps interpreta el mismo query universal en escritorio y móvil, y en
// iOS/Android con Waze instalado el sistema ofrece el selector de app — no hace falta detectar el
// dispositivo a mano.
function navigationUrl(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`
}

// REQ-208 — panel "Rutas del día" de Inicio. RN1: visible para todos los roles del módulo, sin
// gate propio (ver HomePage — no se filtra por rol). RN3: el color del técnico viene de
// `tecnico.color`, el MISMO campo persistido que usa Técnicos Internos — a propósito NO se reusa
// `TechnicianBadge` (usado en Tickets), que deriva su propio color por hash del id de usuario y
// por lo tanto puede divergir del color real del técnico (deuda preexistente de Batch 1, fuera de
// alcance de este batch, ver reporte).
export default function HomeRoutesPanel({ data }: Props) {
  const { t }    = useTranslation('servicios')
  const navigate = useNavigate()

  const visitas = data?.visitas ?? []

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('home.routes.title')}</h2>
        {data && data.has_more && (
          <button
            type="button"
            onClick={() => navigate('/servicios/tecnicos?view=agenda')}
            className="text-xs font-semibold text-primary hover:text-primary-dark"
          >
            {t('home.routes.seeFullAgenda')}
          </button>
        )}
      </div>

      {visitas.length === 0 ? (
        <p className="text-sm text-slate-400">{t('home.routes.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visitas.map(v => (
            <RouteRow key={v.ticket_id} visit={v} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function RouteRow({ visit }: { visit: HomeRouteVisit }) {
  const { t } = useTranslation('servicios')

  // SCRUM-271 (rebote QA 2026-08-13) — RN5/mockup piden "dirección con botón de navegación
  // (Waze/Maps) Y contacto en sitio" (nombre + teléfono). La fila solo mostraba el chip de
  // navegación y el nombre del contacto — la dirección en sí y el teléfono nunca se veían como
  // texto, aunque el payload ya los traía (`visit.direccion`/`visit.telefono`), obligando a abrir
  // Maps solo para leer la dirección. Se agrega una 2da línea con ambos.
  const contactoLine = [visit.contacto, visit.telefono].filter(Boolean).join(' · ')

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-slate-100 dark:border-slate-700 p-2.5">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
          <IcoClock size={12} />
          {visit.hora ?? '—'}
        </span>

        <span
          aria-hidden="true"
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: visit.tecnico.color }}
          title={visit.tecnico.nombre}
        />
        <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{visit.tecnico.nombre}</span>

        <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">
          {visit.cliente ?? '—'}
          <span className="text-slate-400 dark:text-slate-500"> · {t(`tickets.types.${visit.tipo}`)}</span>
        </span>

        {visit.direccion && (
          <a
            href={navigationUrl(visit.direccion)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark whitespace-nowrap"
          >
            <IcoMapPin size={12} />
            {t('home.routes.navigate')}
          </a>
        )}
      </div>

      {(visit.direccion || contactoLine) && (
        <div className="pl-[74px] flex flex-col gap-0.5">
          {visit.direccion && (
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{visit.direccion}</span>
          )}
          {contactoLine && (
            <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{contactoLine}</span>
          )}
        </div>
      )}
    </li>
  )
}
