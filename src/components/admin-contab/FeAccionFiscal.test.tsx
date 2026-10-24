import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FeAccionFiscalBoton from './FeAccionFiscal'
import type { FeAccionResultado } from '@/types/adminContab'

const t = (key: string) => key
const K = 'adminContab:facturacion.detalle.facturacionElectronica.accion'

function resultado(overrides: Partial<FeAccionResultado> = {}): FeAccionResultado {
  return { accion: 'reenviado', fe_estado: 'certificado', fe_detalle: null, cufe: 'FE01', mensaje: 'Documento certificado ante la DGI.', codigo: null, ...overrides }
}

describe('FeAccionFiscalBoton — SCRUM-1007', () => {
  it('muestra la etiqueta según la acción y pide confirmación antes de ejecutar', () => {
    const onEjecutar = vi.fn().mockResolvedValue(resultado())
    const { rerender } = render(<FeAccionFiscalBoton accion="reintentar" disponible onEjecutar={onEjecutar} t={t} />)
    expect(screen.getByText(`${K}.reintentar`)).toBeInTheDocument()

    rerender(<FeAccionFiscalBoton accion="actualizar_estado" disponible onEjecutar={onEjecutar} t={t} />)
    fireEvent.click(screen.getByText(`${K}.actualizarEstado`))

    expect(screen.getByText(`${K}.confirmarActualizar`)).toBeInTheDocument()
    expect(onEjecutar).not.toHaveBeenCalled() // nada se envía sin confirmar
  })

  it('cancelar vuelve al botón sin ejecutar nada', () => {
    const onEjecutar = vi.fn()
    render(<FeAccionFiscalBoton accion="reintentar" disponible onEjecutar={onEjecutar} t={t} />)
    fireEvent.click(screen.getByText(`${K}.reintentar`))
    fireEvent.click(screen.getByText(`${K}.cancelar`))

    expect(screen.getByText(`${K}.reintentar`)).toBeInTheDocument()
    expect(onEjecutar).not.toHaveBeenCalled()
  })

  it('al confirmar muestra "Enviando…" mientras dura y luego el mensaje del resultado; un solo envío', async () => {
    let resolver: (r: FeAccionResultado) => void = () => {}
    const onEjecutar = vi.fn().mockImplementation(() => new Promise<FeAccionResultado>(r => { resolver = r }))
    render(<FeAccionFiscalBoton accion="reintentar" disponible onEjecutar={onEjecutar} t={t} />)
    fireEvent.click(screen.getByText(`${K}.reintentar`))
    fireEvent.click(screen.getByText(`${K}.confirmar`))

    const enviando = await screen.findByText(`${K}.enviando`)
    expect(enviando).toBeDisabled() // el mismo botón, deshabilitado: no hay doble envío
    expect(onEjecutar).toHaveBeenCalledTimes(1)

    resolver(resultado({ mensaje: 'Documento certificado ante la DGI.' }))
    expect(await screen.findByText('Documento certificado ante la DGI.')).toBeInTheDocument()
  })

  it('un rechazo nuevo es un resultado, no un error: se muestra el mensaje sin estilo de error', async () => {
    const onEjecutar = vi.fn().mockResolvedValue(resultado({ fe_estado: 'rechazado', mensaje: 'La DGI rechazó el documento; revisa el motivo.' }))
    render(<FeAccionFiscalBoton accion="reintentar" disponible onEjecutar={onEjecutar} t={t} />)
    fireEvent.click(screen.getByText(`${K}.reintentar`))
    fireEvent.click(screen.getByText(`${K}.confirmar`))

    const estado = await screen.findByRole('status')
    expect(estado).toHaveTextContent('La DGI rechazó el documento; revisa el motivo.')
    expect(estado.className).not.toContain('text-red-500')
  })

  it('el caso 9022 muestra el aviso específico en lugar del mensaje genérico', async () => {
    const onEjecutar = vi.fn().mockResolvedValue(resultado({ fe_estado: 'rechazado', codigo: 'ya_certificado_9022', mensaje: 'texto del backend' }))
    render(<FeAccionFiscalBoton accion="actualizar_estado" disponible onEjecutar={onEjecutar} t={t} />)
    fireEvent.click(screen.getByText(`${K}.actualizarEstado`))
    fireEvent.click(screen.getByText(`${K}.confirmar`))

    expect(await screen.findByText(`${K}.ya9022`)).toBeInTheDocument()
  })

  it('un 409 muestra el mensaje del backend y un fallo de red el mensaje genérico', async () => {
    const error409 = Object.assign(new Error('409'), { isAxiosError: true, response: { status: 409, data: { message: 'Ya hay una acción en curso para este documento.' } } })
    const onEjecutar = vi.fn().mockRejectedValueOnce(error409).mockRejectedValueOnce(new Error('red'))
    render(<FeAccionFiscalBoton accion="reintentar" disponible onEjecutar={onEjecutar} t={t} />)

    fireEvent.click(screen.getByText(`${K}.reintentar`))
    fireEvent.click(screen.getByText(`${K}.confirmar`))
    expect(await screen.findByText('Ya hay una acción en curso para este documento.')).toBeInTheDocument()

    fireEvent.click(screen.getByText(`${K}.reintentar`))
    fireEvent.click(screen.getByText(`${K}.confirmar`))
    expect(await screen.findByText(`${K}.errorGenerico`)).toBeInTheDocument()
  })

  it('cuando el backend deja de ofrecer la acción (ya certificó) el botón se oculta pero el resultado sigue visible', async () => {
    const onEjecutar = vi.fn().mockResolvedValue(resultado())
    const { rerender } = render(<FeAccionFiscalBoton accion="reintentar" disponible onEjecutar={onEjecutar} t={t} />)
    fireEvent.click(screen.getByText(`${K}.reintentar`))
    fireEvent.click(screen.getByText(`${K}.confirmar`))
    await screen.findByText('Documento certificado ante la DGI.')

    rerender(<FeAccionFiscalBoton accion="reintentar" disponible={false} onEjecutar={onEjecutar} t={t} />)

    expect(screen.queryByText(`${K}.reintentar`)).not.toBeInTheDocument()
    expect(screen.getByText('Documento certificado ante la DGI.')).toBeInTheDocument()
  })

  it('el mensaje se renderiza como texto, nunca como HTML', async () => {
    const onEjecutar = vi.fn().mockResolvedValue(resultado({ mensaje: '<img src=x onerror=alert(1)>' }))
    const { container } = render(<FeAccionFiscalBoton accion="reintentar" disponible onEjecutar={onEjecutar} t={t} />)
    fireEvent.click(screen.getByText(`${K}.reintentar`))
    fireEvent.click(screen.getByText(`${K}.confirmar`))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('onerror'))
    expect(container.querySelector('img')).toBeNull()
  })
})
