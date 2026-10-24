import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReceptorGuardNotice from './ReceptorGuardNotice'
import { adminContabApi } from '@/api/adminContabApi'
import { usePermission } from '@/hooks/usePermission'
import type { ReceptorValidacion } from '@/types/adminContab'

// Guarda de RUC al facturar (docs/specs/guarda-validacion-ruc-al-facturar.md): el aviso de la vista previa y la
// corrección de RUC/DV/razón social, que el backend valida contra la DGI antes de guardar.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/usePermission', () => ({ usePermission: vi.fn() }))
vi.mock('@/api/adminContabApi', () => ({ adminContabApi: { invoices: { correctReceptor: vi.fn() } } }))

const mockedApi = vi.mocked(adminContabApi, true)

function receptor(overrides: Partial<ReceptorValidacion> = {}): ReceptorValidacion {
  return {
    estado: 'no_encontrado', bloquea: true, mensaje: 'La DGI no reconoce el RUC 1689671-1-68.', sub_client_id: 4996,
    ruc: '1689671-1-68', dv: null, nombre: 'CONSTRUCTORA GRUPO V, SA', nombre_dgi: null, dv_dgi: null,
    corregible: true, edicion_bloqueada: false, actualizable: false, ...overrides,
  }
}

function renderNotice(r: ReceptorValidacion, onCorrected = vi.fn(), extra: { consumidorFinal?: boolean; onConsumidorFinalChange?: (v: boolean) => void } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><ReceptorGuardNotice receptor={r} onCorrected={onCorrected} {...extra} /></QueryClientProvider>)
  return onCorrected
}

