import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ManualVideoModal from './ManualVideoModal'
import { manualesApi } from '@/api/manualesApi'
import type { Manual } from '@/types/manuales'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}))

vi.mock('@/api/manualesApi', () => ({
  manualesApi: { getUrl: vi.fn() },
}))

const api = vi.mocked(manualesApi)

const MANUAL: Manual = {
  id: 'v1', name: 'Guía en video', module: 'compras', type: 'video',
  size_bytes: 100 * 1024 * 1024, created_at: '2026-09-01T10:00:00Z',
}

function setup() {
  const onClose = vi.fn()
  const onDownload = vi.fn()
  render(<ManualVideoModal manual={MANUAL} onClose={onClose} onDownload={onDownload} />)
  return { onClose, onDownload }
}

function videoEl() {
  return document.querySelector('video') as HTMLVideoElement
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getUrl.mockResolvedValue({ url: 'https://s3.example/v.mp4', expires_at: '2026-09-30T00:00:00Z' })
})

describe('ManualVideoModal', () => {
  it('es un dialog modal titulado con el nombre, con <video controls> sin autoplay y foco inicial en Cerrar', async () => {
    setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Guía en video' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'video.close' })).toHaveFocus()

    await waitFor(() => expect(videoEl()).toHaveAttribute('src', 'https://s3.example/v.mp4'))
    expect(api.getUrl).toHaveBeenCalledWith('v1', 'ver')
    expect(videoEl()).toHaveAttribute('controls')
    expect(videoEl()).not.toHaveAttribute('autoplay')
  })

  it('Esc cierra el modal', async () => {
    const { onClose } = setup()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Tab no se sale del modal (focus trap)', async () => {
    setup()
    await waitFor(() => expect(videoEl()).toHaveAttribute('src'))
    const close = screen.getByRole('button', { name: 'video.close' })
    // Con un solo elemento enfocable antes del <video controls>, Shift+Tab desde el primero vuelve al último.
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    close.focus()
    await userEvent.tab()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })

  it('si la URL vencida hace fallar el video, pide una nueva UNA vez automáticamente', async () => {
    api.getUrl
      .mockResolvedValueOnce({ url: 'https://s3.example/old.mp4', expires_at: '' })
      .mockResolvedValueOnce({ url: 'https://s3.example/new.mp4', expires_at: '' })
    setup()
    await waitFor(() => expect(videoEl()).toHaveAttribute('src', 'https://s3.example/old.mp4'))
    fireEvent.error(videoEl())
    await waitFor(() => expect(videoEl()).toHaveAttribute('src', 'https://s3.example/new.mp4'))
    expect(api.getUrl).toHaveBeenCalledTimes(2)
  })

  it('si vuelve a fallar muestra el error con Reintentar y Descargar como alternativa', async () => {
    const { onDownload } = setup()
    await waitFor(() => expect(videoEl()).toHaveAttribute('src'))
    fireEvent.error(videoEl())
    await waitFor(() => expect(api.getUrl).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(videoEl()).toHaveAttribute('src'))
    fireEvent.error(videoEl())

    expect(await screen.findByText('video.error')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /card.download/ }))
    expect(onDownload).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() => expect(api.getUrl).toHaveBeenCalledTimes(3))
  })

  it('error al pedir la URL muestra el estado de error', async () => {
    api.getUrl.mockRejectedValue(new Error('403'))
    setup()
    expect(await screen.findByText('video.error')).toBeInTheDocument()
  })
})
