import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ClientesFiscalPage from './ClientesFiscalPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { adminContabApi } from '@/api/adminContabApi'
import type { FiscalDirectoryResult } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

let permisos: string[] = []
vi.mock('@/hooks/usePermission', () => ({ usePermission: (p: string) => permisos.includes(p) }))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: { clients: { fiscalDirectory: vi.fn(), validateTaxId: vi.fn(), updateSubClientTaxData: vi.fn() } },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: { clientesFiscal: { setItbmsExemption: vi.fn() } },
}))

const api = vi.mocked(ventasDisenoApi.clients)
const exencionApi = vi.mocked(adminContabApi.clientesFiscal)
const K = 'adminContab:clientesFiscal'

const RESULTADO: FiscalDirectoryResult = {
  data: [
    { id: 1, master_client_id: 10, master_client_name: 'Grupo Delta', business_name: 'Delta Libre S.A.', receptor_tipo: '01', tax_id: '155-1', tax_id_dv: '81', bloqueado: false, itbms_exento: false, itbms_exencion_documento: null },
    { id: 2, master_client_id: 11, master_client_name: 'Grupo Sigma', business_name: 'Sigma Certificada S.A.', receptor_tipo: '01', tax_id: '155-2', tax_id_dv: null, bloqueado: true, itbms_exento: true, itbms_exencion_documento: 'Resolución 201-1234' },
  ],
  meta: { total: 2, per_page: 20, current_page: 1, last_page: 1 },
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ClientesFiscalPage /></QueryClientProvider>)
}

beforeEach(() => { vi.clearAllMocks(); permisos = ['ventas_diseno.edit.client_tax_data']; api.fiscalDirectory.mockResolvedValue(RESULTADO) })
afterEach(() => { vi.useRealTimers() })

