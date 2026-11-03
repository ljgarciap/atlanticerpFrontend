import { describe, expect, it } from 'vitest'
import { segmentInitial, segmentLabel } from './useClientSegments'

/** Fase 18 — helpers de los segmentos de cliente (catálogo `client_segment`). */
describe('segmentos de cliente', () => {
  const opciones = [{ key: 'a_walkin', label: 'A · Visita directa' }, { key: 'corporativo', label: 'E · Corporativo' }]

  it('la etiqueta sale del catálogo y, si el segmento ya no está, de la clave legible (nunca el identificador crudo)', () => {
    expect(segmentLabel(opciones, 'corporativo')).toBe('E · Corporativo')
    expect(segmentLabel(opciones, 'segmento_retirado')).toBe('segmento retirado')
  })

  it('la inicial de la pastilla es la letra del segmento, también para uno propio', () => {
    expect(segmentInitial('B · Prescriptor')).toBe('B')
    expect(segmentInitial('e · corporativo')).toBe('E')
    expect(segmentInitial('')).toBe('?')
  })
})
