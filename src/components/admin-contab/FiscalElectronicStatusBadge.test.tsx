import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FiscalElectronicStatusBadge from './FiscalElectronicStatusBadge'

const t = (key: string) => key

describe('FiscalElectronicStatusBadge — motivo del rechazo (batch endurecimiento FE/MSL)', () => {
  it('rechazado con detalle muestra el motivo textual', () => {
    render(
      <FiscalElectronicStatusBadge
        estado="rechazado" cufe={null} qrContent={null} t={t}
        detalle="9026 - Falló la validación de algunos escenarios."
      />,
    )
    expect(screen.getByText(/9026 - Falló la validación de algunos escenarios\./)).toBeInTheDocument()
  })

  it('error_configuracion con detalle también lo muestra', () => {
    render(<FiscalElectronicStatusBadge estado="error_configuracion" cufe={null} qrContent={null} t={t} detalle="API key inválida" />)
    expect(screen.getByText(/API key inválida/)).toBeInTheDocument()
  })

  it('sin detalle (rol sin acceso a Configuración Fiscal) no renderiza el bloque de motivo', () => {
    render(<FiscalElectronicStatusBadge estado="rechazado" cufe={null} qrContent={null} t={t} detalle={null} />)
    expect(screen.queryByText(/facturacionElectronica\.motivo/)).not.toBeInTheDocument()
  })

  it('certificado nunca muestra motivo aunque llegue detalle', () => {
    render(<FiscalElectronicStatusBadge estado="certificado" cufe="FE01" qrContent={null} t={t} detalle="viejo" />)
    expect(screen.queryByText(/viejo/)).not.toBeInTheDocument()
  })

  it('el detalle se renderiza como texto, nunca como HTML', () => {
    const { container } = render(
      <FiscalElectronicStatusBadge estado="rechazado" cufe={null} qrContent={null} t={t} detalle="<img src=x onerror=alert(1)>" />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument()
  })
})

describe('FiscalElectronicStatusBadge — en_espera_nc (SCRUM-1009)', () => {
  it('muestra su propia etiqueta, ni rechazado ni error de configuración', () => {
    render(<FiscalElectronicStatusBadge estado="en_espera_nc" cufe={null} qrContent={null} t={t} />)
    expect(screen.getByText('adminContab:facturacion.detalle.facturacionElectronica.enEsperaNc')).toBeInTheDocument()
    expect(screen.queryByText(/facturacionElectronica\.rechazado/)).not.toBeInTheDocument()
    expect(screen.queryByText(/facturacionElectronica\.errorConfiguracion/)).not.toBeInTheDocument()
  })
})