describe('ClientesFiscalPage (SCRUM-1002)', () => {
  it('lista los subclientes y deshabilita la edición de los bloqueados, explicando por qué', async () => {
    renderPage()

    expect(await screen.findByText('Delta Libre S.A.')).toBeInTheDocument()
    expect(screen.getAllByText(`${K}.editar`)).toHaveLength(1) // solo el libre tiene botón
    expect(screen.getByText(`${K}.bloqueado`)).toHaveAttribute('title', `${K}.bloqueadoAyuda`)
    expect(screen.getByText('—')).toBeInTheDocument() // DV nulo
  })

  it('un Consumidor Final se muestra como tal, sin RUC ni DV', async () => {
    api.fiscalDirectory.mockResolvedValue({
      data: [{ id: 3, master_client_id: 12, master_client_name: 'Mostrador', business_name: 'Juan Pérez', receptor_tipo: '02', tax_id: '', tax_id_dv: null, bloqueado: false, itbms_exento: false, itbms_exencion_documento: null }],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:clients.receptorTipo.consumidorFinal')).toBeInTheDocument()
  })

  it('abre el modal de edición del subcliente elegido', async () => {
    renderPage()
    await screen.findByText('Delta Libre S.A.')

    fireEvent.click(screen.getByText(`${K}.editar`))

    expect(await screen.findByText('ventasDiseno:clients.editTaxData.title')).toBeInTheDocument()
    expect(screen.getByLabelText(/createModal.taxId \*/)).toHaveValue('155-1')
  })

  it('la búsqueda se envía al backend con debounce, sin consultar en cada tecla', async () => {
    renderPage()
    await screen.findByText('Delta Libre S.A.')
    api.fiscalDirectory.mockClear()

    const caja = screen.getByRole('searchbox')
    fireEvent.change(caja, { target: { value: 'd' } })
    fireEvent.change(caja, { target: { value: 'de' } })
    fireEvent.change(caja, { target: { value: 'delta' } })

    await waitFor(() => expect(api.fiscalDirectory).toHaveBeenCalledWith(expect.objectContaining({ search: 'delta', page: 1 })))
    expect(api.fiscalDirectory).toHaveBeenCalledTimes(1)
  })

  it('sin el permiso de edición muestra el acceso restringido y NO consulta el directorio', () => {
    permisos = ['ventas_diseno.read']
    renderPage()

    expect(screen.getByText(`${K}.sinPermiso`)).toBeInTheDocument()
    expect(api.fiscalDirectory).not.toHaveBeenCalled()
  })

  it('quien edita en Ventas & Diseño (ventas_diseno.edit) también accede', async () => {
    permisos = ['ventas_diseno.edit']
    renderPage()
    expect(await screen.findByText('Delta Libre S.A.')).toBeInTheDocument()
  })

  it('muestra el estado vacío y el error de carga', async () => {
    api.fiscalDirectory.mockResolvedValueOnce({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } })
    const { unmount } = renderPage()
    expect(await screen.findByText(`${K}.vacio`)).toBeInTheDocument()
    unmount()

    api.fiscalDirectory.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    expect(await screen.findByText(`${K}.error`)).toBeInTheDocument()
  })
})

// SCRUM-1166 — clientes exentos de ITBMS: lo marca solo Administración (permiso angosto), con el documento que lo respalda.
describe('ClientesFiscalPage — exención de ITBMS (SCRUM-1166)', () => {
  const E = `${K}.exencion`

  it('muestra quién es exento y el documento que lo respalda', async () => {
    permisos = ['ventas_diseno.edit.client_tax_data']
    renderPage()

    await screen.findByText('Delta Libre S.A.')
    expect(screen.getByTestId('chip-exento-2')).toHaveAttribute('title', 'Resolución 201-1234')
    expect(screen.queryByTestId('chip-exento-1')).not.toBeInTheDocument()
  })

  it('quien solo tiene el permiso de exención entra al listado, ve las acciones de exención y no las de editar', async () => {
    permisos = ['admin_contab.edit.client_itbms_exemption']
    renderPage()

    expect(await screen.findByText('Delta Libre S.A.')).toBeInTheDocument()
    expect(screen.getByTestId('exencion-1')).toHaveTextContent(`${E}.marcarAccion`)
    expect(screen.getByTestId('exencion-2')).toHaveTextContent(`${E}.quitarAccion`)
    expect(screen.queryByText(`${K}.editar`)).not.toBeInTheDocument()
    expect(screen.queryByText(`${K}.bloqueado`)).not.toBeInTheDocument()
  })

  it('quien solo edita datos fiscales no ve las acciones de exención', async () => {
    permisos = ['ventas_diseno.edit.client_tax_data']
    renderPage()

    await screen.findByText('Delta Libre S.A.')
    expect(screen.queryByTestId('exencion-1')).not.toBeInTheDocument()
  })

  it('un cliente con facturas (bloqueado para editar sus datos) igual se puede marcar exento', async () => {
    permisos = ['ventas_diseno.edit.client_tax_data', 'admin_contab.edit.client_itbms_exemption']
    renderPage()

    await screen.findByText('Sigma Certificada S.A.')
    expect(screen.getByText(`${K}.bloqueado`)).toBeInTheDocument()
    expect(screen.getByTestId('exencion-2')).toBeEnabled()
  })

  it('marcar exige el documento y lo manda al servidor', async () => {
    permisos = ['admin_contab.edit.client_itbms_exemption']
    exencionApi.setItbmsExemption.mockResolvedValue({ id: 1, itbms_exento: true, itbms_exencion_documento: 'Ley 8 de 2010', itbms_exento_at: null, borradores_actualizados: 2, confirmadas_sin_facturar: 0 })
    renderPage()

    fireEvent.click(await screen.findByTestId('exencion-1'))
    const marcar = screen.getByText(`${E}.marcar`)
    expect(marcar).toBeDisabled()   // sin documento no se puede

    fireEvent.change(screen.getByLabelText(`${E}.documento`), { target: { value: '  Ley 8 de 2010 ' } })
    expect(marcar).not.toBeDisabled()
    fireEvent.click(marcar)

    await waitFor(() => expect(exencionApi.setItbmsExemption).toHaveBeenCalledWith(1, { exento: true, documento: 'Ley 8 de 2010' }))
    expect(await screen.findByTestId('exencion-resultado')).toHaveTextContent(`${E}.marcada`)
    expect(screen.getByTestId('exencion-resultado')).toHaveTextContent(`${E}.borradores`)
  })

  it('avisa cuántas cotizaciones confirmadas sin facturar conservan su ITBMS, y no avisa si no hay ninguna', async () => {
    permisos = ['admin_contab.edit.client_itbms_exemption']
    exencionApi.setItbmsExemption.mockResolvedValueOnce({ id: 1, itbms_exento: true, itbms_exencion_documento: 'Resolución 1', itbms_exento_at: null, borradores_actualizados: 0, confirmadas_sin_facturar: 2 })
    const { unmount } = renderPage()

    fireEvent.click(await screen.findByTestId('exencion-1'))
    fireEvent.change(screen.getByLabelText(`${E}.documento`), { target: { value: 'Resolución 1' } })
    fireEvent.click(screen.getByText(`${E}.marcar`))
    expect(await screen.findByTestId('exencion-aviso-confirmadas')).toHaveTextContent(`${E}.avisoConfirmadas`)
    unmount()

    exencionApi.setItbmsExemption.mockResolvedValueOnce({ id: 1, itbms_exento: true, itbms_exencion_documento: 'Resolución 1', itbms_exento_at: null, borradores_actualizados: 0, confirmadas_sin_facturar: 0 })
    renderPage()
    fireEvent.click(await screen.findByTestId('exencion-1'))
    fireEvent.change(screen.getByLabelText(`${E}.documento`), { target: { value: 'Resolución 1' } })
    fireEvent.click(screen.getByText(`${E}.marcar`))
    await screen.findByTestId('exencion-resultado')
    expect(screen.queryByTestId('exencion-aviso-confirmadas')).not.toBeInTheDocument()
  })

  it('quitar la exención no pide documento y manda exento: false', async () => {
    permisos = ['admin_contab.edit.client_itbms_exemption']
    exencionApi.setItbmsExemption.mockResolvedValue({ id: 2, itbms_exento: false, itbms_exencion_documento: null, itbms_exento_at: null, borradores_actualizados: 0, confirmadas_sin_facturar: 0 })
    renderPage()

    fireEvent.click(await screen.findByTestId('exencion-2'))
    expect(screen.queryByLabelText(`${E}.documento`)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(`${E}.quitar`))

    await waitFor(() => expect(exencionApi.setItbmsExemption).toHaveBeenCalledWith(2, { exento: false }))
    expect(await screen.findByTestId('exencion-resultado')).toHaveTextContent(`${E}.quitada`)
  })

  it('muestra el mensaje del servidor si no se pudo guardar', async () => {
    permisos = ['admin_contab.edit.client_itbms_exemption']
    exencionApi.setItbmsExemption.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { data: { message: 'Falta la tasa base «0% — Exento» activa.' } } }))
    renderPage()

    fireEvent.click(await screen.findByTestId('exencion-1'))
    fireEvent.change(screen.getByLabelText(`${E}.documento`), { target: { value: 'Resolución 1' } })
    fireEvent.click(screen.getByText(`${E}.marcar`))

    expect(await screen.findByRole('alert')).toHaveTextContent('Falta la tasa base')
  })
})
