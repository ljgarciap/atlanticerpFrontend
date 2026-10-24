import { describe, it, expect } from 'vitest'
import { moveItem } from './reorder'

describe('moveItem', () => {
  it('lleva el elemento 5 a la posición 1 y corre el resto (SCRUM-1161)', () => {
    expect(moveItem([1, 2, 3, 4, 5], 4, 0)).toEqual([5, 1, 2, 3, 4])
  })
  it('lleva la partida 3 a la posición 1', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
  it('no modifica la lista original', () => {
    const original = [1, 2, 3]
    moveItem(original, 0, 2)
    expect(original).toEqual([1, 2, 3])
  })
})
