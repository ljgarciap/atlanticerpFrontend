import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import SoportePage from './SoportePage'
import { soporteApi } from '@/api/soporteApi'

// SCRUM-923 — cubre el happy path (código de AtlanticERP -> script del widget carga -> sendCode) y el
// estado de error explícito cuando el endpoint de AtlanticERP falla (tickets-backend caído/503). La key
// real de tickets-backend no existe todavía en ningún entorno (confirmado por el Arquitecto vía
// SSH a dev/test 2026-09-16) — el flujo real contra tickets.atlanticerp.ai no se puede probar end-to-end
// acá, todo el HTTP/script está mockeado.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/soporteApi', () => ({
  soporteApi: { getWidgetCode: vi.fn() },
}))

const mockedApi = vi.mocked(soporteApi, true)

beforeEach(() => {
  vi.clearAllMocks()
  delete (window as { IlluminationTickets?: unknown }).IlluminationTickets
})

afterEach(() => {
  document.body.querySelectorAll('script[src="https://tickets.atlanticerp.ai/embed.js"]').forEach(s => s.remove())
})

describe('SoportePage', () => {
  it('pide el código, carga el script y llama a sendCode una vez ambos están listos', async () => {
    mockedApi.getWidgetCode.mockResolvedValue({ code: 'ticket-code-123' })
    const sendCode = vi.fn()
    window.IlluminationTickets = { sendCode }

    render(<SoportePage />)

    await waitFor(() => expect(mockedApi.getWidgetCode).toHaveBeenCalledTimes(1))

    const script = document.body.querySelector<HTMLScriptElement>('script[src="https://tickets.atlanticerp.ai/embed.js"]')
    expect(script).not.toBeNull()
    expect(script?.dataset.tenant).toBe('atlanticerp')
    expect(script?.dataset.container).toBe('soporte-widget')

    act(() => { script?.onload?.(new Event('load')) })

    await waitFor(() => expect(sendCode).toHaveBeenCalledWith('ticket-code-123'))
  })

  it('muestra el estado de error si AtlanticERP devuelve 503 (tickets-backend caído)', async () => {
    mockedApi.getWidgetCode.mockRejectedValue(new Error('503'))

    render(<SoportePage />)

    await waitFor(() => expect(screen.getByText('soporte:unavailable')).toBeInTheDocument())
  })

  it('desmonta el script del widget al salir de la página', async () => {
    mockedApi.getWidgetCode.mockResolvedValue({ code: 'ticket-code-123' })

    const { unmount } = render(<SoportePage />)
    await waitFor(() => expect(mockedApi.getWidgetCode).toHaveBeenCalledTimes(1))
    expect(document.body.querySelector('script[src="https://tickets.atlanticerp.ai/embed.js"]')).not.toBeNull()

    unmount()

    expect(document.body.querySelector('script[src="https://tickets.atlanticerp.ai/embed.js"]')).toBeNull()
  })
})
