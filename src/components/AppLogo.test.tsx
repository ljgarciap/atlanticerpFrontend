import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AppLogo from './AppLogo'

describe('AppLogo', () => {
  it('renderiza el ícono con el tamaño por defecto', () => {
    render(<AppLogo />)
    const img = screen.getByAltText('AtlanticERP')
    expect(img).toHaveAttribute('width', '76')
    expect(img).toHaveAttribute('height', '76')
    expect(img).toHaveAttribute('src', '/logo-icon.png')
  })

  it('respeta el tamaño recibido por props', () => {
    render(<AppLogo size={32} />)
    const img = screen.getByAltText('AtlanticERP')
    expect(img).toHaveAttribute('width', '32')
    expect(img).toHaveAttribute('height', '32')
  })

  it('renderiza solo el ícono, sin wordmark, cuando iconOnly es true', () => {
    render(<AppLogo size={28} iconOnly />)
    expect(screen.getByAltText('AtlanticERP')).toBeInTheDocument()
    expect(screen.queryByText('Atlantic', { exact: false })).not.toBeInTheDocument()
  })

  it('renderiza el wordmark "AtlanticERP" cuando iconOnly es false', () => {
    render(<AppLogo />)
    expect(screen.getByText('Atlantic')).toBeInTheDocument()
    expect(screen.getByText('ERP')).toBeInTheDocument()
  })
})
