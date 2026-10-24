import { describe, expect, it, vi, beforeEach } from 'vitest'
import { bodegaApi } from './bodegaApi'
import api from './authApi'

// SCRUM-1180 — «Ver formulario» y «Ver guía de entrega original» de Devoluciones generan/regeneran el PDF (escriben), así que el backend las
// expone por POST sin cuerpo. La respuesta `{ url }` no cambia: lo que ve el usuario de Bodega es idéntico.
vi.mock('./authApi', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const post = vi.mocked(api.post)
const get  = vi.mocked(api.get)

beforeEach(() => { post.mockReset(); get.mockReset() })

describe('bodegaApi.returns — documentos presignados por POST (SCRUM-1180)', () => {
  it('formUrl hace POST a /form SIN cuerpo y devuelve el { url } de la respuesta', async () => {
    post.mockResolvedValueOnce({ data: { url: 'https://s3.example/form.pdf' } })

    await expect(bodegaApi.returns.formUrl(7)).resolves.toEqual({ url: 'https://s3.example/form.pdf' })

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/bodega/returns/7/form')   // un solo argumento: sin cuerpo ni config
    expect(get).not.toHaveBeenCalled()
  })

  it('deliveryGuideUrl hace POST a /delivery-guide SIN cuerpo y devuelve el { url } de la respuesta', async () => {
    post.mockResolvedValueOnce({ data: { url: 'https://s3.example/guia.pdf' } })

    await expect(bodegaApi.returns.deliveryGuideUrl(7)).resolves.toEqual({ url: 'https://s3.example/guia.pdf' })

    expect(post).toHaveBeenCalledWith('/bodega/returns/7/delivery-guide')
    expect(get).not.toHaveBeenCalled()
  })

  it('un error del backend llega tal cual al llamador (mismo manejo de errores que antes)', async () => {
    const err = { response: { status: 404, data: { message: 'x' } } }
    post.mockRejectedValueOnce(err)

    await expect(bodegaApi.returns.formUrl(99)).rejects.toBe(err)
  })

  it('«documento firmado» sigue siendo GET: solo presigna lo ya subido y no escribe', async () => {
    get.mockResolvedValueOnce({ data: { url: 'https://s3.example/firmado.pdf' } })

    await bodegaApi.returns.signedDocumentUrl(7)

    expect(get).toHaveBeenCalledWith('/bodega/returns/7/signed-document')
    expect(post).not.toHaveBeenCalled()
  })
})
