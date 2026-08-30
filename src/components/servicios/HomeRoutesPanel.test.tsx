import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import HomeRoutesPanel from './HomeRoutesPanel'
import type { HomeRutasDia } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function makeData(overrides: Partial<HomeRutasDia> = {}): HomeRutasDia {
  return {
    visitas:  [],
    has_more: false,
    total:    0,
    ...overrides,
  }
}

function renderPanel(data: HomeRutasDia | undefined) {
  return render(
    <MemoryRouter>
      <HomeRoutesPanel data={data} />
    </MemoryRouter>,
  )
}

// SCRUM-271 (rebote QA 2026-08-13) — la fila solo mostraba el chip de Waze/Maps y el nombre del
// contacto; la dirección en sí y el teléfono nunca aparecían como texto, aunque el payload ya los
// traía. Ver docblock de RouteRow en HomeRoutesPanel.tsx.
describe('HomeRoutesPanel — dirección y contacto visibles (SCRUM-271)', () => {
  it('muestra la dirección como texto y el contacto con teléfono, además del chip de navegación', () => {
    renderPanel(makeData({
      visitas: [{
        ticket_id:   1,
        numero:      'INS-2026-0005',
        hora:        '11:30',
        tipo:        'installation',
        cliente:     'Torres Pacífico',
        descripcion: null,
        direccion:   'Calle 74 Este, Torres Pacífico, Panamá',
        contacto:    'Adm. Karla Ruiz',
        telefono:    '+507 6234-5678',
        tecnico:     { id: 1, nombre: 'Pedro Santos', color: '#8B5CF6' },
      }],
      has_more: false,
      total:    1,
    }))

    expect(screen.getByText('Calle 74 Este, Torres Pacífico, Panamá')).toBeInTheDocument()
    expect(screen.getByText('Adm. Karla Ruiz · +507 6234-5678')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent('Calle 74 Este, Torres Pacífico, Panamá')),
    )
  })

  it('no rompe si falta dirección o teléfono', () => {
    renderPanel(makeData({
      visitas: [{
        ticket_id:   2,
        numero:      'INS-2026-0006',
        hora:        '09:00',
        tipo:        'warranty',
        cliente:     'Cliente sin dirección',
        descripcion: null,
        direccion:   null,
        contacto:    'Solo Contacto',
        telefono:    null,
        tecnico:     { id: 2, nombre: 'Carlos Vergara', color: '#3B82F6' },
      }],
      has_more: false,
      total:    1,
    }))

    expect(screen.getByText('Solo Contacto')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
