import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import IlluminationsLogo from './IlluminationsLogo'

describe('IlluminationsLogo', () => {
  it('renderiza la imagen con el tamaño por defecto', () => {
    render(<IlluminationsLogo />)
    const imgs = screen.getAllByAltText('Illuminations')
    expect(imgs.length).toBeGreaterThanOrEqual(1)
    expect(imgs[0]).toHaveAttribute('width', '76')
    expect(imgs[0]).toHaveAttribute('height', '76')
  })

  it('respeta el tamaño recibido por props', () => {
    render(<IlluminationsLogo size={32} />)
    const imgs = screen.getAllByAltText('Illuminations')
    expect(imgs[0]).toHaveAttribute('width', '32')
    expect(imgs[0]).toHaveAttribute('height', '32')
  })

  it('renderiza solo el icono cuando iconOnly es true', () => {
    render(<IlluminationsLogo size={28} iconOnly />)
    const imgs = screen.getAllByAltText('Illuminations')
    expect(imgs).toHaveLength(1)
    expect(imgs[0]).toHaveAttribute('src', '/logo-icon.png')
  })

  it('renderiza ambas variantes (light/dark) cuando iconOnly es false', () => {
    render(<IlluminationsLogo />)
    const imgs = screen.getAllByAltText('Illuminations')
    expect(imgs).toHaveLength(2)
    expect(imgs[0]).toHaveAttribute('src', '/logo-light.png')
    expect(imgs[1]).toHaveAttribute('src', '/logo-dark.png')
  })
})
