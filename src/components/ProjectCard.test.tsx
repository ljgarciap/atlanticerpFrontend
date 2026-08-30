import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProjectCard from './ProjectCard'
import type { Project } from '@/types/project'

// ── Mock react-i18next ────────────────────────────────────────────────────
const MESSAGES: Record<string, string> = {
  'crm:tipoBadge.diseno':     'Diseño',
  'crm:tipoBadge.cotizacion': 'Cotiz.',
  'crm:tipoBadge.ambos':      'D+C',
  'crm:freshness.recent':     'Reciente',
  'crm:freshness.stale':      'Estancado',
  'crm:freshness.cold':       'Frío',
  'crm:project.today':        'hoy',
  'crm:project.daysOverdue':  '{{days}}d vencido',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const template = MESSAGES[key] ?? (options?.defaultValue as string | undefined) ?? key
      return typeof options?.days === 'number' ? template.replace('{{days}}', String(options.days)) : template
    },
  }),
}))

// ── Factory ────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id:              1,
    nombre:          'Torre Vista Hermosa',
    contacto:        'Ana Martínez',
    email:           null,
    celular:         null,
    encargado:       null,
    developer:       null,
    arquitecto:      null,
    tipo:            'ambos',
    dialux:          false,
    area:            null,
    despacho:        null,
    ubicacion:       'Ciudad de Panamá',
    etapa:           'lead',
    fecha_entrega:   null,
    valor:           null,
    notas:           null,
    urgency:         'ok',
    freshness:       'recent',
    assignees:       [],
    latest_activity: null,
    created_by:      1,
    documents_count: 0,
    created_at:      '2026-06-01T00:00:00Z',
    updated_at:      '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

// ── Render básico ──────────────────────────────────────────────────────────

