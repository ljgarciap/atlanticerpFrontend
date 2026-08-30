import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QuotePartCard from './QuotePartCard'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { QuotePartRef, QuoteItemRef } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    quotes: {
      parts: {
        update: vi.fn(), remove: vi.fn(),
        items: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), bulkCreate: vi.fn(), previewPrice: vi.fn() },
      },
    },
    catalogProducts: { search: vi.fn(), get: vi.fn() },
    catalogProductFamilies: { list: vi.fn(), get: vi.fn() },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeItem(overrides: Partial<QuoteItemRef> = {}): QuoteItemRef {
  return {
    id: 1, catalog_product_id: null, is_custom: true,
    reference: 'REF-1', description: 'Lámpara', quantity: 2, unit_price: 100, cost: null,
    price_type_override: null, discount_percent: null, effective_unit_price: 100, line_total: 200,
    stock_quantity: null, below_min_margin: false,
    ...overrides,
  }
}

function makePart(overrides: Partial<QuotePartRef> = {}): QuotePartRef {
  return { id: 1, name: 'Partida 1', position: 0, subtotal: 200, items: [makeItem()], ...overrides }
}

function renderCard(part: QuotePartRef, canEdit = true, discountMode: 'line' | 'global' = 'line') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <QuotePartCard quoteId={1} part={part} discountMode={discountMode} canEdit={canEdit} minMarginPercent={30} quotePriceType="public" />
    </QueryClientProvider>,
  )
}

// El modal de precio no asocia <label>/<input> vía htmlFor/id (mismo patrón que
// el resto de la pantalla, ver QuotePage.test.tsx) — se ubica por texto del label.
async function findPriceDraftInput(): Promise<HTMLInputElement> {
  const label = await screen.findByText('ventasDiseno:quote.item.newPrice')
  return label.parentElement!.querySelector('input') as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.quotes.parts.items.previewPrice.mockResolvedValue({
    violates_margin: false, can_override: false, message: null, min_margin_percent: 30,
  })
  mockedApi.catalogProducts.get.mockResolvedValue({
    id: 9, reference: 'CAT-9', factory_reference: null, description: 'Producto', brand: null, photo_url: null, price_full: 200, stock_quantity: null,
  })
})

