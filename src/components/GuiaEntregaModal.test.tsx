import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import GuiaEntregaModal from './GuiaEntregaModal'
import { useOrderDetail, useOrderDocumentDownloadUrl } from '@/hooks/useBodega'
import type { OrderDetail } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/hooks/useBodega', () => ({
  useOrderDetail: vi.fn(),
  useOrderDocumentDownloadUrl: vi.fn(),
}))

const mockedUseOrderDetail = vi.mocked(useOrderDetail)
const mockedUseOrderDocumentDownloadUrl = vi.mocked(useOrderDocumentDownloadUrl)

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 1,
    order_number: '2205',
    order_type: 'pedido',
    stage: 'despachado',
    proyecto: 'Torre Azul',
    cliente: 'Constructora Pacífico',
    vendedor: 'Mark',
    asistente: 'Asistente Bodega Test 2',
    picker: null,
    repartidor: 'Juan Pérez',
    fecha_entrega_comprometida: '2026-08-01',
    is_atrasado: false,
    is_sin_stock: false,
    invoice_ready: true,
    family: { sequence_in_family: null, total_in_family: null, badge: null },
    items_summary: { product_count: 1, unit_count: 2 },
    items: [
      { id: 10, catalog_product_id: 1, reference: 'CAND-01', factory_reference: null, description: 'Candelabro', location: 'A-1', qty_requested: 2, qty_reserved: 2, qty_picked: 2, qty_delivered: 0, shortage_reason: null },
    ],
    documents: [{ id: 99, tipo: 'guia_entrega', created_at: '2026-07-20T10:00:00Z', received_by_name: null }],
    eta_proveedor: null,
    contacto_cliente: null,
    contacto_telefono: null,
    contacto_correo: null,
    direccion_entrega: null,
    cliente_master: 'Constructora Pacífico Holdings',
    subcliente: 'Constructora Pacífico',
    observaciones: null,
    ...overrides,
  }
}

let mutateMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mutateMock = vi.fn()
  mockedUseOrderDocumentDownloadUrl.mockReturnValue({ mutate: mutateMock, isPending: false } as unknown as ReturnType<typeof useOrderDocumentDownloadUrl>)
})

