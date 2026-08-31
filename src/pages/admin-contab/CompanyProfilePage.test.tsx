import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import CompanyProfilePage from './CompanyProfilePage'
import { adminContabApi } from '@/api/adminContabApi'
import type { CompanyProfile, Location, Contact } from '@/types/adminContab'

// Batch Datos de la Empresa (SCRUM-638→642, REQ-561→565). Cubre: modo edición bloquea/desbloquea
// campos (REQ-561), razón social/nombre comercial/moneda/año fiscal nunca editables (RN3 REQ-561,
// RN1 REQ-565), gate de 403 → "acceso restringido", el select de tipo al crear ubicación no ofrece
// Bodega/Showroom (RN1 REQ-563), ubicaciones no editables sin acción de desactivar, zona horaria
// exige selección.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    companyProfile: { get: vi.fn(), update: vi.fn(), uploadLogo: vi.fn() },
    locations: { list: vi.fn(), create: vi.fn(), setActive: vi.fn() },
    contacts: { list: vi.fn(), create: vi.fn(), setActive: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeProfile(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    razon_social: 'Atlantic S.A.',
    nombre_comercial: 'Atlantic',
    logo_url: null,
    descripcion_corta: 'Diseño e iluminación',
    sitio_web: 'https://atlantic.com.pa',
    redes_sociales: [],
    moneda: 'USD',
    anio_fiscal: 'Enero-Diciembre',
    zona_horaria: 'America/Panama',
    ...overrides,
  }
}

function makeLocations(): Location[] {
  return [
    { id: 1, nombre: 'Bodega Central', tipo: 'Bodega', direccion: null, activa: true, editable: false, source: 'bodega' },
    { id: 8, nombre: 'Oficina Administrativa', tipo: 'Oficina', direccion: 'Panamá', activa: true, editable: true, source: 'admin_contab' },
  ]
}

function makeContacts(): Contact[] {
  return [
    { id: 1, area: 'Facturación', email: 'facturacion@atlantic.com.pa', telefono: '+507 000-0000', activo: true },
  ]
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CompanyProfilePage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.companyProfile.get.mockResolvedValue(makeProfile())
  mockedApi.locations.list.mockResolvedValue(makeLocations())
  mockedApi.contacts.list.mockResolvedValue(makeContacts())
})

