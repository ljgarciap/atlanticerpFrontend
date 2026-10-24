import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import AutocompleteInput from './AutocompleteInput'

// ── Helpers ────────────────────────────────────────────────────────────────

function setup(overrides: {
  value?:        string
  fetchOptions?: (q: string) => Promise<string[]>
  placeholder?:  string
  disabled?:     boolean
  minChars?:     number
} = {}) {
  const onChange     = vi.fn()
  const fetchOptions = overrides.fetchOptions ?? vi.fn().mockResolvedValue([])

  render(
    <AutocompleteInput
      value={overrides.value ?? ''}
      onChange={onChange}
      fetchOptions={fetchOptions}
      placeholder={overrides.placeholder}
      disabled={overrides.disabled}
      minChars={overrides.minChars}
    />
  )

  const input = screen.getByRole('textbox')
  return { input, onChange, fetchOptions }
}

// Fires the debounce timer and flushes all resulting async microtasks
async function flushDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  // Flush promises that resolved inside the timeout callback
  await act(async () => {})
}

// Senior Review (2026-09-22, hallazgo no bloqueante de SCRUM-949) — mismo helper que
// ClientPicker.test.tsx (SCRUM-938), para controlar en qué orden resuelve/rechaza cada `fetchOptions`.
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!:  (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// ── Render ────────────────────────────────────────────────────────────────

describe('AutocompleteInput — render', () => {
  it('renderiza el input con el valor actual', () => {
    const { input } = setup({ value: 'Miraflores' })
    expect(input).toHaveValue('Miraflores')
  })

  it('muestra el placeholder cuando está vacío', () => {
    setup({ placeholder: 'Escribe aquí...' })
    expect(screen.getByPlaceholderText('Escribe aquí...')).toBeInTheDocument()
  })

  it('respeta el atributo disabled', () => {
    const { input } = setup({ disabled: true })
    expect(input).toBeDisabled()
  })

  it('no muestra dropdown inicialmente', () => {
    setup()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

// ── onChange ──────────────────────────────────────────────────────────────

describe('AutocompleteInput — onChange', () => {
  it('llama a onChange con el valor del input al cambiar', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: 'Panamá' } })
    expect(onChange).toHaveBeenCalledWith('Panamá')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('llama a onChange en cada cambio individual', () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: 'P' } })
    fireEvent.change(input, { target: { value: 'Pa' } })
    fireEvent.change(input, { target: { value: 'Pan' } })
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(onChange).toHaveBeenNthCalledWith(1, 'P')
    expect(onChange).toHaveBeenNthCalledWith(2, 'Pa')
    expect(onChange).toHaveBeenNthCalledWith(3, 'Pan')
  })
})

// ── Dropdown ──────────────────────────────────────────────────────────────

describe('AutocompleteInput — dropdown', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('muestra opciones después del debounce cuando fetchOptions retorna resultados', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Panamá', 'Panamá Oeste'])
    const { input } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'Pan' } })
    await flushDebounce()

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('Panamá')).toBeInTheDocument()
    expect(screen.getByText('Panamá Oeste')).toBeInTheDocument()
  })

  it('no muestra dropdown cuando fetchOptions retorna array vacío', async () => {
    const fetchOptions = vi.fn().mockResolvedValue([])
    const { input } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'xyz' } })
    await flushDebounce()

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('llama a fetchOptions con el texto ingresado', async () => {
    const fetchOptions = vi.fn().mockResolvedValue([])
    const { input } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'Cola' } })
    await flushDebounce()

    expect(fetchOptions).toHaveBeenCalledWith('Cola')
  })

  it('no llama a fetchOptions antes de los 300ms', () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Algo'])
    const { input } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'Pan' } })
    // Advance only 299ms — debounce should NOT fire yet
    act(() => { vi.advanceTimersByTime(299) })

    expect(fetchOptions).not.toHaveBeenCalled()
  })

  it('cierra el dropdown al presionar Escape', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Opción A'])
    const { input } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'Op' } })
    await flushDebounce()

    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