describe('GuiaEntregaModal', () => {
  /**
   * SCRUM-930 (Pre-QA, CRÍTICO) — un 403 (rol sin acceso al endpoint, antes de que Admin&Contab
   * tuviera el permiso) se veía idéntico a "Cargando..." para siempre porque no existía esta rama.
   */
  it('SCRUM-930 — un error de la query muestra el mensaje de error, no "Cargando..." para siempre', () => {
    mockedUseOrderDetail.mockReturnValue({ data: undefined, isLoading: false, isError: true } as ReturnType<typeof useOrderDetail>)
    render(<GuiaEntregaModal orderId={1} onClose={vi.fn()} />)

    expect(screen.getByText('bodega:pedidos.guideModal.error')).toBeInTheDocument()
    expect(screen.queryByText('common:labels.loading')).not.toBeInTheDocument()
  })

  it('RN2 — antes de firmarse (no "entregado") la firma queda pendiente, aunque ya haya repartidor asignado', () => {
    mockedUseOrderDetail.mockReturnValue({ data: detail({ stage: 'despachado' }), isLoading: false } as ReturnType<typeof useOrderDetail>)
    render(<GuiaEntregaModal orderId={1} onClose={vi.fn()} />)

    expect(screen.getByTestId('guide-signature')).toHaveTextContent('bodega:pedidos.guideModal.pendingSignature')
  })

  /**
   * Pre-QA 2026-07-23 (CRÍTICO) — la firma debe mostrar `received_by_name` (quien RECIBIÓ), nunca
   * `repartidor` (quien entregó) — antes de este fix mostraba el repartidor por error.
   */
  it('RN2 — una vez firmada ("entregado") la firma muestra a quien RECIBIÓ, no al repartidor', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({
        stage: 'entregado',
        repartidor: 'Juan Pérez', // el repartidor NO debe aparecer en la firma
        documents: [{ id: 99, tipo: 'guia_entrega', created_at: '2026-07-20T10:00:00Z', received_by_name: 'Ana Torres' }],
      }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    render(<GuiaEntregaModal orderId={1} onClose={vi.fn()} />)

    expect(screen.getByTestId('guide-signature')).toHaveTextContent('Ana Torres')
    expect(screen.getByTestId('guide-signature')).not.toHaveTextContent('Juan Pérez')
  })

  /**
   * Pre-QA 2026-07-23 (CRÍTICO) — un pedido "entregado" tiene 2 documentos `guia_entrega`: el
   * generado sin firmar (Por despachar) y el firmado real (Entregado). Debe tomarse el de mayor
   * `id` (más reciente) — si toma el primero, muestra el documento viejo sin `received_by_name`.
   */
  it('toma el documento guia_entrega más reciente cuando hay 2 (sin firmar + firmado)', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({
        stage: 'entregado',
        documents: [
          { id: 50, tipo: 'guia_entrega', created_at: '2026-07-18T09:00:00Z', received_by_name: null },
          { id: 99, tipo: 'guia_entrega', created_at: '2026-07-20T10:00:00Z', received_by_name: 'Ana Torres' },
        ],
      }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    render(<GuiaEntregaModal orderId={1} onClose={vi.fn()} />)

    expect(screen.getByTestId('guide-signature')).toHaveTextContent('Ana Torres')
  })

  it('RN1 — la tabla de artículos nunca muestra precios', () => {
    mockedUseOrderDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderDetail>)
    render(<GuiaEntregaModal orderId={1} onClose={vi.fn()} />)

    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
    expect(screen.getByText('bodega:pedidos.guideModal.noPrices')).toBeInTheDocument()
  })

  it('REQ-330 — muestra contacto y dirección de entrega cuando el backend los entrega', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({
        contacto_cliente: 'Juan Pérez (6000-1234)',
        direccion_entrega: 'Av. Balboa, Ciudad de Panamá',
      }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    render(<GuiaEntregaModal orderId={1} onClose={vi.fn()} />)

    expect(screen.getByText('Juan Pérez (6000-1234)')).toBeInTheDocument()
    expect(screen.getByText('Av. Balboa, Ciudad de Panamá')).toBeInTheDocument()
  })

  it('Lote 4 (SCRUM-395) — muestra teléfono y correo del contacto como campos separados', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({ contacto_telefono: '6000-1234', contacto_correo: 'juan.perez@example.com' }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    render(<GuiaEntregaModal orderId={1} onClose={vi.fn()} />)

    expect(screen.getByText('6000-1234')).toBeInTheDocument()
    expect(screen.getByText('juan.perez@example.com')).toBeInTheDocument()
  })

  /**
   * Rebote SCRUM-894 (Daniela, 2026-09-13) — el preview mostraba TODOS los items sin filtrar y
   * caía a `qty_requested` cuando `qty_delivered` era 0, mismo bug ya corregido en
   * `guia-entrega-pdf.blade.php` pero nunca en este componente (por eso modal y PDF descargado
   * mostraban cosas distintas). Caso real: 1 producto con 10 unidades realmente entregadas en
   * esta tarjeta y otro con 0 (sin stock) — el segundo no debe aparecer, y el primero debe
   * mostrar su cantidad real (10), nunca la pedida originalmente.
   */
  it('RN — la tabla de artículos solo muestra lo realmente entregado en esta tarjeta, nunca qty_requested como fallback', () => {
    mockedUseOrderDetail.mockReturnValue({
      data: detail({
        items: [
          { id: 20, catalog_product_id: 1, reference: 'COLG-COC-602', factory_reference: null, description: 'Colgante cocina 602', location: 'A-1', qty_requested: 10, qty_reserved: 10, qty_picked: 10, qty_delivered: 10, shortage_reason: null },
          { id: 21, catalog_product_id: 2, reference: 'BARRA-COC-601', factory_reference: null, description: 'Barra cocina 601', location: 'A-2', qty_requested: 10, qty_reserved: 0, qty_picked: 0, qty_delivered: 0, shortage_reason: 'sin_stock' },
        ],
      }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    render(<GuiaEntregaModal orderId={1} onClose={vi.fn()} />)

    expect(screen.getByText('COLG-COC-602')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.queryByText('BARRA-COC-601')).not.toBeInTheDocument()
  })

  it('muestra "no generada" cuando el pedido todavía no tiene una Guía de Entrega', () => {
    mockedUseOrderDetail.mockReturnValue({ data: detail({ documents: [] }), isLoading: false } as ReturnType<typeof useOrderDetail>)
    render(<GuiaEntregaModal orderId={1} onClose={vi.fn()} />)

    expect(screen.getByText('bodega:pedidos.guideModal.notGenerated')).toBeInTheDocument()
  })

  /**
   * Rebote SCRUM-395 (2026-08-19, Daniela) — "Imprimir" hacía `window.print()` sobre el HTML del
   * modal: el tablero de Pedidos oculto con `visibility:hidden` seguía paginándose de fondo
   * (10 páginas, 8 en blanco) y el navegador nunca repite un footer entre páginas impresas. El
   * documento real (dompdf, con pie de página fijo y paginación correctos) ya existe en
   * `order.documents` — "Imprimir" debe abrir ESE PDF (URL presignada), no imprimir una copia
   * HTML aparte. No borrar este test sin volver a romper manualmente el escenario primero.
   */
  it('"Imprimir" pide la URL presignada del documento guia_entrega real y la abre en pestaña nueva (no usa window.print)', () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    mockedUseOrderDetail.mockReturnValue({
      data: detail({ documents: [{ id: 99, tipo: 'guia_entrega', created_at: '2026-07-20T10:00:00Z', received_by_name: null }] }),
      isLoading: false,
    } as ReturnType<typeof useOrderDetail>)
    mutateMock.mockImplementation((_args, { onSuccess }) => {
      onSuccess({ url: 'https://s3.example.com/guia-entrega-99.pdf' })
    })
    render(<GuiaEntregaModal orderId={1} onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('bodega:pedidos.guideModal.print'))

    expect(mutateMock).toHaveBeenCalledWith(
      { orderId: 1, documentId: 99 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(windowOpenSpy).toHaveBeenCalledWith('https://s3.example.com/guia-entrega-99.pdf', '_blank', 'noopener,noreferrer')
    expect(printSpy).not.toHaveBeenCalled()

    windowOpenSpy.mockRestore()
    printSpy.mockRestore()
  })
})