describe('ProjectCard — render básico', () => {
  it('muestra el nombre del proyecto', () => {
    render(<ProjectCard project={makeProject()} onClick={vi.fn()} />)
    expect(screen.getByText('Torre Vista Hermosa')).toBeInTheDocument()
  })

  it('muestra el contacto', () => {
    render(<ProjectCard project={makeProject()} onClick={vi.fn()} />)
    expect(screen.getByText('Ana Martínez')).toBeInTheDocument()
  })

  it('muestra la ubicación cuando existe', () => {
    render(<ProjectCard project={makeProject({ ubicacion: 'Miraflores' })} onClick={vi.fn()} />)
    expect(screen.getByText(/Miraflores/)).toBeInTheDocument()
  })

  it('muestra "—" cuando no hay contacto', () => {
    render(<ProjectCard project={makeProject({ contacto: null })} onClick={vi.fn()} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('llama a onClick al hacer clic', () => {
    const handleClick = vi.fn()
    const project = makeProject()
    render(<ProjectCard project={project} onClick={handleClick} />)
    fireEvent.click(screen.getByText('Torre Vista Hermosa'))
    expect(handleClick).toHaveBeenCalledWith(project)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

// ── Badges de tipo ─────────────────────────────────────────────────────────

describe('ProjectCard — tipo badge', () => {
  it('muestra D+C para tipo ambos', () => {
    render(<ProjectCard project={makeProject({ tipo: 'ambos' })} onClick={vi.fn()} />)
    expect(screen.getByText('D+C')).toBeInTheDocument()
  })

  it('muestra Diseño para tipo diseno', () => {
    render(<ProjectCard project={makeProject({ tipo: 'diseno' })} onClick={vi.fn()} />)
    expect(screen.getByText('Diseño')).toBeInTheDocument()
  })

  it('muestra Cotiz. para tipo cotizacion', () => {
    render(<ProjectCard project={makeProject({ tipo: 'cotizacion' })} onClick={vi.fn()} />)
    expect(screen.getByText('Cotiz.')).toBeInTheDocument()
  })
})

// ── Badge DIALux ───────────────────────────────────────────────────────────

describe('ProjectCard — DIALux', () => {
  it('muestra el badge DIALux cuando dialux=true', () => {
    render(<ProjectCard project={makeProject({ dialux: true })} onClick={vi.fn()} />)
    expect(screen.getByText('DIALux')).toBeInTheDocument()
  })

  it('no muestra el badge DIALux cuando dialux=false', () => {
    render(<ProjectCard project={makeProject({ dialux: false })} onClick={vi.fn()} />)
    expect(screen.queryByText('DIALux')).not.toBeInTheDocument()
  })
})

// ── Badge de frescura ──────────────────────────────────────────────────────

describe('ProjectCard — freshness badge', () => {
  it('muestra Reciente para freshness=recent', () => {
    render(<ProjectCard project={makeProject({ freshness: 'recent' })} onClick={vi.fn()} />)
    expect(screen.getByText(/Reciente/)).toBeInTheDocument()
  })

  it('muestra Estancado para freshness=stale', () => {
    render(<ProjectCard project={makeProject({ freshness: 'stale' })} onClick={vi.fn()} />)
    expect(screen.getByText(/Estancado/)).toBeInTheDocument()
  })

  it('muestra Frío para freshness=cold', () => {
    render(<ProjectCard project={makeProject({ freshness: 'cold' })} onClick={vi.fn()} />)
    expect(screen.getByText(/Frío/)).toBeInTheDocument()
  })
})

// ── Urgency dot ───────────────────────────────────────────────────────────

describe('ProjectCard — urgency dot', () => {
  it('muestra dot rojo pulsante para urgency=vencido', () => {
    const { container } = render(
      <ProjectCard project={makeProject({ urgency: 'vencido' })} onClick={vi.fn()} />
    )
    // Red pulsing dot has animate-pulse and bg-red-500
    const dot = container.querySelector('.bg-red-500.animate-pulse')
    expect(dot).toBeInTheDocument()
  })

  it('muestra dot ámbar para urgency=proximo', () => {
    const { container } = render(
      <ProjectCard project={makeProject({ urgency: 'proximo' })} onClick={vi.fn()} />
    )
    const dot = container.querySelector('.bg-amber-400')
    expect(dot).toBeInTheDocument()
  })

  it('no muestra ningún dot para urgency=ok', () => {
    const { container } = render(
      <ProjectCard project={makeProject({ urgency: 'ok' })} onClick={vi.fn()} />
    )
    expect(container.querySelector('.bg-red-500')).not.toBeInTheDocument()
    expect(container.querySelector('.bg-amber-400')).not.toBeInTheDocument()
  })
})

// Builds a YYYY-MM-DD string from a local Date (avoids UTC offset issues)
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Fecha de entrega ───────────────────────────────────────────────────────

describe('ProjectCard — fecha_entrega countdown', () => {
  it('muestra countdown positivo cuando queda más de 3 días', () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)

    render(<ProjectCard project={makeProject({ fecha_entrega: localDate(future) })} onClick={vi.fn()} />)
    expect(screen.getByText('10d')).toBeInTheDocument()
  })

  it('muestra "hoy" cuando la fecha es hoy', () => {
    render(<ProjectCard project={makeProject({ fecha_entrega: localDate(new Date()) })} onClick={vi.fn()} />)
    expect(screen.getByText('hoy')).toBeInTheDocument()
  })

  it('muestra "Nd vencido" para fechas pasadas', () => {
    const past = new Date()
    past.setDate(past.getDate() - 5)

    render(<ProjectCard project={makeProject({ fecha_entrega: localDate(past) })} onClick={vi.fn()} />)
    expect(screen.getByText('5d vencido')).toBeInTheDocument()
  })

  it('no muestra countdown cuando no hay fecha_entrega', () => {
    render(<ProjectCard project={makeProject({ fecha_entrega: null })} onClick={vi.fn()} />)
    expect(screen.queryByText(/vencido/)).not.toBeInTheDocument()
    expect(screen.queryByText('hoy')).not.toBeInTheDocument()
  })
})

// ── Valor ─────────────────────────────────────────────────────────────────

describe('ProjectCard — valor', () => {
  it('muestra el valor formateado cuando existe', () => {
    render(<ProjectCard project={makeProject({ valor: 50000 })} onClick={vi.fn()} />)
    expect(screen.getByText('$50,000')).toBeInTheDocument()
  })

  it('no muestra valor cuando es null', () => {
    render(<ProjectCard project={makeProject({ valor: null })} onClick={vi.fn()} />)
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
  })
})
