import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ManualesAdminPanel from './ManualesAdminPanel'
import { manualesApi } from '@/api/manualesApi'
import { AxiosError } from 'axios'
import type { AxiosResponse } from 'axios'
import { S3PutError, UploadAbortedError } from '@/lib/manuales'
import type { Manual } from '@/types/manuales'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}))

vi.mock('@/api/manualesApi', () => ({
  manualesApi: {
    list: vi.fn(), getUrl: vi.fn(), getConfig: vi.fn(),
    initUpload: vi.fn(), finalizeUpload: vi.fn(), remove: vi.fn(),
  },
}))

const putMock = vi.fn()
vi.mock('@/lib/manuales', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/manuales')>()
  return { ...actual, putFileToS3: (...args: unknown[]) => putMock(...args) }
})

const api = vi.mocked(manualesApi)
const MB = 1024 * 1024

const PUBLISHED: Manual[] = [
  { id: 'p1', name: 'Manual CRM', module: 'crm', type: 'pdf', size_bytes: MB, created_at: '2026-09-01T10:00:00Z' },
]

function renderPanel(manuales: Manual[] = PUBLISHED) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={qc}>
      <ManualesAdminPanel id="panel" open manuales={manuales} onBusyChange={() => undefined} />
    </QueryClientProvider>,
  )
  return { ...utils, invalidate }
}

function pick(file: File) {
  return userEvent.upload(screen.getByTestId('manual-file-input'), file)
}

async function fillValid(file = new File(['x'], 'Guia Bodega.pdf', { type: 'application/pdf' })) {
  await screen.findByTestId('manual-limits')
  await pick(file)
  await userEvent.selectOptions(screen.getByLabelText('admin.module'), 'bodega')
}

function httpError(status: number, data: unknown) {
  return new AxiosError('fallo', 'ERR_BAD_REQUEST', undefined, undefined, { status, data } as AxiosResponse)
}

const FAR_FUTURE = '2099-01-01T00:00:00Z'
const INIT = { upload_id: 'u1', url: 'https://s3.example/put', headers: { 'Content-Type': 'application/pdf' } }

const uploadButton = () => screen.getByRole('button', { name: 'admin.upload' })

beforeEach(() => {
  vi.clearAllMocks()
  api.getConfig.mockResolvedValue({
    max_pdf_bytes: 50 * MB, max_video_bytes: 500 * MB, allowed_extensions: ['pdf', 'mp4', 'webm'], modules: [],
  })
  api.initUpload.mockResolvedValue(INIT)
  api.finalizeUpload.mockResolvedValue(PUBLISHED[0])
  putMock.mockResolvedValue(undefined)
})