// ── Selección ─────────────────────────────────────────────────────────────

describe('AutocompleteInput — selección de opción', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('selecciona una opción al hacer mouseDown', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Ciudad de Panamá', 'Colón'])
    const { input, onChange } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'C' } })
    await flushDebounce()

    expect(screen.getByText('Ciudad de Panamá')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByText('Ciudad de Panamá'))

    expect(onChange).toHaveBeenLastCalledWith('Ciudad de Panamá')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('navega con ArrowDown y selecciona con Enter', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Alpha', 'Beta'])
    const { input, onChange } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'A' } })
    await flushDebounce()

    expect(screen.getByText('Alpha')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // index → 0 (Alpha)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenLastCalledWith('Alpha')
  })

  it('ArrowDown x2 + ArrowUp x1 → selecciona el primer item', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Alpha', 'Beta', 'Gamma'])
    const { input, onChange } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'A' } })
    await flushDebounce()

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // 0 → Alpha
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // 1 → Beta
    fireEvent.keyDown(input, { key: 'ArrowUp' })   // 0 → Alpha
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenLastCalledWith('Alpha')
  })

  it('Enter sin navegación previa no selecciona nada extra', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Alpha'])
    const { input, onChange } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'A' } })
    await flushDebounce()

    const callsBefore = onChange.mock.calls.length

    fireEvent.keyDown(input, { key: 'Enter' }) // focused=-1, nothing picked

    expect(onChange).toHaveBeenCalledTimes(callsBefore)
  })
})

// ── SCRUM-949 — onSelect + noResultsLabel ────────────────────────────────────

describe('AutocompleteInput — SCRUM-949 onSelect (distinto de onChange)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('tipear NO llama a onSelect, solo a onChange', () => {
    const onSelect = vi.fn()
    const onChange = vi.fn()
    render(
      <AutocompleteInput value="" onChange={onChange} onSelect={onSelect} fetchOptions={vi.fn().mockResolvedValue([])} />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Pan' } })
    expect(onChange).toHaveBeenCalledWith('Pan')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('elegir una opción con mouseDown llama a onChange Y a onSelect con el mismo valor', async () => {
    const onSelect     = vi.fn()
    const onChange     = vi.fn()
    const fetchOptions = vi.fn().mockResolvedValue(['Proveedor A'])
    const { rerender } = render(
      <AutocompleteInput value="" onChange={onChange} onSelect={onSelect} fetchOptions={fetchOptions} />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Prov' } })
    await flushDebounce()
    rerender(<AutocompleteInput value="Prov" onChange={onChange} onSelect={onSelect} fetchOptions={fetchOptions} />)

    fireEvent.mouseDown(screen.getByText('Proveedor A'))

    expect(onChange).toHaveBeenLastCalledWith('Proveedor A')
    expect(onSelect).toHaveBeenCalledWith('Proveedor A')
  })

  it('elegir con Enter tras navegar también llama a onSelect', async () => {
    const onSelect     = vi.fn()
    const fetchOptions = vi.fn().mockResolvedValue(['Alpha'])
    render(<AutocompleteInput value="" onChange={vi.fn()} onSelect={onSelect} fetchOptions={fetchOptions} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'A' } })
    await flushDebounce()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith('Alpha')
  })
})

describe('AutocompleteInput — SCRUM-949 noResultsLabel', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('sin noResultsLabel, un array vacío no abre el dropdown (comportamiento de siempre)', async () => {
    const { input } = setup({ fetchOptions: vi.fn().mockResolvedValue([]) })
    fireEvent.change(input, { target: { value: 'xyz' } })
    await flushDebounce()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('con noResultsLabel, un array vacío abre el dropdown mostrando ese texto', async () => {
    const fetchOptions = vi.fn().mockResolvedValue([])
    render(
      <AutocompleteInput
        value="" onChange={vi.fn()} fetchOptions={fetchOptions}
        noResultsLabel="Sin resultados"
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'xyz' } })
    await flushDebounce()

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('Sin resultados')).toBeInTheDocument()
  })

  it('con noResultsLabel, resultados reales muestran las opciones normales, no el mensaje', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Encontrado'])
    render(
      <AutocompleteInput
        value="" onChange={vi.fn()} fetchOptions={fetchOptions}
        noResultsLabel="Sin resultados"
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'enc' } })
    await flushDebounce()

    expect(screen.getByText('Encontrado')).toBeInTheDocument()
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument()
  })
})

