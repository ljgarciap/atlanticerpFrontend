import { describe, expect, it } from 'vitest'
import { orderStatusLabel } from './orderStatusLabel'
import type { TFunction } from 'i18next'

// SCRUM-204 (REQ-141): "Pendiente/Por liquidar" es un único estado interno; Fase 14f: sin modalidad que lo cambie.
const t = ((key: string) => key) as TFunction

describe('orderStatusLabel', () => {
  it('devuelve la clave genérica para cualquier estado que no sea pendiente_liquidar', () => {
    expect(orderStatusLabel(t, 'ordenado', 'directo')).toBe('compras:orders.status.ordenado')
    expect(orderStatusLabel(t, 'recibido', 'directo')).toBe('compras:orders.status.recibido')
  })

  it('modalidad directo -> etiqueta "Pendiente"', () => {
    expect(orderStatusLabel(t, 'pendiente_liquidar', 'directo')).toBe('compras:orders.status.pendienteLiquidarDirecto')
  })

  it('sin modality (contexto sin una orden puntual, ej. filtro genérico) usa el texto combinado', () => {
    expect(orderStatusLabel(t, 'pendiente_liquidar')).toBe('compras:orders.status.pendiente_liquidar')
  })
})