describe('ManualesAdminPanel', () => {
  it('muestra los límites que vienen de la configuración, no de una constante', async () => {
    api.getConfig.mockResolvedValue({
      max_pdf_bytes: 20 * MB, max_video_bytes: 300 * MB, allowed_extensions: ['pdf', 'mp4', 'webm'], modules: [],
    })
    renderPanel()
    const helper = await screen.findByTestId('manual-limits')
    expect(helper).toHaveTextContent('"pdf":20')
    expect(helper).toHaveTextContent('"video":300')
  })

  it('archivo de formato no permitido: error inline y Subir deshabilitado', async () => {
    renderPanel()
    await screen.findByTestId('manual-limits')
    // applyAccept:false para saltarse el filtro accept del input, como hace un drag & drop.
    await userEvent.setup({ applyAccept: false }).upload(
      screen.getByTestId('manual-file-input'),
      new File(['x'], 'virus.exe', { type: 'application/octet-stream' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('admin.errType')
    expect(uploadButton()).toBeDisabled()
  })

  it('PDF sobre el límite: muestra el tope de la configuración', async () => {
    renderPanel()
    await screen.findByTestId('manual-limits')
    const big = new File(['x'], 'grande.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: 60 * MB })
    await pick(big)
    expect(await screen.findByRole('alert')).toHaveTextContent('admin.errSizePdf {"max":50}')
    expect(uploadButton()).toBeDisabled()
  })

  it('prellena el nombre con el del archivo sin extensión y exige módulo', async () => {
    renderPanel()
    await screen.findByTestId('manual-limits')
    await pick(new File(['x'], 'Guia Bodega.pdf', { type: 'application/pdf' }))
    expect(screen.getByLabelText('admin.name')).toHaveValue('Guia Bodega')
    expect(uploadButton()).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('admin.module'), 'bodega')
    expect(uploadButton()).toBeEnabled()
  })

  it('flujo completo: init -> PUT a S3 -> finalize -> refresca el listado', async () => {
    const { invalidate } = renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())

    await waitFor(() => expect(api.finalizeUpload).toHaveBeenCalledWith('u1'))
    expect(api.initUpload).toHaveBeenCalledWith({
      module: 'bodega', name: 'Guia Bodega', filename: 'Guia Bodega.pdf', content_type: 'application/pdf', size_bytes: 1,
    })
    expect(putMock).toHaveBeenCalledTimes(1)
    expect(putMock.mock.calls[0][0]).toBe('https://s3.example/put')
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['manuales'] }))
    // El formulario se limpia al terminar.
    await waitFor(() => expect(screen.getByLabelText('admin.name')).toHaveValue(''))
  })

  it('muestra la barra de progreso con aria-valuenow mientras sube y permite cancelar', async () => {
    const abort = vi.fn()
    putMock.mockImplementation((_u, _h, _f, onProgress: (l: number, t: number) => void, onXhr: (x: unknown) => void) =>
      new Promise((_resolve, reject) => {
        onXhr({ abort: () => { abort(); reject(new UploadAbortedError()) } })
        onProgress(25, 100)
      }))
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())

    const bar = await screen.findByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '25')

    await userEvent.click(screen.getByRole('button', { name: 'admin.cancel' }))
    expect(abort).toHaveBeenCalled()
    expect(await screen.findByText('admin.cancelled')).toBeInTheDocument()
    // Los datos se conservan para volver a intentarlo.
    expect(screen.getByLabelText('admin.name')).toHaveValue('Guia Bodega')
    expect(api.finalizeUpload).not.toHaveBeenCalled()
  })

  it('403 de S3 (firma vencida o inválida): Reintentar pide una URL prefirmada nueva', async () => {
    putMock.mockRejectedValueOnce(new S3PutError(403))
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())

    expect(await screen.findByText('admin.uploadError')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'retry' }))

    await waitFor(() => expect(api.finalizeUpload).toHaveBeenCalledTimes(1))
    expect(api.initUpload).toHaveBeenCalledTimes(2)
  })

  it('fallo de red en el PUT con la URL vigente: Reintentar reutiliza la misma URL sin gastar otro cupo', async () => {
    api.initUpload.mockResolvedValue({ ...INIT, expires_at: FAR_FUTURE })
    putMock.mockRejectedValueOnce(new Error('network'))
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())

    expect(await screen.findByText('admin.uploadError')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'retry' }))

    await waitFor(() => expect(api.finalizeUpload).toHaveBeenCalledTimes(1))
    expect(api.initUpload).toHaveBeenCalledTimes(1)
    expect(putMock).toHaveBeenCalledTimes(2)
    expect(putMock.mock.calls[1][0]).toBe(putMock.mock.calls[0][0])
  })

  it('si la URL prefirmada ya venció (o no trae fecha), Reintentar pide un init nuevo', async () => {
    api.initUpload.mockResolvedValue({ ...INIT, expires_at: '2020-01-01T00:00:00Z' })
    putMock.mockRejectedValueOnce(new Error('network'))
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())
    expect(await screen.findByText('admin.uploadError')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'retry' }))

    await waitFor(() => expect(api.finalizeUpload).toHaveBeenCalledTimes(1))
    expect(api.initUpload).toHaveBeenCalledTimes(2)
  })

  it('si el PUT ya terminó y falla el finalize (5xx), Reintentar solo repite el finalize', async () => {
    api.initUpload.mockResolvedValue({ ...INIT, expires_at: FAR_FUTURE })
    api.finalizeUpload.mockRejectedValueOnce(httpError(503, { message: 'no disponible' }))
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())
    expect(await screen.findByText('no disponible')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'retry' }))

    await waitFor(() => expect(api.finalizeUpload).toHaveBeenCalledTimes(2))
    expect(api.finalizeUpload).toHaveBeenLastCalledWith('u1')
    expect(api.initUpload).toHaveBeenCalledTimes(1)
    expect(putMock).toHaveBeenCalledTimes(1)
  })

  it('finalize ya en curso (409 o code finalize_in_progress): ofrece Reintentar y repite solo el finalize', async () => {
    api.initUpload.mockResolvedValue({ ...INIT, expires_at: FAR_FUTURE })
    api.finalizeUpload
      .mockRejectedValueOnce(httpError(409, { message: 'Esta subida ya se está finalizando. Espera unos segundos.' }))
      .mockRejectedValueOnce(httpError(422, { code: 'finalize_in_progress', message: 'Esta subida ya se está finalizando.' }))
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())

    expect(await screen.findByText('Esta subida ya se está finalizando. Espera unos segundos.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(await screen.findByText('Esta subida ya se está finalizando.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'retry' }))

    await waitFor(() => expect(api.finalizeUpload).toHaveBeenCalledTimes(3))
    expect(api.initUpload).toHaveBeenCalledTimes(1)
    expect(putMock).toHaveBeenCalledTimes(1)
  })

  it('404 del finalize (la subida expiró): Reintentar empieza de cero con un init nuevo', async () => {
    api.initUpload.mockResolvedValue({ ...INIT, expires_at: FAR_FUTURE })
    api.finalizeUpload.mockRejectedValueOnce(httpError(404, { message: 'La subida no existe o expiró.' }))
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())
    expect(await screen.findByText('La subida no existe o expiró.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'retry' }))

    await waitFor(() => expect(api.finalizeUpload).toHaveBeenCalledTimes(2))
    expect(api.initUpload).toHaveBeenCalledTimes(2)
    expect(putMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['guia.pdf', '', 'application/pdf'],
    ['guia.pdf', 'application/octet-stream', 'application/pdf'],
    ['clase.mp4', '', 'video/mp4'],
    ['clase.mp4', 'video/x-m4v', 'video/mp4'],
    ['clase.webm', 'application/octet-stream', 'video/webm'],
  ])('content_type sale de la extensión y no de file.type: %s con type "%s" -> %s', async (filename, type, expected) => {
    api.initUpload.mockResolvedValue({ ...INIT, headers: {} })
    renderPanel()
    await fillValid(new File(['x'], filename, { type }))
    await userEvent.click(uploadButton())

    await waitFor(() => expect(api.finalizeUpload).toHaveBeenCalled())
    expect(api.initUpload).toHaveBeenCalledWith(expect.objectContaining({ content_type: expected }))
    // El PUT siempre lleva el mismo Content-Type, aunque el backend no lo devuelva en `headers`.
    expect(putMock.mock.calls[0][1]).toEqual({ 'Content-Type': expected })
  })

  it('si el backend firmó un Content-Type en `headers`, ese valor manda en el PUT', async () => {
    api.initUpload.mockResolvedValue({ ...INIT, headers: { 'Content-Type': 'application/pdf', 'x-amz-meta-origen': 'biblioteca' } })
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())

    await waitFor(() => expect(api.finalizeUpload).toHaveBeenCalled())
    expect(putMock.mock.calls[0][1]).toEqual({ 'Content-Type': 'application/pdf', 'x-amz-meta-origen': 'biblioteca' })
  })

  it('422 al iniciar la subida: muestra el mensaje del backend y NO ofrece Reintentar', async () => {
    api.initUpload.mockRejectedValueOnce(httpError(422, {
      message: 'Tienes demasiadas subidas pendientes.', errors: { module: ['Tienes demasiadas subidas pendientes.'] },
    }))
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())

    expect(await screen.findByText('Tienes demasiadas subidas pendientes.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.discard' })).toBeInTheDocument()
    expect(putMock).not.toHaveBeenCalled()
  })

  it('422 del finalize (contenido rechazado): mensaje del backend, sin Reintentar', async () => {
    api.finalizeUpload.mockRejectedValueOnce(httpError(422, { message: 'El contenido del archivo no corresponde a su formato.' }))
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())

    expect(await screen.findByText('El contenido del archivo no corresponde a su formato.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'retry' })).not.toBeInTheDocument()
  })

  it('422 sin cuerpo útil: texto genérico de rechazo y sin Reintentar', async () => {
    api.initUpload.mockRejectedValueOnce(httpError(422, {}))
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())

    expect(await screen.findByText('admin.uploadRejected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'retry' })).not.toBeInTheDocument()
  })

  it('5xx del backend: ofrece Reintentar', async () => {
    api.finalizeUpload.mockRejectedValueOnce(httpError(503, { message: 'La biblioteca de manuales no está disponible en este momento.' }))
    renderPanel()
    await fillValid()
    await userEvent.click(uploadButton())

    expect(await screen.findByText('La biblioteca de manuales no está disponible en este momento.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument()
  })

  it('el accept del input sale de allowed_extensions de la configuración', async () => {
    api.getConfig.mockResolvedValue({
      max_pdf_bytes: 50 * MB, max_video_bytes: 500 * MB, allowed_extensions: ['pdf'], modules: [],
    })
    renderPanel()
    await screen.findByTestId('manual-limits')
    expect(screen.getByTestId('manual-file-input')).toHaveAttribute('accept', '.pdf')
  })

  it('borrar pide confirmación (alertdialog con foco en Cancelar) y recién ahí elimina', async () => {
    api.remove.mockResolvedValue(undefined)
    const { invalidate } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'admin.deleteAria {"name":"Manual CRM"}' }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('admin.deleteBody {"name":"Manual CRM"}')
    expect(within(dialog).getByRole('button', { name: 'admin.cancel' })).toHaveFocus()
    expect(api.remove).not.toHaveBeenCalled()

    const confirm = within(dialog).getByRole('button', { name: 'admin.delete' })
    await userEvent.click(confirm)
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['manuales'] }))
  })

  it('cancelar el borrado no elimina nada', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'admin.deleteAria {"name":"Manual CRM"}' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(api.remove).not.toHaveBeenCalled()
  })
})