describe('AutocompleteInput — SCRUM-949 onEnterWithoutSelection', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('Enter con el dropdown cerrado llama a onEnterWithoutSelection', () => {
    const onEnter = vi.fn()
    render(<AutocompleteInput value="texto libre" onChange={vi.fn()} fetchOptions={vi.fn().mockResolvedValue([])} onEnterWithoutSelection={onEnter} />)

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('Enter con el dropdown abierto pero sin navegar (sin foco) también llama a onEnterWithoutSelection, no a onSelect', async () => {
    const onEnter      = vi.fn()
    const onSelect      = vi.fn()
    const fetchOptions = vi.fn().mockResolvedValue(['Alpha'])
    render(<AutocompleteInput value="" onChange={vi.fn()} onSelect={onSelect} fetchOptions={fetchOptions} onEnterWithoutSelection={onEnter} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'A' } })
    await flushDebounce()

    fireEvent.keyDown(input, { key: 'Enter' }) // sin ArrowDown previo — focused=-1

    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('Enter CON una sugerencia enfocada solo llama a onSelect, no a onEnterWithoutSelection', async () => {
    const onEnter       = vi.fn()
    const onSelect      = vi.fn()
    const fetchOptions  = vi.fn().mockResolvedValue(['Alpha'])
    render(<AutocompleteInput value="" onChange={vi.fn()} onSelect={onSelect} fetchOptions={fetchOptions} onEnterWithoutSelection={onEnter} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'A' } })
    await flushDebounce()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith('Alpha')
    expect(onEnter).not.toHaveBeenCalled()
  })
})

// ── aria-selected ─────────────────────────────────────────────────────────

describe('AutocompleteInput — aria-selected', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('marca aria-selected=true en la opción con foco activo', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Alpha', 'Beta'])
    const { input } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'A' } })
    await flushDebounce()

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // focus on index 0

    const alphaOption = screen.getByText('Alpha').closest('[role="option"]')
    const betaOption  = screen.getByText('Beta').closest('[role="option"]')

    expect(alphaOption).toHaveAttribute('aria-selected', 'true')
    expect(betaOption).toHaveAttribute('aria-selected', 'false')
  })
})

