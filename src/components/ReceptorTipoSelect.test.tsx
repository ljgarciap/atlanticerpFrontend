import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ReceptorTipoSelect from './ReceptorTipoSelect'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const K = 'clients.receptorTipo'

describe('ReceptorTipoSelect (SCRUM-1003)', () => {
  it('ofrece solo Contribuyente y Consumidor Final (Gobierno y Extranjero quedan fuera)', () => {
    render(<ReceptorTipoSelect id="t" value="01" onChange={vi.fn()} permitirConsumidorFinal />)
    const opciones = screen.getAllByRole('option').map(o => (o as HTMLOptionElement).value)
    expect(opciones).toEqual(['01', '02'])
  })

  it('emite el tipo elegido', () => {
    const onChange = vi.fn()
    render(<ReceptorTipoSelect id="t" value="01" onChange={onChange} permitirConsumidorFinal />)
    fireEvent.change(screen.getByLabelText(`${K}.label`), { target: { value: '02' } })
    expect(onChange).toHaveBeenCalledWith('02')
  })

  it('explica el efecto solo con Consumidor Final', () => {
    const { rerender } = render(<ReceptorTipoSelect id="t" value="01" onChange={vi.fn()} permitirConsumidorFinal />)
    expect(screen.queryByText(`${K}.consumidorFinalAyuda`)).not.toBeInTheDocument()
    rerender(<ReceptorTipoSelect id="t" value="02" onChange={vi.fn()} permitirConsumidorFinal />)
    expect(screen.getByText(`${K}.consumidorFinalAyuda`)).toBeInTheDocument()
  })

  it('sin el permiso, "Consumidor final" aparece deshabilitado con la razón (solo Gerencia y Contabilidad)', () => {
    render(<ReceptorTipoSelect id="t" value="01" onChange={vi.fn()} permitirConsumidorFinal={false} />)
    expect((screen.getByRole('option', { name: `${K}.consumidorFinal` }) as HTMLOptionElement).disabled).toBe(true)
    expect(screen.getByText(`${K}.soloGerenciaContabilidad`)).toBeInTheDocument()
  })

  it('un cliente que YA era Consumidor final conserva su opción aunque el usuario no tenga el permiso, también tras pasarlo a Contribuyente en el modal', () => {
    render(<ReceptorTipoSelect id="t" value="01" valorOriginal="02" onChange={vi.fn()} permitirConsumidorFinal={false} />)
    expect((screen.getByRole('option', { name: `${K}.consumidorFinal` }) as HTMLOptionElement).disabled).toBe(false)
    expect(screen.queryByText(`${K}.soloGerenciaContabilidad`)).not.toBeInTheDocument()
  })
})
