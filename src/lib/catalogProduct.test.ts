import { describe, expect, it } from 'vitest'
import { productDisplayName } from './catalogProduct'

describe('productDisplayName (SCRUM-237/240)', () => {
  it('usa name cuando viene poblado, no description', () => {
    expect(productDisplayName({ name: 'Lámpara colgante', description: 'Colgante de metal negro, 3 luces' }))
      .toBe('Lámpara colgante')
  })

  it('cae a description mientras el backend no envíe name (transición del batch)', () => {
    expect(productDisplayName({ description: 'Bombillo E27' })).toBe('Bombillo E27')
  })

  it('cae a description si name viene vacío/blanco', () => {
    expect(productDisplayName({ name: '   ', description: 'Bombillo E27' })).toBe('Bombillo E27')
  })
})