describe('QuotePartCard', () => {
  it('muestra el subtotal de la partida', () => {
    renderCard(makePart())
    expect(screen.getByText(/ventasDiseno:quote.item.subtotal/)).toBeInTheDocument()
    // $200 aparece 2 veces: el total de línea del ítem y el subtotal de la partida.
    expect(screen.getAllByText(/\$200/)).toHaveLength(2)
  })

  it('renombra la partida al perder foco si cambió', async () => {
    renderCard(makePart())
    const nameInput = screen.getByDisplayValue('Partida 1')
    fireEvent.change(nameInput, { target: { value: 'Partida Renombrada' } })
    fireEvent.blur(nameInput)

    await waitFor(() => expect(mockedApi.quotes.parts.update).toHaveBeenCalledWith(1, 1, 'Partida Renombrada'))
  })

  it('no renombra si el valor no cambió', () => {
    renderCard(makePart())
    const nameInput = screen.getByDisplayValue('Partida 1')
    fireEvent.blur(nameInput)
    expect(mockedApi.quotes.parts.update).not.toHaveBeenCalled()
  })

  it('borra la partida', async () => {
    renderCard(makePart())
    // El primer botón "delete" en el DOM es el de la partida (antes de la tabla de ítems).
    fireEvent.click(screen.getAllByText('common:actions.delete')[0])
    await waitFor(() => expect(mockedApi.quotes.parts.remove).toHaveBeenCalledWith(1, 1))
  })

  it('crea un ítem nuevo', async () => {
    mockedApi.quotes.parts.items.create.mockResolvedValue(makeItem({ id: 2 }))
    renderCard(makePart({ items: [] }))

    fireEvent.click(screen.getByText('ventasDiseno:quote.item.addItem'))
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.item.reference'), { target: { value: 'REF-2' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.item.description'), { target: { value: 'Nueva' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.item.quantity'), { target: { value: '3' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.item.unitPrice'), { target: { value: '50' } })

    fireEvent.click(screen.getByText('common:actions.add'))

    await waitFor(() => expect(mockedApi.quotes.parts.items.create).toHaveBeenCalledWith(1, 1, {
      reference: 'REF-2', description: 'Nueva', quantity: 3, unit_price: 50, cost: null,
      discount_percent: null, price_type_override: null,
    }))
  })

  // SCRUM-734 (sección 9) — catálogo completo al abrir la lupa sin escribir nada.
  it('muestra el catálogo completo al abrir la lupa, sin necesidad de tipear', async () => {
    mockedApi.catalogProducts.search.mockResolvedValue({
      fuzzy: false,
      data: [{ id: 9, reference: 'LAMP-050', factory_reference: null, description: 'Lámpara colgante LED', brand: 'Atlantic Home', photo_url: null, price_full: 189.99, stock_quantity: 10 }],
    })
    renderCard(makePart({ items: [] }))

    fireEvent.click(screen.getByText('ventasDiseno:quote.item.addItem'))
    fireEvent.click(screen.getByText('ventasDiseno:catalog.searchButton'))

    await waitFor(() => expect(mockedApi.catalogProducts.search).toHaveBeenCalledWith(''))
    expect(await screen.findByText('LAMP-050', { exact: false })).toBeInTheDocument()
  })

  // SCRUM-796 (secc. 6) — el backend ya no busca por heurística (FuzzySearchService,
  // REQ-036), solo exacta/parcial — `fuzzy` queda fijo en `false` y el picker ya no
  // muestra ningún banner de "resultado aproximado".
  it('busca en el catálogo por coincidencia exacta/parcial, sin banner de aproximados', async () => {
    mockedApi.catalogProducts.search.mockResolvedValue({
      fuzzy: false,
      data: [{ id: 9, reference: 'LAMP-050', factory_reference: null, description: 'Lámpara colgante LED', brand: 'Atlantic Home', photo_url: null, price_full: 189.99, stock_quantity: 10 }],
    })
    renderCard(makePart({ items: [] }))

    fireEvent.click(screen.getByText('ventasDiseno:quote.item.addItem'))
    fireEvent.click(screen.getByText('ventasDiseno:catalog.searchButton'))
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:catalog.searchPlaceholder'), { target: { value: 'LAMP-050' } })

    await waitFor(() => expect(mockedApi.catalogProducts.search).toHaveBeenCalledWith('LAMP-050'))
    expect(await screen.findByText('LAMP-050', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:catalog.fuzzyBanner')).not.toBeInTheDocument()
  })

  // SCRUM-796 (secc. 5) — búsqueda dinámica mientras se escribe en Referencia, sin abrir el
  // modal de "Buscar en catálogo" (que sigue intacto, cubierto por los tests de arriba).
  it('SCRUM-796 — escribir en Referencia dispara búsqueda dinámica (debounce) y autocompleta al elegir', async () => {
    mockedApi.catalogProducts.search.mockResolvedValue({
      fuzzy: false,
      data: [{ id: 9, reference: 'LAMP-050', factory_reference: null, description: 'Lámpara colgante LED', brand: 'Atlantic Home', photo_url: null, price_full: 189.99, stock_quantity: 10 }],
    })
    renderCard(makePart({ items: [] }))

    fireEvent.click(screen.getByText('ventasDiseno:quote.item.addItem'))
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.item.reference'), { target: { value: 'LAMP' } })

    // No dispara en cada tecla — recién tras el debounce.
    expect(mockedApi.catalogProducts.search).not.toHaveBeenCalledWith('LAMP')
    await waitFor(() => expect(mockedApi.catalogProducts.search).toHaveBeenCalledWith('LAMP'), { timeout: 1000 })

    const row = await screen.findByText('LAMP-050', { exact: false })
    expect(screen.getByText('10 disp.', { exact: false })).toBeInTheDocument()
    fireEvent.mouseDown(row)

    // Mismo autocompletado que seleccionar desde el modal completo (catalog_product_id +
    // reference/description/unit_price resueltos), sin precio propio.
    fireEvent.click(screen.getByText('common:actions.add'))
    await waitFor(() => expect(mockedApi.quotes.parts.items.create).toHaveBeenCalledWith(1, 1, {
      catalog_product_id: 9, quantity: 1, unit_price_override: 189.99, discount_percent: null, price_type_override: null,
    }))
  })

  it('selecciona un producto de catálogo, ve la ficha técnica y crea el ítem sin precio propio', async () => {
    mockedApi.catalogProducts.search.mockResolvedValue({
      fuzzy: false,
      data: [{ id: 9, reference: 'LAMP-050', factory_reference: null, description: 'Lámpara colgante LED', brand: 'Atlantic Home', photo_url: null, price_full: 189.99, stock_quantity: 10 }],
    })
    mockedApi.quotes.parts.items.create.mockResolvedValue(makeItem({ id: 2, catalog_product_id: 9, is_custom: false }))
    renderCard(makePart({ items: [] }))

    fireEvent.click(screen.getByText('ventasDiseno:quote.item.addItem'))
    fireEvent.click(screen.getByText('ventasDiseno:catalog.searchButton'))
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:catalog.searchPlaceholder'), { target: { value: 'lampara' } })
    fireEvent.click(await screen.findByText('LAMP-050', { exact: false }))

    // Ficha técnica (REQ-036 AC2): marca, disponible, precio — nunca costo.
    expect(await screen.findByText(/Atlantic Home/)).toBeInTheDocument()
    expect(screen.getByText('$189.99')).toBeInTheDocument()

    fireEvent.click(screen.getByText('ventasDiseno:catalog.selectProduct'))
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.item.quantity'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('common:actions.add'))

    // SCRUM-725 — unit_price_override siempre viaja con el valor actual del campo
    // (acá el precio del catálogo, sin tocar) — nunca "sin precio propio" a secas.
    await waitFor(() => expect(mockedApi.quotes.parts.items.create).toHaveBeenCalledWith(1, 1, {
      catalog_product_id: 9, quantity: 2, unit_price_override: 189.99, discount_percent: null, price_type_override: null,
    }))
  })

  it('bloquea reference/description en la fila de un ítem de catálogo', () => {
    renderCard(makePart({ items: [makeItem({ catalog_product_id: 9, is_custom: false })] }))

    const referenceInput = screen.getByDisplayValue('REF-1')
    const descriptionInput = screen.getByDisplayValue('Lámpara')

    expect(referenceInput).toBeDisabled()
    expect(descriptionInput).toBeDisabled()
  })

  // SCRUM-725 — a diferencia de reference/description de arriba, el precio de venta
  // de un ítem de catálogo SÍ se puede modificar dentro de la cotización (viaja
  // como unit_price_override, nunca toca CatalogProduct::price_full).
  // SCRUM-734 (sección 9, RN9.1) — el precio ya no se edita escribiendo directo,
  // abre el modal dedicado (botón que muestra "$100.00").
  it('permite modificar el precio de un ítem de catálogo vía el modal (unit_price_override)', async () => {
    mockedApi.quotes.parts.items.update.mockResolvedValue(makeItem({ catalog_product_id: 9, is_custom: false, unit_price: 150 }))
    renderCard(makePart({ items: [makeItem({ catalog_product_id: 9, is_custom: false })] }))

    const priceButton = screen.getByText('$100.00')
    expect(priceButton).not.toBeDisabled()
    fireEvent.click(priceButton)

    const priceDraftInput = await findPriceDraftInput()
    fireEvent.change(priceDraftInput, { target: { value: '150' } })
    fireEvent.click(screen.getByText('ventasDiseno:quote.save'))

    await waitFor(() => expect(mockedApi.quotes.parts.items.update).toHaveBeenCalledWith(1, 1, 1, expect.objectContaining({
      catalog_product_id: 9, unit_price_override: 150,
    })))
  })

  it('el modal de precio muestra el Precio de catálogo de referencia para un ítem vinculado', async () => {
    renderCard(makePart({ items: [makeItem({ catalog_product_id: 9, is_custom: false })] }))
    fireEvent.click(screen.getByText('$100.00'))

    await waitFor(() => expect(mockedApi.catalogProducts.get).toHaveBeenCalledWith(9))
    // "$200.00" (price_full del mock) también aparece en el Total de línea de la
    // fila — se ubica específicamente el bloque del label "Precio de catálogo".
    const label = await screen.findByText('ventasDiseno:quote.item.catalogPriceReference')
    expect(label.parentElement).toHaveTextContent('$200.00')
  })

  it('el modal de precio bloquea Guardar si el preview marca violación de margen', async () => {
    mockedApi.quotes.parts.items.previewPrice.mockResolvedValue({
      violates_margin: true, can_override: false, message: 'Este cambio dejaría el margen por debajo del mínimo permitido (30%)', min_margin_percent: 30,
    })
    renderCard(makePart({ items: [makeItem()] }))
    fireEvent.click(screen.getByText('$100.00'))

    const priceDraftInput = await findPriceDraftInput()
    fireEvent.change(priceDraftInput, { target: { value: '60' } })

    expect(await screen.findByText('Este cambio dejaría el margen por debajo del mínimo permitido (30%)')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:quote.save')).toBeDisabled()
    expect(mockedApi.quotes.parts.items.update).not.toHaveBeenCalled()
  })

  it('Cancelar en el modal de precio cierra sin llamar al backend ni cambiar el precio', async () => {
    renderCard(makePart({ items: [makeItem()] }))
    fireEvent.click(screen.getByText('$100.00'))

    const priceDraftInput = await findPriceDraftInput()
    fireEvent.change(priceDraftInput, { target: { value: '999' } })
    fireEvent.click(screen.getByText('common:actions.cancel'))

    expect(screen.queryByText('ventasDiseno:quote.item.newPrice')).not.toBeInTheDocument()
    expect(mockedApi.quotes.parts.items.update).not.toHaveBeenCalled()
    expect(screen.getByText('$100.00')).toBeInTheDocument()
  })

  it('muestra el error del backend al crear un ítem duplicado', async () => {
    mockedApi.quotes.parts.items.create.mockRejectedValue({
      isAxiosError: true, response: { data: { message: 'Esta referencia ya existe' } },
    })
    renderCard(makePart({ items: [] }))

    fireEvent.click(screen.getByText('ventasDiseno:quote.item.addItem'))
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.item.reference'), { target: { value: 'REF-1' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.item.description'), { target: { value: 'X' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.item.quantity'), { target: { value: '1' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.item.unitPrice'), { target: { value: '10' } })
    fireEvent.click(screen.getByText('common:actions.add'))

    expect(await screen.findByText('Esta referencia ya existe')).toBeInTheDocument()
  })

  it('el botón Guardar de la línea solo aparece cuando el ítem cambió', () => {
    renderCard(makePart())
    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()

    const quantityInput = screen.getByDisplayValue('2')
    fireEvent.change(quantityInput, { target: { value: '5' } })
    expect(screen.getByText('common:actions.save')).toBeInTheDocument()
  })

  it('resincroniza la fila cuando el servidor resetea el descuento (SCRUM-133)', () => {
    // Fila arranca con 10% de descuento por línea.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <QuotePartCard quoteId={1} part={makePart({ items: [makeItem({ discount_percent: 10 })] })} discountMode="line" canEdit minMarginPercent={30} quotePriceType="public" />
      </QueryClientProvider>,
    )
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()

    // El servidor resetea discount_percent a null (ej. tras cambiar el modo de
    // descuento y volver) — la fila NO remonta (misma key={item.id}), antes del
    // fix seguía mostrando "10" y reaparecía el botón Guardar.
    rerender(
      <QueryClientProvider client={queryClient}>
        <QuotePartCard quoteId={1} part={makePart({ items: [makeItem({ discount_percent: null })] })} discountMode="line" canEdit minMarginPercent={30} quotePriceType="public" />
      </QueryClientProvider>,
    )

    expect(screen.queryByDisplayValue('10')).not.toBeInTheDocument()
    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()
  })

  it('Descuento % acepta coma como separador decimal (SCRUM-132/133)', () => {
    // cost fijo en un valor no-vacío para que el único input vacío de la fila sea
    // Descuento % (evita ambigüedad con getByDisplayValue('')).
    renderCard(makePart({ items: [makeItem({ discount_percent: null, cost: 50 })] }))

    const discountInput = screen.getByDisplayValue('')
    fireEvent.change(discountInput, { target: { value: '10,5' } })
    expect(screen.getByDisplayValue('10.5')).toBeInTheDocument()
  })

  it('Descuento % descarta el signo negativo al tipear (SCRUM-132/133)', () => {
    renderCard(makePart({ items: [makeItem({ discount_percent: null, cost: 50 })] }))

    const discountInput = screen.getByDisplayValue('')
    fireEvent.change(discountInput, { target: { value: '-5' } })
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
  })

  it('Descuento % se clampa a 100 al salir del campo (SCRUM-132/133)', () => {
    renderCard(makePart({ items: [makeItem({ discount_percent: null, cost: 50 })] }))

    const discountInput = screen.getByDisplayValue('')
    fireEvent.change(discountInput, { target: { value: '150' } })
    // SCRUM-734 — descubierto al reemplazar el input de precio por un botón (que
    // coincidía por casualidad con displayValue '100' y enmascaraba este gap):
    // fireEvent.blur() no dispara el onBlur de React en este entorno jsdom/RTL
    // (React 18 delega blur vía el evento "focusout", que sí burbujea; el nativo
    // "blur" no). No es un bug real de la feature (en un navegador real blur SÍ
    // dispara onBlur) — fireEvent.focusOut() es el que replica el comportamiento
    // real acá.
    fireEvent.focusOut(discountInput, { target: { value: '150' } })
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })

  it('guarda los cambios de un ítem editado', async () => {
    mockedApi.quotes.parts.items.update.mockResolvedValue(makeItem({ quantity: 5, line_total: 500 }))
    renderCard(makePart())

    const quantityInput = screen.getByDisplayValue('2')
    fireEvent.change(quantityInput, { target: { value: '5' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.quotes.parts.items.update).toHaveBeenCalledWith(1, 1, 1, {
      reference: 'REF-1', description: 'Lámpara', quantity: 5, unit_price: 100, cost: null,
      discount_percent: null, price_type_override: null,
    }))
  })

  it('borra un ítem', async () => {
    renderCard(makePart())
    const deleteButtons = screen.getAllByText('common:actions.delete')
    // El primero es el de la partida; el de la fila del ítem es el segundo.
    fireEvent.click(deleteButtons[1])
    await waitFor(() => expect(mockedApi.quotes.parts.items.remove).toHaveBeenCalledWith(1, 1, 1))
  })

  it('no muestra controles de edición cuando canEdit es false', () => {
    renderCard(makePart(), false)
    expect(screen.queryByText('common:actions.delete')).not.toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:quote.item.addItem')).not.toBeInTheDocument()
  })

  it('oculta la columna de descuento por línea en modo global', () => {
    renderCard(makePart(), true, 'global')
    expect(screen.queryByText('ventasDiseno:quote.item.discount')).not.toBeInTheDocument()
  })

  it('muestra el precio efectivo cuando difiere del precio tecleado (REQ-033)', () => {
    renderCard(makePart({ items: [makeItem({ unit_price: 100, effective_unit_price: 85 })] }))
    expect(screen.getByText('→ $85.00')).toBeInTheDocument()
  })

  it('no muestra el precio efectivo cuando coincide con el precio tecleado', () => {
    renderCard(makePart({ items: [makeItem({ unit_price: 100, effective_unit_price: 100 })] }))
    expect(screen.queryByText(/→ \$/)).not.toBeInTheDocument()
  })

  // REQ-039 (2026-07-13) — alerta de stock insuficiente.
  it('muestra alerta de stock insuficiente al editar la cantidad por encima del disponible', () => {
    renderCard(makePart({ items: [makeItem({ catalog_product_id: 9, is_custom: false, stock_quantity: 5, quantity: 2 })] }))

    const quantityInput = screen.getByDisplayValue('2')
    fireEvent.change(quantityInput, { target: { value: '8' } })

    expect(screen.getByText('ventasDiseno:catalog.insufficientStock')).toBeInTheDocument()
  })

  it('no muestra alerta de stock cuando la cantidad no supera el disponible', () => {
    renderCard(makePart({ items: [makeItem({ catalog_product_id: 9, is_custom: false, stock_quantity: 5, quantity: 2 })] }))

    const quantityInput = screen.getByDisplayValue('2')
    fireEvent.change(quantityInput, { target: { value: '5' } })

    expect(screen.queryByText('ventasDiseno:catalog.insufficientStock')).not.toBeInTheDocument()
  })

  it('no muestra alerta de stock para un producto sin control de stock (stock_quantity null)', () => {
    renderCard(makePart({ items: [makeItem({ catalog_product_id: 9, is_custom: false, stock_quantity: null, quantity: 2 })] }))

    const quantityInput = screen.getByDisplayValue('2')
    fireEvent.change(quantityInput, { target: { value: '999' } })

    expect(screen.queryByText('ventasDiseno:catalog.insufficientStock')).not.toBeInTheDocument()
  })

  it('muestra alerta de stock insuficiente al agregar un ítem nuevo de catálogo', async () => {
    mockedApi.catalogProducts.search.mockResolvedValue({
      fuzzy: false,
      data: [{ id: 9, reference: 'LAMP-050', factory_reference: null, description: 'Lámpara colgante LED', brand: 'Atlantic Home', photo_url: null, price_full: 189.99, stock_quantity: 3 }],
    })
    renderCard(makePart({ items: [] }))

    fireEvent.click(screen.getByText('ventasDiseno:quote.item.addItem'))
    fireEvent.click(screen.getByText('ventasDiseno:catalog.searchButton'))
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:catalog.searchPlaceholder'), { target: { value: 'lampara' } })
    fireEvent.click(await screen.findByText('LAMP-050', { exact: false }))
    fireEvent.click(screen.getByText('ventasDiseno:catalog.selectProduct'))

    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:quote.item.quantity'), { target: { value: '10' } })

    expect(screen.getByText('ventasDiseno:catalog.insufficientStock')).toBeInTheDocument()
  })

  // REQ-037 (2026-07-13) — tab "Familias", alta en lote.
  it('lista familias, muestra el detalle y agrega todos sus productos en lote', async () => {
    mockedApi.catalogProductFamilies.list.mockResolvedValue({
      data: [{ id: 3, name: 'Kit Baño', description: null, products_count: 2 }],
    })
    mockedApi.catalogProductFamilies.get.mockResolvedValue({
      id: 3, name: 'Kit Baño', description: 'Combo para baños',
      products: [
        { id: 11, reference: 'SPOT-1', factory_reference: null, description: 'Spot 1', brand: null, photo_url: null, price_full: 20, stock_quantity: null },
        { id: 12, reference: 'SPOT-2', factory_reference: null, description: 'Spot 2', brand: null, photo_url: null, price_full: 25, stock_quantity: null },
      ],
    })
    mockedApi.quotes.parts.items.bulkCreate.mockResolvedValue({ created: [], skipped_catalog_product_ids: [] })
    renderCard(makePart({ items: [] }))

    fireEvent.click(screen.getByText('ventasDiseno:quote.item.addItem'))
    fireEvent.click(screen.getByText('ventasDiseno:catalog.searchButton'))
    fireEvent.click(screen.getByText('ventasDiseno:catalog.tabFamilies'))

    await waitFor(() => expect(mockedApi.catalogProductFamilies.list).toHaveBeenCalled())
    fireEvent.click(await screen.findByText('Kit Baño'))

    await waitFor(() => expect(mockedApi.catalogProductFamilies.get).toHaveBeenCalledWith(3))
    expect(await screen.findByText('Combo para baños')).toBeInTheDocument()
    expect(screen.getByText('SPOT-1', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('SPOT-2', { exact: false })).toBeInTheDocument()

    fireEvent.click(screen.getByText('ventasDiseno:catalog.selectAllProducts'))

    await waitFor(() => expect(mockedApi.quotes.parts.items.bulkCreate).toHaveBeenCalledWith(1, 1, [11, 12]))
  })

  it('muestra estado vacío cuando no hay familias configuradas', async () => {
    mockedApi.catalogProductFamilies.list.mockResolvedValue({ data: [] })
    renderCard(makePart({ items: [] }))

    fireEvent.click(screen.getByText('ventasDiseno:quote.item.addItem'))
    fireEvent.click(screen.getByText('ventasDiseno:catalog.searchButton'))
    fireEvent.click(screen.getByText('ventasDiseno:catalog.tabFamilies'))

    expect(await screen.findByText('ventasDiseno:catalog.familiesEmpty')).toBeInTheDocument()
  })

  it('deshabilita "Seleccionar productos" si la familia no tiene productos activos', async () => {
    // Senior Review 2026-07-13, sugerencia #3 — antes se podía confirmar una
    // familia vacía y el backend rechazaba con 422 sin que el botón lo previniera.
    mockedApi.catalogProductFamilies.list.mockResolvedValue({
      data: [{ id: 5, name: 'Sin Stock', description: null, products_count: 0 }],
    })
    mockedApi.catalogProductFamilies.get.mockResolvedValue({ id: 5, name: 'Sin Stock', description: null, products: [] })
    renderCard(makePart({ items: [] }))

    fireEvent.click(screen.getByText('ventasDiseno:quote.item.addItem'))
    fireEvent.click(screen.getByText('ventasDiseno:catalog.searchButton'))
    fireEvent.click(screen.getByText('ventasDiseno:catalog.tabFamilies'))
    fireEvent.click(await screen.findByText('Sin Stock'))

    const selectButton = await screen.findByText('ventasDiseno:catalog.selectAllProducts')
    expect(selectButton.closest('button')).toBeDisabled()
  })

  // SCRUM-725 (fix 2026-08-06) — effectiveUnitPrice() ignora unit_price por
  // completo bajo "premium" (usa costo/premium_divisor); el campo manual quedaba
  // editable sin ningún efecto real, lo que confundió a un usuario real (Daniela)
  // que pensó haber fijado un precio.
  describe('precio manual deshabilitado bajo Tarifa Premium (SCRUM-725)', () => {
    it('deshabilita el precio cuando el ítem tiene price_type_override=premium', () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={queryClient}>
          <QuotePartCard
            quoteId={1} part={makePart({ items: [makeItem({ price_type_override: 'premium' })] })}
            discountMode="line" canEdit minMarginPercent={30} quotePriceType="public"
          />
        </QueryClientProvider>,
      )
      expect(screen.getByText('$100.00')).toBeDisabled()
      expect(screen.getByText('ventasDiseno:quote.item.premiumIgnoresManualPrice')).toBeInTheDocument()
    })

    it('deshabilita el precio cuando el ítem usa "usar general" y la cotización es premium', () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={queryClient}>
          <QuotePartCard
            quoteId={1} part={makePart({ items: [makeItem({ price_type_override: null })] })}
            discountMode="line" canEdit minMarginPercent={30} quotePriceType="premium"
          />
        </QueryClientProvider>,
      )
      expect(screen.getByText('$100.00')).toBeDisabled()
    })

    it('NO deshabilita el precio con un tipo de precio distinto de premium', () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={queryClient}>
          <QuotePartCard
            quoteId={1} part={makePart({ items: [makeItem({ price_type_override: 'project' })] })}
            discountMode="line" canEdit minMarginPercent={30} quotePriceType="public"
          />
        </QueryClientProvider>,
      )
      expect(screen.getByText('$100.00')).not.toBeDisabled()
      expect(screen.queryByText('ventasDiseno:quote.item.premiumIgnoresManualPrice')).not.toBeInTheDocument()
    })
  })
})
