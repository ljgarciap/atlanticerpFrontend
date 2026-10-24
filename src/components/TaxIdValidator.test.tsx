import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, type AxiosResponse } from 'axios'
import TaxIdValidator from './TaxIdValidator'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { TaxIdValidationResult } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      const vals = Object.values(opts).filter(v => typeof v === 'string' || typeof v === 'number')
      return vals.length ? `${key}:${vals.join(',')}` : key
    },
  }),
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: { clients: { validateTaxId: vi.fn() } },
}))

const validateTaxId = vi.mocked(ventasDisenoApi.clients.validateTaxId)
const K = 'clients.taxIdValidation'

function resultado(parcial: Partial<TaxIdValidationResult> = {}): TaxIdValidationResult {
  return { disponible: true, valido: true, nombre: 'ACME, S.A.', dv: '32', tipo_ruc: '2', estado: 'A', codigo: 'ok', ...parcial }
}

function renderValidator(props: Partial<React.ComponentProps<typeof TaxIdValidator>> = {}) {
  const onApply = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <TaxIdValidator taxId="155704849-2-2021" taxIdDv="81" businessName="Acme" onApply={onApply} {...props} />
    </QueryClientProvider>,
  )
  return { onApply, qc, ...utils }
}

async function validar() {
  fireEvent.click(screen.getByText(`${K}.validar`))
}

beforeEach(() => { vi.clearAllMocks() })

describe('TaxIdValidator (SCRUM-1002)', () => {
  it('el botón está deshabilitado mientras el RUC tiene menos de 3 caracteres', () => {
    renderValidator({ taxId: '15' })
    expect(screen.getByText(`${K}.validar`)).toBeDisabled()
  })

  it('RUC válido: muestra nombre y DV oficiales, la hora de Panamá y PROPONE (no aplica) los datos', async () => {
    validateTaxId.mockResolvedValue(resultado())
    const { onApply } = renderValidator()

    await validar()

    expect(await screen.findByText(/ACME, S\.A\./)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${K}.validadoHoy`))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${K}.dvDifiere`))).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled() // nunca pisa en silencio

    fireEvent.click(screen.getByText(`${K}.usarOficiales`))
    expect(onApply).toHaveBeenCalledWith({ dv: '32', nombre: 'ACME, S.A.' })
  })

  it('si lo ingresado ya coincide con lo oficial no ofrece aplicar nada', async () => {
    validateTaxId.mockResolvedValue(resultado())
    renderValidator({ taxIdDv: '32', businessName: 'acme,  s.a.' })

    await validar()

    expect(await screen.findByText(`${K}.coincide`)).toBeInTheDocument()
    expect(screen.queryByText(`${K}.usarOficiales`)).not.toBeInTheDocument()
  })

  it('el DV "05" y "5" se consideran el mismo', async () => {
    validateTaxId.mockResolvedValue(resultado({ dv: '05' }))
    renderValidator({ taxIdDv: '5', businessName: 'ACME, S.A.' })
    await validar()
    expect(await screen.findByText(`${K}.coincide`)).toBeInTheDocument()
  })

  it('el estado del contribuyente (p. ej. "I", que MSL devuelve para todo RUC válido) no genera ningún aviso', async () => {
    validateTaxId.mockResolvedValue(resultado({ estado: 'I' }))
    renderValidator({ taxIdDv: '32', businessName: 'ACME, S.A.' })

    await validar()

    expect(await screen.findByText(`${K}.coincide`)).toBeInTheDocument()
    expect(screen.queryByText(/estadoAviso|reporta el estado/i)).not.toBeInTheDocument()
  })

  it('RUC que no figura: aviso, sin ofrecer datos', async () => {
    validateTaxId.mockResolvedValue(resultado({ valido: false, nombre: null, dv: null, codigo: 'no_encontrado' }))
    renderValidator()

    await validar()

    expect(await screen.findByText(`${K}.noEncontrado`)).toBeInTheDocument()
    expect(screen.queryByText(`${K}.usarOficiales`)).not.toBeInTheDocument()
  })

  it.each([
    ['apagado', `${K}.noDisponible.apagado`],
    ['sin_credenciales', `${K}.noDisponible.sinCredenciales`],
    ['no_disponible', `${K}.noDisponible.generico`],
  ] as const)('no disponible (%s) nunca se presenta como RUC inválido', async (codigo, texto) => {
    validateTaxId.mockResolvedValue(resultado({ disponible: false, valido: null, nombre: null, dv: null, codigo }))
    renderValidator()

    await validar()

    expect(await screen.findByText(texto)).toBeInTheDocument()
    expect(screen.queryByText(`${K}.noEncontrado`)).not.toBeInTheDocument()
  })

  it('un 429 del backend muestra el aviso de límite; cualquier otro error, el genérico', async () => {
    validateTaxId.mockRejectedValueOnce(new AxiosError('x', '429', undefined, undefined, { status: 429 } as AxiosResponse))
    const { unmount } = renderValidator()
    await validar()
    expect(await screen.findByText(`${K}.limite`)).toBeInTheDocument()
    unmount()

    validateTaxId.mockRejectedValueOnce(new Error('Network Error'))
    renderValidator()
    await validar()
    expect(await screen.findByText(`${K}.errorGenerico`)).toBeInTheDocument()
  })

  it('un resultado de otro RUC no se muestra si el usuario siguió editando', async () => {
    validateTaxId.mockResolvedValue(resultado())
    const { rerender, qc, onApply } = renderValidator()
    await validar()
    await screen.findByText(/ACME, S\.A\./)

    rerender(
      <QueryClientProvider client={qc}>
        <TaxIdValidator taxId="155704849-2-2022" taxIdDv="81" businessName="Acme" onApply={onApply} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.queryByText(/ACME, S\.A\./)).not.toBeInTheDocument())
  })
})