// Senior Review (2026-09-22, hallazgo no bloqueante de SCRUM-949) — mismo bug de ClientPicker.tsx
// (SCRUM-938): una respuesta de red fuera de orden podía pisar el desplegable con resultados
// obsoletos. El debounce ya evita la carrera entre tecleadas normales (una tecleada dentro de los
// 300ms cancela el timer anterior, así que nunca llega a disparar 2 fetch), así que para reproducir
// el caso real hace falta esperar el debounce completo entre cada tecleada — 2 fetch en vuelo a la
// vez, resueltos fuera de orden.
describe('AutocompleteInput — SCRUM-949 descarta respuestas fuera de orden', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('una respuesta lenta de una tecleada anterior no pisa la más reciente ya aplicada', async () => {
    const firstCall  = deferred<string[]>()
    const secondCall = deferred<string[]>()
    const fetchOptions = vi.fn()
      .mockReturnValueOnce(firstCall.promise)
      .mockReturnValueOnce(secondCall.promise)

    const { input } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'a' } })
    await flushDebounce() // dispara fetchOptions('a') → firstCall

    fireEvent.change(input, { target: { value: 'ab' } })
    await flushDebounce() // dispara fetchOptions('ab') → secondCall

    expect(fetchOptions).toHaveBeenCalledTimes(2)

    // La búsqueda MÁS NUEVA responde primero.
    await act(async () => { secondCall.resolve(['Resultado nuevo']) })
    expect(screen.getByText('Resultado nuevo')).toBeInTheDocument()

    // La MÁS VIEJA responde después — no debe pisar el desplegable ya actualizado.
    await act(async () => { firstCall.resolve(['Resultado viejo']) })
    expect(screen.getByText('Resultado nuevo')).toBeInTheDocument()
    expect(screen.queryByText('Resultado viejo')).not.toBeInTheDocument()
  })

  it('una respuesta lenta y obsoleta que rechaza tampoco pisa el estado ya actualizado', async () => {
    const firstCall  = deferred<string[]>()
    const secondCall = deferred<string[]>()
    const fetchOptions = vi.fn()
      .mockReturnValueOnce(firstCall.promise)
      .mockReturnValueOnce(secondCall.promise)

    const { input } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'a' } })
    await flushDebounce() // fetchOptions('a') → firstCall
    fireEvent.change(input, { target: { value: 'ab' } })
    await flushDebounce() // fetchOptions('ab') → secondCall

    // La MÁS NUEVA responde primero, con éxito.
    await act(async () => { secondCall.resolve(['Resultado nuevo']) })
    expect(screen.getByText('Resultado nuevo')).toBeInTheDocument()

    // La MÁS VIEJA falla DESPUÉS — el `.catch` (que vacía `options`) no debe aplicarse porque ya
    // dejó de ser la búsqueda más reciente.
    await act(async () => { firstCall.reject(new Error('network error')) })

    expect(screen.getByText('Resultado nuevo')).toBeInTheDocument()
  })
})

// ── minChars (SCRUM-992, Pre-QA H14) ───────────────────────────────────────

describe('AutocompleteInput — minChars', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('con minChars=2, un solo carácter no pide sugerencias', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Algo'])
    const { input } = setup({ fetchOptions, minChars: 2 })

    fireEvent.change(input, { target: { value: 'a' } })
    await flushDebounce()

    expect(fetchOptions).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('con minChars=2, los espacios de los extremos no cuentan', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Algo'])
    const { input } = setup({ fetchOptions, minChars: 2 })

    fireEvent.change(input, { target: { value: ' a ' } })
    await flushDebounce()

    expect(fetchOptions).not.toHaveBeenCalled()
  })

  it('con minChars=2, dos caracteres sí piden sugerencias, una sola vez', async () => {
    const fetchOptions = vi.fn().mockResolvedValue(['Alfa'])
    const { input } = setup({ fetchOptions, minChars: 2 })

    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.change(input, { target: { value: 'al' } })
    await flushDebounce()

    expect(fetchOptions).toHaveBeenCalledTimes(1)
    expect(fetchOptions).toHaveBeenCalledWith('al')
    expect(screen.getByText('Alfa')).toBeInTheDocument()
  })

  it('al borrar por debajo del mínimo se cierra el dropdown y se descarta la respuesta en vuelo', async () => {
    const pending = deferred<string[]>()
    const fetchOptions = vi.fn().mockReturnValueOnce(pending.promise)
    const { input } = setup({ fetchOptions, minChars: 2 })

    fireEvent.change(input, { target: { value: 'al' } })
    await flushDebounce() // fetchOptions('al') queda pendiente
    fireEvent.change(input, { target: { value: 'a' } })
    await flushDebounce()

    await act(async () => { pending.resolve(['Respuesta tardía']) })

    expect(screen.queryByText('Respuesta tardía')).not.toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('sin minChars el comportamiento no cambia: 1 carácter sí pide sugerencias', async () => {
    const fetchOptions = vi.fn().mockResolvedValue([])
    const { input } = setup({ fetchOptions })

    fireEvent.change(input, { target: { value: 'a' } })
    await flushDebounce()

    expect(fetchOptions).toHaveBeenCalledWith('a')
  })
})
