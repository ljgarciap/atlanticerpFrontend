import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SetupChecklistCard from './SetupChecklistCard'
import { useSetupChecklist } from '@/hooks/useGerencia'

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))
vi.mock('@/hooks/useGerencia', () => ({ useSetupChecklist: vi.fn() }))

const mocked = vi.mocked(useSetupChecklist)
const respuesta = (data: unknown) => mocked.mockReturnValue({ data } as unknown as ReturnType<typeof useSetupChecklist>)

describe('SetupChecklistCard (Fase 16, 5.1)', () => {
  beforeEach(() => { navigate.mockReset() })

  it('lista solo los pasos pendientes y navega a la pantalla de cada uno', () => {
    respuesta({
      completo: false,
      pasos: [
        { clave: 'perfil_empresa', completo: true, ruta: '/admin-contab/empresa' },
        { clave: 'cuenta_bancaria', completo: false, ruta: '/admin-contab/cuentas-bancarias' },
      ],
    })
    render(<SetupChecklistCard />)

    expect(screen.getByTestId('setup-checklist')).toBeInTheDocument()
    expect(screen.queryByTestId('setup-step-perfil_empresa')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('setup-step-cuenta_bancaria'))
    expect(navigate).toHaveBeenCalledWith('/admin-contab/cuentas-bancarias')
  })

  it('no se muestra cuando todo está completo ni mientras carga', () => {
    respuesta({ completo: true, pasos: [] })
    const { container, rerender } = render(<SetupChecklistCard />)
    expect(container).toBeEmptyDOMElement()

    respuesta(undefined)
    rerender(<SetupChecklistCard />)
    expect(container).toBeEmptyDOMElement()
  })
})
