import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeTransmisionesPanel from './FeTransmisionesPanel'
import type { FeTransmision } from '@/types/adminContab'

const t = (key: string) => key
const K = 'adminContab:facturacion.detalle.facturacionElectronica.transmisiones'

function tx(overrides: Partial<FeTransmision> = {}): FeTransmision {
  return {
    id: 1, created_at: '2026-09-28T14:18:17Z', provider: 'msl', ambiente: 'pruebas',
    operacion: 'certificar', origen: 'certificacion', endpoint: '/v1/facturas', serie: 'ILU', numero_fiscal: '0012',
    resultado: 'rechazado', http_status: 422, duracion_ms: 830, request_id: 'abc-123',
    request_payload: { serie: 'ILU', numero: '0012' },
    response_body: { estado: 'RECHAZADO', detalles: ['9026 - Falló la validación de algunos escenarios.'] },
    ...overrides,
  }
}

describe('FeTransmisionesPanel — SCRUM-987', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  it('no carga nada hasta que se expande', () => {
    const onLoad = vi.fn().mockResolvedValue([])
    render(<FeTransmisionesPanel onLoad={onLoad} t={t} />)
    expect(onLoad).not.toHaveBeenCalled()
  })

  it('al expandir muestra request y respuesta como texto JSON', async () => {
    const onLoad = vi.fn().mockResolvedValue([tx()])
    render(<FeTransmisionesPanel onLoad={onLoad} t={t} />)
    fireEvent.click(screen.getByText(`${K}.ver`))

    expect(await screen.findByText(/"numero": "0012"/)).toBeInTheDocument()
    expect(screen.getByText(/9026 - Falló la validación de algunos escenarios\./)).toBeInTheDocument()
    expect(screen.getByText(/HTTP 422/)).toBeInTheDocument()
    expect(screen.getByText(/\/v1\/facturas/)).toBeInTheDocument()
  })

  it('una consulta de estado (request nulo) no muestra el bloque de request', async () => {
    const onLoad = vi.fn().mockResolvedValue([tx({ operacion: 'consultar_estado', origen: 'polling', request_payload: null })])
    render(<FeTransmisionesPanel onLoad={onLoad} t={t} />)
    fireEvent.click(screen.getByText(`${K}.ver`))
    await screen.findByText(/9026/)
    expect(screen.queryByText(`${K}.request`)).not.toBeInTheDocument()
  })

  it('sin respuesta del PAC muestra el texto de "sin respuesta" en vez de un HTTP', async () => {
    const onLoad = vi.fn().mockResolvedValue([tx({ http_status: null, response_body: null, resultado: 'sin_respuesta' })])
    render(<FeTransmisionesPanel onLoad={onLoad} t={t} />)
    fireEvent.click(screen.getByText(`${K}.ver`))
    expect(await screen.findByText(new RegExp(`${K}\\.sinHttp`))).toBeInTheDocument()
  })

  it('el botón Copiar deja el JSON exacto en el portapapeles', async () => {
    const onLoad = vi.fn().mockResolvedValue([tx()])
    render(<FeTransmisionesPanel onLoad={onLoad} t={t} />)
    fireEvent.click(screen.getByText(`${K}.ver`))
    await screen.findByText(/"numero": "0012"/)

    fireEvent.click(screen.getAllByText(`${K}.copiar`)[0])

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify({ serie: 'ILU', numero: '0012' }, null, 2)))
  })

  it('muestra "cargando" mientras llega la respuesta y cada expansión pide datos frescos', async () => {
    let resolver: (v: FeTransmision[]) => void = () => {}
    const onLoad = vi.fn().mockImplementationOnce(() => new Promise<FeTransmision[]>(r => { resolver = r }))
      .mockResolvedValueOnce([tx({ id: 2 })])
    render(<FeTransmisionesPanel onLoad={onLoad} t={t} />)

    fireEvent.click(screen.getByText(`${K}.ver`))
    expect(await screen.findByText('common:labels.loading')).toBeInTheDocument()
    fireEvent.click(screen.getByText(`${K}.ver`)) // clic durante la carga: se ignora
    expect(onLoad).toHaveBeenCalledTimes(1)

    resolver([tx()])
    await screen.findByText(/"numero": "0012"/)

    fireEvent.click(screen.getByText(`${K}.ver`)) // colapsa
    fireEvent.click(screen.getByText(`${K}.ver`)) // vuelve a expandir -> pide de nuevo
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2))
  })

  it('muestra estado vacío y error de carga', async () => {
    const { unmount } = render(<FeTransmisionesPanel onLoad={vi.fn().mockResolvedValue([])} t={t} />)
    fireEvent.click(screen.getByText(`${K}.ver`))
    expect(await screen.findByText(`${K}.vacio`)).toBeInTheDocument()
    unmount()

    render(<FeTransmisionesPanel onLoad={vi.fn().mockRejectedValue(new Error('403'))} t={t} />)
    fireEvent.click(screen.getByText(`${K}.ver`))
    expect(await screen.findByText(`${K}.error`)).toBeInTheDocument()
  })

  it('el contenido se renderiza como texto, nunca como HTML', async () => {
    const onLoad = vi.fn().mockResolvedValue([tx({ response_body: { error: '<img src=x onerror=alert(1)>' } })])
    const { container } = render(<FeTransmisionesPanel onLoad={onLoad} t={t} />)
    fireEvent.click(screen.getByText(`${K}.ver`))
    await screen.findByText(/onerror/)
    expect(container.querySelector('img')).toBeNull()
  })
})
