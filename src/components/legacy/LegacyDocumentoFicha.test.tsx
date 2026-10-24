import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LegacyDocumentoFicha } from './LegacyDocumentoFicha'
import type { LegacyDocumentHeader } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      const vals = Object.values(opts).filter(v => typeof v === 'string' || typeof v === 'number')
      return vals.length ? `${key}:${vals.join(',')}` : key
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
}))

// SCRUM-840/841/842 — cobertura dedicada del render condicional Cliente vs Proveedor y del bloque
// de Facturación Electrónica. El resto del comportamiento (cliente huérfano, líneas, montos) ya
// está cubierto indirectamente vía SubClientIcgHistoryModal.test.tsx/LegacyDocumentoTabPanel.test.tsx.
function baseHeader(overrides: Partial<LegacyDocumentHeader> = {}): LegacyDocumentHeader {
  return {
    folio: 'A-1-1', fecha: '2026-01-01', total_neto: '100.00', orphan: false,
    ...overrides,
  }
}

describe('LegacyDocumentoFicha', () => {
  it('con header.cliente presente muestra "Cliente" y no "Proveedor"', () => {
    render(<LegacyDocumentoFicha isLoading={false} items={[]} header={baseHeader({
      cliente: { id: 1, nombre_comercial: 'Delta SA', razon_social: 'Delta SA', cif: '123' },
      icg_codcliente: 1,
    })} />)

    expect(screen.getByText('Delta SA')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:clients.icgHistoryModal.document.proveedor')).not.toBeInTheDocument()
  })

  it('con header.proveedor presente (Albaranes de Compra) muestra "Proveedor" y no "Cliente"', () => {
    render(<LegacyDocumentoFicha isLoading={false} items={[]} header={baseHeader({
      proveedor: { id: 5, nombre_comercial: 'Proveedor XYZ', nombre: 'Proveedor XYZ SA', cif: '456' },
      icg_codproveedor: 42,
    })} />)

    expect(screen.getByText('Proveedor XYZ')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:clients.icgHistoryModal.document.cliente')).not.toBeInTheDocument()
  })

  it('proveedor huérfano (sin vincular) muestra el código ICG', () => {
    render(<LegacyDocumentoFicha isLoading={false} items={[]} header={baseHeader({
      proveedor: null, icg_codproveedor: 77,
    })} />)

    expect(screen.getByText('ventasDiseno:clients.icgHistoryModal.document.proveedorHuerfano:77')).toBeInTheDocument()
  })

  it('sin campos de Facturación Electrónica no renderiza el bloque FE', () => {
    render(<LegacyDocumentoFicha isLoading={false} items={null} header={baseHeader()} />)

    expect(screen.queryByText('ventasDiseno:clients.icgHistoryModal.document.feTitle')).not.toBeInTheDocument()
  })

  it('con fe_estado presente renderiza el bloque FE completo', () => {
    render(<LegacyDocumentoFicha isLoading={false} items={null} header={baseHeader({
      fe_estado: 'aceptado',
      fe_auth_number: 'AUTH-0001',
      fe_serie: '0001',
      fe_numero: '000123',
      fe_qr: 'https://dgi.gob.pa/qr/abc123',
    })} />)

    expect(screen.getByText('ventasDiseno:clients.icgHistoryModal.document.feTitle')).toBeInTheDocument()
    expect(screen.getByText('aceptado')).toBeInTheDocument()
    expect(screen.getByText('AUTH-0001')).toBeInTheDocument()
    expect(screen.getByText('0001-000123')).toBeInTheDocument()
    expect(screen.getByText('https://dgi.gob.pa/qr/abc123')).toBeInTheDocument()
  })

  it('campos libres (proyecto/promoción/comisión/observaciones) se muestran cuando vienen', () => {
    render(<LegacyDocumentoFicha isLoading={false} items={[]} header={baseHeader({
      proyecto: 'Torre Delta', promocion: 'Verano2026', comision: '125.50', observaciones: 'Entregar en bodega',
    })} />)

    expect(screen.getByText('Torre Delta')).toBeInTheDocument()
    expect(screen.getByText('Verano2026')).toBeInTheDocument()
    expect(screen.getByText('$125.5')).toBeInTheDocument()
    expect(screen.getByText('Entregar en bodega')).toBeInTheDocument()
  })
})