describe('ReceptorGuardNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePermission).mockReturnValue(true)
  })

  it('no muestra nada cuando el RUC ya validó o es Consumidor Final', () => {
    renderNotice(receptor({ estado: 'ok', bloquea: false }))
    renderNotice(receptor({ estado: 'no_aplica', bloquea: false }))
    expect(screen.queryByTestId('receptor-guard')).not.toBeInTheDocument()
  })

  it('con permiso, corrige RUC/DV/razón social y recalcula la vista previa tras guardar', async () => {
    mockedApi.invoices.correctReceptor.mockResolvedValue({ receptor: receptor({ estado: 'ok', bloquea: false }) })
    const onCorrected = renderNotice(receptor())

    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[1], { target: { value: '1689571-1-684168' } })
    fireEvent.change(inputs[2], { target: { value: '33' } })
    fireEvent.click(screen.getByText('facturacion.preview.receptor.validarGuardar'))

    await waitFor(() => expect(mockedApi.invoices.correctReceptor).toHaveBeenCalledWith(4996, {
      business_name: 'CONSTRUCTORA GRUPO V, SA', tax_id: '1689571-1-684168', tax_id_dv: '33',
    }))
    await waitFor(() => expect(onCorrected).toHaveBeenCalled())
  })

  it('si la DGI no confirma los datos (422), muestra el motivo y ofrece usar los de la DGI', async () => {
    mockedApi.invoices.correctReceptor.mockRejectedValue(Object.assign(new Error('422'), {
      isAxiosError: true,
      response: { status: 422, data: {
        message: 'El DV registrado (11) no coincide; la DGI indica DV 33.',
        receptor: receptor({ estado: 'dv_distinto', mensaje: 'El DV registrado (11) no coincide; la DGI indica DV 33.', nombre_dgi: 'CONSTRUCTORA GRUPO V S A', dv_dgi: '33' }),
      } },
    }))
    const onCorrected = renderNotice(receptor())

    fireEvent.change(screen.getAllByRole('textbox')[2], { target: { value: '11' } })
    fireEvent.click(screen.getByText('facturacion.preview.receptor.validarGuardar'))

    expect((await screen.findAllByText(/la DGI indica DV 33/)).length).toBeGreaterThan(0)
    expect(onCorrected).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('facturacion.preview.receptor.usarDgi'))
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('CONSTRUCTORA GRUPO V S A')
    expect(screen.getAllByRole('textbox')[2]).toHaveValue('33')
  })

  it('sin el permiso de corrección solo informa, sin formulario', () => {
    vi.mocked(usePermission).mockReturnValue(false)
    renderNotice(receptor())

    expect(screen.getByText('facturacion.preview.receptor.sinPermiso')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('con documentos certificados (409) solo muestra el error, sin formulario', () => {
    renderNotice(receptor({ edicion_bloqueada: true }))

    expect(screen.getByText('facturacion.preview.receptor.edicionBloqueada')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('una falla de la DGI (no corregible) bloquea sin ofrecer editar el RUC', () => {
    renderNotice(receptor({ estado: 'no_disponible', corregible: false, mensaje: 'No se pudo validar el RUC contra la DGI en este momento.' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  // ── SCRUM-1140 — razón social de la DGI, DV opcional y Consumidor final ──────────────────────────────

  it('razón social distinta: no bloquea, muestra ambas y permite actualizar el cliente con la de la DGI', async () => {
    mockedApi.invoices.correctReceptor.mockResolvedValue({ receptor: receptor({ estado: 'ok', bloquea: false }) })
    const onCorrected = renderNotice(receptor({
      estado: 'nombre_distinto', bloquea: false, corregible: false, actualizable: true, ruc: '1689571-1-684168', dv: '33',
      nombre: 'OTRA EMPRESA, S.A.', nombre_dgi: 'CONSTRUCTORA GRUPO V S A', dv_dgi: '33',
      mensaje: 'La razón social no coincide con la de la DGI: "CONSTRUCTORA GRUPO V S A". Se enviará la de la DGI en la factura.',
    }))

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('receptor-nombres')).toHaveTextContent('OTRA EMPRESA, S.A.')
    expect(screen.getByTestId('receptor-nombres')).toHaveTextContent('CONSTRUCTORA GRUPO V S A')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('facturacion.preview.receptor.actualizarCliente'))
    await waitFor(() => expect(mockedApi.invoices.correctReceptor).toHaveBeenCalledWith(4996, {
      business_name: 'CONSTRUCTORA GRUPO V S A', tax_id: '1689571-1-684168', tax_id_dv: '33',
    }))
    await waitFor(() => expect(onCorrected).toHaveBeenCalled())
  })

  it('razón social distinta sin el permiso de corrección: solo informa, sin botón de actualizar', () => {
    vi.mocked(usePermission).mockReturnValue(false)
    renderNotice(receptor({ estado: 'nombre_distinto', bloquea: false, corregible: false, actualizable: true, nombre_dgi: 'CONSTRUCTORA GRUPO V S A' }))

    expect(screen.queryByText('facturacion.preview.receptor.actualizarCliente')).not.toBeInTheDocument()
  })

  it('el DV es opcional: una cédula sin DV se envía sin la clave tax_id_dv', async () => {
    mockedApi.invoices.correctReceptor.mockResolvedValue({ receptor: receptor({ estado: 'ok', bloquea: false }) })
    renderNotice(receptor())

    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: '8-123-456' } })
    fireEvent.click(screen.getByText('facturacion.preview.receptor.validarGuardar'))

    await waitFor(() => expect(mockedApi.invoices.correctReceptor).toHaveBeenCalledWith(4996, {
      business_name: 'CONSTRUCTORA GRUPO V, SA', tax_id: '8-123-456',
    }))
  })

  it('un DV escrito pero inválido deshabilita "Validar y guardar"', () => {
    renderNotice(receptor())

    fireEvent.change(screen.getAllByRole('textbox')[2], { target: { value: 'abc' } })

    expect(screen.getByText('facturacion.preview.receptor.validarGuardar').closest('button')).toBeDisabled()
  })

  it('con el permiso, un documento que no valida ofrece facturar como consumidor final', () => {
    const onChange = vi.fn()
    renderNotice(receptor(), vi.fn(), { onConsumidorFinalChange: onChange })

    fireEvent.click(screen.getByText('facturacion.preview.receptor.consumidorFinal.facturar'))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('una falla de la DGI (no corregible) también ofrece consumidor final', () => {
    renderNotice(receptor({ estado: 'no_disponible', corregible: false }), vi.fn(), { onConsumidorFinalChange: vi.fn() })

    expect(screen.getByText('facturacion.preview.receptor.consumidorFinal.facturar')).toBeInTheDocument()
  })

  it('sin el permiso de consumidor final no se ofrece, aunque pueda corregir datos', () => {
    vi.mocked(usePermission).mockImplementation(p => p === 'admin_contab.edit.receptor_fiscal')
    renderNotice(receptor(), vi.fn(), { onConsumidorFinalChange: vi.fn() })

    expect(screen.queryByText('facturacion.preview.receptor.consumidorFinal.facturar')).not.toBeInTheDocument()
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0)
  })

  it('sin onConsumidorFinalChange la opción no existe (uso anterior del componente)', () => {
    renderNotice(receptor())

    expect(screen.queryByText('facturacion.preview.receptor.consumidorFinal.facturar')).not.toBeInTheDocument()
  })

  it('decisión consciente: con el documento validado, el permiso ofrece consumidor final desde el inicio', () => {
    const onChange = vi.fn()
    renderNotice(receptor({ estado: 'ok', bloquea: false, corregible: false }), vi.fn(), { onConsumidorFinalChange: onChange })

    fireEvent.click(screen.getByText('facturacion.preview.receptor.consumidorFinal.facturar'))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('con consumidor final elegido muestra la confirmación y permite volver al documento del cliente', () => {
    const onChange = vi.fn()
    renderNotice(receptor(), vi.fn(), { consumidorFinal: true, onConsumidorFinalChange: onChange })

    expect(screen.getByTestId('receptor-consumidor-final')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('facturacion.preview.receptor.consumidorFinal.quitar'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('un cliente sin cliente fiscal (sub_client_id nulo) no ofrece consumidor final', () => {
    renderNotice(receptor({ sub_client_id: null, corregible: false }), vi.fn(), { onConsumidorFinalChange: vi.fn() })

    expect(screen.queryByText('facturacion.preview.receptor.consumidorFinal.facturar')).not.toBeInTheDocument()
  })

  it('H2 (Pre-QA): consumidor final también se ofrece con razón social distinta y con el PAC apagado', () => {
    renderNotice(receptor({ estado: 'nombre_distinto', bloquea: false, corregible: false, actualizable: true, nombre_dgi: 'CONSTRUCTORA GRUPO V S A' }), vi.fn(), { onConsumidorFinalChange: vi.fn() })
    expect(screen.getByText('facturacion.preview.receptor.consumidorFinal.facturar')).toBeInTheDocument()
  })

  it('H2 (Pre-QA): consumidor final con el PAC apagado (no_validado)', () => {
    renderNotice(receptor({ estado: 'no_validado', bloquea: false, corregible: false }), vi.fn(), { onConsumidorFinalChange: vi.fn() })
    expect(screen.getByText('facturacion.preview.receptor.consumidorFinal.facturar')).toBeInTheDocument()
  })
})
