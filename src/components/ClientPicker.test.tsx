import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ClientPicker from './ClientPicker'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

type Opt = { id: number; label: string }

// SCRUM-1176 — escribir ya no busca al instante: la consulta sale tras 250 ms sin teclear.
const esperaBusqueda = () => act(async () => { await new Promise(r => setTimeout(r, 300)) })

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
}

describe('ClientPicker', () => {
  it('descarta una respuesta vieja si ya hay una búsqueda más reciente en vuelo (SCRUM-938)', async () => {
    // onFocus dispara una búsqueda vacía que responde DESPUÉS de la búsqueda tipeada que le sigue —
    // reproduce el orden invertido que originó el bug: la respuesta vieja no debe pisar la nueva.
    const focusCall = deferred<Opt[]>()
    const typedCall = deferred<Opt[]>()
    const search = vi.fn()
      .mockReturnValueOnce(focusCall.promise)
      .mockReturnValueOnce(typedCall.promise)

    render(
      <ClientPicker<Opt>
        label="Cliente Master"
        value=""
        onSelect={vi.fn()}
        search={search}
        onCreate={vi.fn()}
        disabled={false}
      />,
    )

    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Ferreteria' } })
    await esperaBusqueda()

    // La respuesta tipeada (más nueva) llega primero...
    await act(async () => { typedCall.resolve([{ id: 1, label: 'Ferreteria Exacta' }]) })
    expect(screen.getByText('Ferreteria Exacta')).toBeInTheDocument()

    // ...y la de onFocus (vieja, lista sin filtrar) llega después — no debe pisar el desplegable.
    await act(async () => { focusCall.resolve([{ id: 2, label: 'Cliente A' }, { id: 3, label: 'Cliente B' }]) })
    expect(screen.getByText('Ferreteria Exacta')).toBeInTheDocument()
    expect(screen.queryByText('Cliente A')).not.toBeInTheDocument()
  })

  it('aplica la respuesta normalmente cuando no hay una búsqueda más reciente en vuelo', async () => {
    const search = vi.fn().mockResolvedValue([{ id: 1, label: 'Cliente Único' }])
    render(
      <ClientPicker<Opt>
        label="Cliente Master"
        value=""
        onSelect={vi.fn()}
        search={search}
        onCreate={vi.fn()}
        disabled={false}
      />,
    )

    await act(async () => { fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Cliente' } }) })
    await esperaBusqueda()
    expect(screen.getByText('Cliente Único')).toBeInTheDocument()
  })

  it('SCRUM-1176: escribir tecla por tecla manda una sola búsqueda, con el texto final', async () => {
    const search = vi.fn().mockResolvedValue([])
    render(
      <ClientPicker<Opt> label="Cliente Master" value="" onSelect={vi.fn()} search={search} onCreate={vi.fn()} disabled={false} />,
    )
    const input = screen.getByRole('textbox')

    for (const parcial of ['F', 'Fe', 'Fer', 'Ferr', 'Ferre', 'Ferret']) {
      fireEvent.change(input, { target: { value: parcial } })
    }
    expect((input as HTMLInputElement).value).toBe('Ferret')   // el campo responde al instante
    expect(search).not.toHaveBeenCalled()

    await esperaBusqueda()
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('Ferret')
  })

  it('SCRUM-1176: enfocar el campo busca de inmediato y cancela la búsqueda que estaba por salir', async () => {
    const search = vi.fn().mockResolvedValue([])
    render(
      <ClientPicker<Opt> label="Cliente Master" value="" onSelect={vi.fn()} search={search} onCreate={vi.fn()} disabled={false} />,
    )
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'Fe' } })
    fireEvent.focus(input)
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('Fe')

    await esperaBusqueda()
    expect(search).toHaveBeenCalledTimes(1)   // la pendiente se canceló, no se repite
  })

  describe('campo DV (SCRUM-928/938)', () => {
    function renderWithDv() {
      const search = vi.fn().mockResolvedValue([])
      const onCreate = vi.fn()
      render(
        <ClientPicker<Opt>
          label="Subcliente"
          value=""
          onSelect={vi.fn()}
          search={search}
          onCreate={onCreate}
          disabled={false}
          extraFieldLabel="RUC"
          dvFieldLabel="DV"
        />,
      )
    }

    async function openDraft(query: string) {
      renderWithDv()
      const input = screen.getByRole('textbox')
      await act(async () => { fireEvent.change(input, { target: { value: query } }) })
      await esperaBusqueda()
      fireEvent.mouseDown(screen.getByText('ventasDiseno:modal.createNew'))
    }

    it('solo acepta dígitos, descartando el resto', async () => {
      await openDraft('Cliente Nuevo')
      const dvInput = screen.getByPlaceholderText('DV')
      fireEvent.change(dvInput, { target: { value: '1a2b' } })
      expect(dvInput).toHaveValue('12')
    })

    it('trunca a máximo 2 dígitos aunque se pegue un valor más largo', async () => {
      await openDraft('Cliente Nuevo')
      const dvInput = screen.getByPlaceholderText('DV')
      fireEvent.change(dvInput, { target: { value: '98765' } })
      expect(dvInput).toHaveValue('98')
    })

    it('no tiene atributo maxLength, para no cortar un pegado antes de poder recortarlo en JS', async () => {
      await openDraft('Cliente Nuevo')
      const dvInput = screen.getByPlaceholderText('DV')
      expect(dvInput).not.toHaveAttribute('maxlength')
    })

    it('SCRUM-1140: el DV es opcional, se puede crear el cliente sin escribirlo', async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: 9, label: 'Cliente Nuevo' })
      render(
        <ClientPicker<Opt>
          label="Subcliente" value="" onSelect={vi.fn()} search={vi.fn().mockResolvedValue([])} onCreate={onCreate}
          disabled={false} extraFieldLabel="RUC" dvFieldLabel="DV"
        />,
      )
      await act(async () => { fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Cliente Nuevo' } }) })
      await esperaBusqueda()
      fireEvent.mouseDown(screen.getByText('ventasDiseno:modal.createNew'))
      fireEvent.change(screen.getByPlaceholderText('RUC'), { target: { value: '8-123-456' } })

      const confirmar = screen.getByText('common:actions.confirm').closest('button') as HTMLButtonElement
      expect(confirmar).not.toBeDisabled()
      await act(async () => { fireEvent.click(confirmar) })

      expect(onCreate).toHaveBeenCalledWith('Cliente Nuevo', '8-123-456', '', '')
    })
  })
})
