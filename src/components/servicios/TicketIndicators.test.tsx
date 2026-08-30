import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuoteIndicator, InspectionReportIndicator } from './TicketIndicators'
import { deriveQuoteDisplayStatus } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

describe('QuoteIndicator — REQ-219, 6 variantes con nombre + null', () => {
  it('"No aplica" cuando not_applicable', () => {
    render(<QuoteIndicator status="not_applicable" />)
    expect(screen.getByText('tickets.quote.notApplicable')).toBeInTheDocument()
  })

  it('candado + explicación al hacer clic cuando locked', () => {
    render(<QuoteIndicator status="locked" />)
    expect(screen.queryByText('tickets.quote.lockedTooltip')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('tickets.quote.locked'))
    expect(screen.getByText('tickets.quote.lockedTooltip')).toBeInTheDocument()
  })

  it('botón "Generar cotización" habilitado y dispara onOpen cuando status es null (Batch 11)', () => {
    const onOpen = vi.fn()
    render(<QuoteIndicator status={null} onOpen={onOpen} />)
    const btn = screen.getByText('tickets.quote.generate')
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it.each(['draft', 'sent', 'approved', 'rejected'] as const)('muestra el badge de estado %s, clickeable (Batch 11)', (status) => {
    const onOpen = vi.fn()
    render(<QuoteIndicator status={status} onOpen={onOpen} />)
    const badge = screen.getByText(`tickets.quote.${status}`)
    expect(badge).toBeInTheDocument()
    fireEvent.click(badge)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('muestra el monto en el Tablero cuando showAmount=true y hay quote_amount', () => {
    render(<QuoteIndicator status="sent" amount={1250} showAmount />)
    expect(screen.getByText('$1,250')).toBeInTheDocument()
  })

  it('no rompe si falta el monto (showAmount=true, amount=null)', () => {
    render(<QuoteIndicator status="sent" amount={null} showAmount />)
    expect(screen.getByText('tickets.quote.sent')).toBeInTheDocument()
  })
})

describe('deriveQuoteDisplayStatus — REQ-219 RN1-RN4 (hallazgo de Visual Review 2026-08-02)', () => {
  // El backend nunca manda 'locked' ni null — manda 'pending' tanto para "bloqueada" como para
  // "lista para generar". El componente QuoteIndicator solo sabe renderizar el valor YA resuelto;
  // esta función es la que hace esa resolución, y es la pieza que faltaba antes del fix.
  it('not_applicable pasa directo', () => {
    expect(deriveQuoteDisplayStatus('not_applicable', 'not_applicable')).toBe('not_applicable')
    expect(deriveQuoteDisplayStatus('not_applicable', 'pending')).toBe('not_applicable')
  })

  it('pending + informe pendiente => locked (bloqueada)', () => {
    expect(deriveQuoteDisplayStatus('pending', 'pending')).toBe('locked')
  })

  it('pending + informe completado => null (lista para generar)', () => {
    expect(deriveQuoteDisplayStatus('pending', 'completed')).toBeNull()
  })

  it('pending + informe no aplica => null (lista para generar)', () => {
    expect(deriveQuoteDisplayStatus('pending', 'not_applicable')).toBeNull()
  })

  it.each(['draft', 'sent', 'approved', 'rejected'] as const)('%s pasa directo sin importar el informe', (status) => {
    expect(deriveQuoteDisplayStatus(status, 'pending')).toBe(status)
    expect(deriveQuoteDisplayStatus(status, 'completed')).toBe(status)
  })
})

describe('InspectionReportIndicator — REQ-220', () => {
  it('"No aplica" cuando not_applicable', () => {
    render(<InspectionReportIndicator status="not_applicable" />)
    expect(screen.getByText('tickets.inspectionReport.notApplicable')).toBeInTheDocument()
  })

  it('"Completado" cuando completed, clickeable (RN5 REQ-238: editable después de Completado)', () => {
    const onOpen = vi.fn()
    render(<InspectionReportIndicator status="completed" onOpen={onOpen} />)
    const badge = screen.getByText('tickets.inspectionReport.completed')
    expect(badge).not.toBeDisabled()
    fireEvent.click(badge)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('botón "Generar informe" habilitado y dispara onOpen cuando pending (Batch 8)', () => {
    const onOpen = vi.fn()
    render(<InspectionReportIndicator status="pending" onOpen={onOpen} />)
    const btn = screen.getByText('tickets.inspectionReport.generate')
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
