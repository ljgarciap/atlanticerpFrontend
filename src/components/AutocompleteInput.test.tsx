import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import AutocompleteInput from './AutocompleteInput'

// ── Helpers ────────────────────────────────────────────────────────────────

function setup(overrides: {
  value?:        string
  fetchOptions?: (q: string) => Promise<string[]>
  placeholder?:  string
  disabled?:     boolean
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