describe('CompanyProfilePage', () => {
  it('carga en modo solo lectura por defecto: campos deshabilitados y sin botón Guardar', async () => {
    renderPage()

    const sitioWeb = await screen.findByDisplayValue('https://atlantic.com.pa')
    expect(sitioWeb).toBeDisabled()
    expect(screen.queryByText('adminContab:empresa.saveChanges')).not.toBeInTheDocument()
    expect(screen.getByText('common:actions.edit')).toBeInTheDocument()
  })

  it('al presionar Editar se desbloquean los campos editables y cambia a modo edición', async () => {
    renderPage()
    await screen.findByDisplayValue('https://atlantic.com.pa')

    fireEvent.click(screen.getByText('common:actions.edit'))

    expect(screen.getByDisplayValue('https://atlantic.com.pa')).not.toBeDisabled()
    expect(await screen.findByText('adminContab:empresa.saveChanges')).toBeInTheDocument()
  })

  it('razón social, nombre comercial, moneda y año fiscal nunca se habilitan, ni en modo edición', async () => {
    renderPage()
    await screen.findByDisplayValue('https://atlantic.com.pa')

    fireEvent.click(screen.getByText('common:actions.edit'))

    expect(screen.getByDisplayValue('Atlantic S.A.')).toBeDisabled()
    expect(screen.getByDisplayValue('Atlantic')).toBeDisabled()
    expect(screen.getByDisplayValue('USD')).toBeDisabled()
    expect(screen.getByDisplayValue('Enero-Diciembre')).toBeDisabled()
  })

  it('Guardar cambios pide confirmación explícita antes de aplicar', async () => {
    mockedApi.companyProfile.update.mockResolvedValue(makeProfile({ descripcion_corta: 'Nueva descripción' }))
    renderPage()
    await screen.findByDisplayValue('https://atlantic.com.pa')

    fireEvent.click(screen.getByText('common:actions.edit'))
    fireEvent.click(await screen.findByText('adminContab:empresa.saveChanges'))

    expect(await screen.findByText('adminContab:empresa.confirmSave')).toBeInTheDocument()
    expect(mockedApi.companyProfile.update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('common:actions.confirm'))

    await waitFor(() => expect(mockedApi.companyProfile.update).toHaveBeenCalled())
  })

  it('gate de 403: muestra "acceso restringido" en vez del formulario', async () => {
    const forbidden = new AxiosError('Forbidden', '403', undefined, undefined, {
      status: 403, statusText: 'Forbidden', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() },
      data: { message: 'Esta pantalla es exclusiva del aprobador configurado.' },
    })
    mockedApi.companyProfile.get.mockRejectedValue(forbidden)

    renderPage()

    expect(await screen.findByText('adminContab:empresa.restricted.title')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:empresa.title')).not.toBeInTheDocument()
  })

  it('el formulario de alta de ubicación solo ofrece Oficina/Otra, nunca Bodega/Showroom', async () => {
    renderPage()
    await screen.findByDisplayValue('https://atlantic.com.pa')
    fireEvent.click(screen.getByText('common:actions.edit'))

    fireEvent.click(await screen.findByText('adminContab:empresa.ubicaciones.addButton'))

    const options = screen.getAllByRole('option').map(o => (o as HTMLOptionElement).value)
    const tipoOptions = options.filter(v => v === 'oficina' || v === 'otra' || v === 'Bodega' || v === 'Showroom')
    expect(tipoOptions).toEqual(['oficina', 'otra'])
  })

  it('una ubicación no editable (sourced de Bodega) no muestra acción de desactivar, ni en modo edición', async () => {
    renderPage()
    await screen.findByDisplayValue('https://atlantic.com.pa')
    fireEvent.click(screen.getByText('common:actions.edit'))

    await screen.findByText('Bodega Central')
    // Solo la ubicación editable (Oficina Administrativa) puede tener toggle — la de Bodega, no.
    const toggles = screen.getAllByRole('switch', { name: 'adminContab:empresa.ubicaciones.fields.estado' })
    expect(toggles).toHaveLength(1)
  })

  it('ubicaciones de distinto origen con el mismo id numérico se renderizan como filas distintas y el toggle afecta la correcta', async () => {
    mockedApi.locations.list.mockResolvedValue([
      { id: 1, nombre: 'Bodega Central', tipo: 'Bodega', direccion: null, activa: true, editable: false, source: 'bodega' },
      { id: 1, nombre: 'Oficina Administrativa', tipo: 'Oficina', direccion: 'Panamá', activa: true, editable: true, source: 'admin_contab' },
    ])
    renderPage()
    await screen.findByDisplayValue('https://atlantic.com.pa')
    fireEvent.click(screen.getByText('common:actions.edit'))

    await screen.findByText('Bodega Central')
    await screen.findByText('Oficina Administrativa')

    // Solo la fila editable (Oficina Administrativa, id=1 admin_contab) tiene toggle, pese a
    // compartir id numérico con Bodega Central (id=1 bodega) — regresión del hallazgo de
    // Senior Review/Pre-QA 2026-08-19 (key={loc.id} sin distinguir `source`).
    const toggles = screen.getAllByRole('switch', { name: 'adminContab:empresa.ubicaciones.fields.estado' })
    expect(toggles).toHaveLength(1)
    fireEvent.click(toggles[0])

    await waitFor(() => expect(mockedApi.locations.setActive).toHaveBeenCalledWith(1, false))
  })

  it('crea una ubicación nueva con nombre/tipo/dirección', async () => {
    mockedApi.locations.create.mockResolvedValue({
      id: 9, nombre: 'Oficina Norte', tipo: 'Oficina', direccion: 'Panamá', activa: true, editable: true, source: 'admin_contab',
    })
    renderPage()
    await screen.findByDisplayValue('https://atlantic.com.pa')
    fireEvent.click(screen.getByText('common:actions.edit'))

    fireEvent.click(await screen.findByText('adminContab:empresa.ubicaciones.addButton'))
    fireEvent.change(screen.getByLabelText('adminContab:empresa.ubicaciones.fields.nombre'), { target: { value: 'Oficina Norte' } })
    fireEvent.change(screen.getByLabelText('adminContab:empresa.ubicaciones.fields.direccion'), { target: { value: 'Panamá' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.locations.create).toHaveBeenCalledWith({
      nombre: 'Oficina Norte', tipo: 'oficina', direccion: 'Panamá',
    }))
  })

  it('crea un contacto nuevo con área/email/teléfono', async () => {
    mockedApi.contacts.create.mockResolvedValue({
      id: 2, area: 'Soporte', email: 'soporte@atlantic.com.pa', telefono: '+507 111-1111', activo: true,
    })
    renderPage()
    await screen.findByDisplayValue('https://atlantic.com.pa')
    fireEvent.click(screen.getByText('common:actions.edit'))

    fireEvent.click(await screen.findByText('adminContab:empresa.contactos.addButton'))
    fireEvent.change(screen.getByLabelText('adminContab:empresa.contactos.fields.area'), { target: { value: 'Soporte' } })
    fireEvent.change(screen.getByLabelText('adminContab:empresa.contactos.fields.email'), { target: { value: 'soporte@atlantic.com.pa' } })
    fireEvent.change(screen.getByLabelText('adminContab:empresa.contactos.fields.telefono'), { target: { value: '+507 111-1111' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.contacts.create).toHaveBeenCalledWith({
      area: 'Soporte', email: 'soporte@atlantic.com.pa', telefono: '+507 111-1111',
    }))
  })

  it('zona horaria exige una selección para guardar', async () => {
    renderPage()
    await screen.findByDisplayValue('https://atlantic.com.pa')
    fireEvent.click(screen.getByText('common:actions.edit'))

    const zonaHorariaSelect = screen.getByLabelText('adminContab:empresa.regional.fields.zonaHoraria') as HTMLSelectElement
    expect(zonaHorariaSelect.value).toBe('America/Panama')
    expect(zonaHorariaSelect).not.toBeDisabled()
  })
})
