import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, type AxiosResponse } from 'axios'
import EditSubClientTaxDataModal from './EditSubClientTaxDataModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { SubClientDetail } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

let mockCanMarkConsumidorFinal = true
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => mockCanMarkConsumidorFinal }))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: { clients: { validateTaxId: vi.fn(), updateSubClientTaxData: vi.fn() } },
}))

const api = vi.mocked(ventasDisenoApi.clients)

const SUB: SubClientDetail = {
  id: 10, master_client_id: 1, business_name: 'Acme Viejo', tax_id: '155-0000-1-2026', tax_id_dv: '81',
  delivery_address: null, category: null, contacts: [],
}

function renderModal(onClose = vi.fn(), subClient: SubClientDetail = SUB) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><EditSubClientTaxDataModal subClient={subClient} onClose={onClose} /></QueryClientProvider>)
  return { onClose }
}

beforeEach(() => { vi.clearAllMocks(); mockCanMarkConsumidorFinal = true })

describe('EditSubClientTaxDataModal (SCRUM-1002)', () => {
  it('abre con los datos actuales y avisa que esto cambia el receptor fiscal', () => {
    renderModal()
    expect(screen.getByLabelText(/createModal.businessName/)).toHaveValue('Acme Viejo')
    expect(screen.getByLabelText(/createModal\.taxId \*/)).toHaveValue('155-0000-1-2026')
    expect(screen.getByLabelText(/createModal.taxIdDv/)).toHaveValue('81')
    expect(screen.getByText('ventasDiseno:clients.editTaxData.aviso')).toBeInTheDocument()
  })

  it('SCRUM-1140: el DV es opcional, pero la razón social vacía sí impide guardar', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText(/createModal.taxIdDv/), { target: { value: '' } })
    expect(screen.getByText('ventasDiseno:clients.editTaxData.guardar')).not.toBeDisabled()
    fireEvent.change(screen.getByLabelText(/createModal.taxIdDv/), { target: { value: '32' } })
    fireEvent.change(screen.getByLabelText(/createModal.businessName/), { target: { value: '   ' } })
    expect(screen.getByText('ventasDiseno:clients.editTaxData.guardar')).toBeDisabled()
  })

  it('guarda con los valores recortados y cierra', async () => {
    api.updateSubClientTaxData.mockResolvedValue({ ...SUB, business_name: 'Acme Nuevo', tax_id: '155704849-2-2021', tax_id_dv: '32' })
    const { onClose } = renderModal()

    fireEvent.change(screen.getByLabelText(/createModal.businessName/), { target: { value: '  Acme Nuevo ' } })
    fireEvent.change(screen.getByLabelText(/createModal\.taxId \*/), { target: { value: ' 155704849-2-2021 ' } })
    fireEvent.change(screen.getByLabelText(/createModal.taxIdDv/), { target: { value: '32' } })
    fireEvent.click(screen.getByText('ventasDiseno:clients.editTaxData.guardar'))

    await waitFor(() => expect(api.updateSubClientTaxData).toHaveBeenCalledWith(10, { business_name: 'Acme Nuevo', receptor_tipo: '01', tax_id: '155704849-2-2021', tax_id_dv: '32' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('un 409 del backend (documentos certificados) muestra su mensaje y no cierra', async () => {
    const mensaje = 'No se pueden editar la razón social ni el RUC/DV: este cliente ya tiene facturas certificadas.'
    api.updateSubClientTaxData.mockRejectedValue(new AxiosError('x', '409', undefined, undefined, { status: 409, data: { message: mensaje } } as AxiosResponse))
    const { onClose } = renderModal()

    fireEvent.change(screen.getByLabelText(/createModal.taxIdDv/), { target: { value: '32' } })
    fireEvent.click(screen.getByText('ventasDiseno:clients.editTaxData.guardar'))

    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('los datos oficiales propuestos por la validación se aplican solo con un clic', async () => {
    api.validateTaxId.mockResolvedValue({ disponible: true, valido: true, nombre: 'ACME NUEVO, S.A.', dv: '32', tipo_ruc: '2', estado: 'A', codigo: 'ok' })
    renderModal()

    fireEvent.click(screen.getByText('clients.taxIdValidation.validar'))
    await screen.findByText(/ACME NUEVO, S\.A\./)
    expect(screen.getByLabelText(/createModal.taxIdDv/)).toHaveValue('81') // aún no se aplicó

    fireEvent.click(screen.getByText('clients.taxIdValidation.usarOficiales'))
    expect(screen.getByLabelText(/createModal.taxIdDv/)).toHaveValue('32')
    expect(screen.getByLabelText(/createModal.businessName/)).toHaveValue('ACME NUEVO, S.A.')
  })

  // SCRUM-1003
  it('un Consumidor Final se edita sin RUC ni DV y no los manda', async () => {
    api.updateSubClientTaxData.mockResolvedValue({ ...SUB, receptor_tipo: '02', tax_id: '', tax_id_dv: null })
    renderModal()

    fireEvent.change(screen.getByLabelText(/clients.receptorTipo.label/), { target: { value: '02' } })
    expect(screen.queryByLabelText(/createModal.taxId \*/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('tax-id-validator')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('ventasDiseno:clients.editTaxData.guardar'))

    await waitFor(() => expect(api.updateSubClientTaxData).toHaveBeenCalledWith(10, { business_name: 'Acme Viejo', receptor_tipo: '02' }))
  })

  it('abre con el tipo actual y, al volver a Contribuyente, exige RUC y DV otra vez', () => {
    const cf: SubClientDetail = { ...SUB, receptor_tipo: '02', tax_id: '', tax_id_dv: null }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><EditSubClientTaxDataModal subClient={cf} onClose={vi.fn()} /></QueryClientProvider>)

    expect(screen.getByLabelText(/clients.receptorTipo.label/)).toHaveValue('02')
    expect(screen.getByText('ventasDiseno:clients.editTaxData.guardar')).not.toBeDisabled()

    fireEvent.change(screen.getByLabelText(/clients.receptorTipo.label/), { target: { value: '01' } })

    expect(screen.getByText('ventasDiseno:clients.editTaxData.guardar')).toBeDisabled() // RUC y DV vacíos
  })

  it('sin el permiso angosto no se puede pasar un Contribuyente a Consumidor final', () => {
    mockCanMarkConsumidorFinal = false
    renderModal()
    expect((screen.getByRole('option', { name: 'clients.receptorTipo.consumidorFinal' }) as HTMLOptionElement).disabled).toBe(true)
  })

  // SCRUM-1166 — editar el RUC o el tipo de un cliente exento de ITBMS obliga a revisar la exención.
  describe('cliente exento de ITBMS (SCRUM-1166)', () => {
    const EXENTO: SubClientDetail = { ...SUB, itbms_exento: true, itbms_exencion_documento: 'Resolución 201-1234' }

    it('avisa de antemano que el cliente es exento y que cambiar su RUC o tipo exige revisar la exención', () => {
      renderModal(vi.fn(), EXENTO)
      expect(screen.getByTestId('edit-tax-aviso-exento')).toBeInTheDocument()
    })

    it('un cliente que no es exento no muestra ese aviso', () => {
      renderModal()
      expect(screen.queryByTestId('edit-tax-aviso-exento')).not.toBeInTheDocument()
    })

    it('si el servidor dice que la exención hay que revisarla, no cierra solo: muestra el aviso y cierra al entenderlo', async () => {
      api.updateSubClientTaxData.mockResolvedValue({ ...EXENTO, tax_id: '155-9999-1-2026', itbms_exento: true, exencion_a_revisar: true })
      const { onClose } = renderModal(vi.fn(), EXENTO)

      fireEvent.change(screen.getByLabelText(/createModal\.taxId \*/), { target: { value: '155-9999-1-2026' } })
      fireEvent.click(screen.getByText('ventasDiseno:clients.editTaxData.guardar'))

      expect(await screen.findByTestId('edit-tax-exencion-revisar')).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
      fireEvent.click(screen.getByText('ventasDiseno:clients.editTaxData.entendido'))
      expect(onClose).toHaveBeenCalled()
    })

    it('si solo cambia algo que no es fiscal (no hay nada que revisar) cierra normal', async () => {
      api.updateSubClientTaxData.mockResolvedValue({ ...EXENTO, exencion_a_revisar: false })
      const { onClose } = renderModal(vi.fn(), EXENTO)

      fireEvent.click(screen.getByText('ventasDiseno:clients.editTaxData.guardar'))

      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(screen.queryByTestId('edit-tax-exencion-revisar')).not.toBeInTheDocument()
    })
  })
})
