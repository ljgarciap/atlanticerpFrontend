import { ventasDisenoApi } from '@/api/ventasDisenoApi'

/** SCRUM-1120 — descarga el PDF de una CotizaYA (mismo formato que Cotizaciones) sin salir de la pantalla. */
export async function downloadCotizaYaPdf(id: number, folio: string): Promise<void> {
  const blob = await ventasDisenoApi.cotizaya.pdf(id)
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = `${folio}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
