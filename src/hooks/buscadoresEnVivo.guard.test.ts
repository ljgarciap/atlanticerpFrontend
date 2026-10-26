import { describe, expect, it } from 'vitest'

/**
 * SCRUM-1176 — regla general de los buscadores en vivo.
 *
 * Un campo de texto que consulta al servidor mientras se escribe NO puede mandar una petición por tecla: producción tiene una protección de carga
 * (nginx `limit_conn api_conc 10`, CAP-02) que responde 503 «Servicio ocupado» al pasar de 10 peticiones simultáneas a PHP en todo el servidor, y una
 * ráfaga de búsquedas de una sola persona la llenó (alarma atlanticerp-prod-nginx-5xx-high, 2026-10-19).
 *
 * Cómo cumplirla: `const term = useDebouncedSearchTerm(search)` (src/hooks/useDebouncedValue.ts) y usar `term`, no `search`, en la consulta. El campo
 * sigue respondiendo al instante; la petición sale tras 250 ms sin teclear y con al menos 2 caracteres.
 *
 * Esta prueba revisa todas las vistas: un archivo con un campo de texto de búsqueda/filtro (`setSearch(e.target.value)`, `setQ(...)`, `setBusqueda(...)`,
 * `setQuery(...)`, `setVendedor(...)`) debe usar `useDebouncedSearchTerm`/`useDebouncedValue`, o figurar abajo con el motivo
 * por el que no manda el texto al servidor mientras se teclea.
 */

/** Archivos que no necesitan espera, con el motivo. Agregar uno exige justificarlo en revisión. */
const EXCEPCIONES: Record<string, string> = {
  'components/servicios/ReportsLibraryTable.tsx': 'consulta con el botón Buscar, no al teclear',
  'pages/security/DepartmentsPage.tsx': 'consulta con el botón Buscar o Enter',
  'pages/security/SecurityLevelsPage.tsx': 'consulta con el botón Buscar o Enter',
  'pages/security/UsersPage.tsx': 'consulta con el botón Buscar o Enter',
  'components/servicios/ServiciosSearchPickerModal.tsx': 'espera propia de 250 ms antes de consultar',
  'pages/admin-contab/ClientesFiscalPage.tsx': 'espera propia de 350 ms antes de consultar',
  'components/compras/FamilyCombobox.tsx': 'filtra en el navegador las familias ya cargadas',
  'components/ClientPicker.tsx': 'búsqueda imperativa con espera propia de 250 ms (SCRUM-1176); enfocar el campo busca al instante',
  'components/UserMultiSelect.tsx': 'filtra en el navegador una lista ya cargada',
  'pages/servicios/ServiceQuotesHistoryPage.tsx': 'filtra en el navegador una lista ya cargada',
}

const CAMPO_DE_BUSQUEDA = /\bset(Search\w*|Busqueda\w*|Q|Query|Vendedor)\(\s*e\.target\.value/
const CON_ESPERA = /useDebouncedSearchTerm|useDebouncedValue/

// Todo el código fuente de las vistas y componentes (sin las pruebas), como texto. Las claves llegan como '../pages/X.tsx'.
const FUENTES = import.meta.glob(['../**/*.tsx', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('SCRUM-1176 — buscadores en vivo', () => {
  const conCampo = Object.entries(FUENTES)
    .map(([ruta, codigo]) => ({ archivo: ruta.replace(/^\.\.\//, ''), codigo }))
    .filter(({ codigo }) => CAMPO_DE_BUSQUEDA.test(codigo))

  it('encuentra los campos de búsqueda de la aplicación (la revisión no está vacía)', () => {
    expect(conCampo.length).toBeGreaterThan(20)
  })

  it('todo campo de búsqueda espera a que termine de teclear antes de consultar, o está justificado', () => {
    const sinEspera = conCampo
      .filter(({ archivo, codigo }) => !CON_ESPERA.test(codigo) && !(archivo in EXCEPCIONES))
      .map(({ archivo }) => archivo)

    expect(
      sinEspera,
      'Estos archivos mandan el texto de búsqueda al servidor en cada tecla. Usa `useDebouncedSearchTerm` (src/hooks/useDebouncedValue.ts) y consulta con el '
      + 'término retrasado; si de verdad no consulta mientras se teclea, agrégalo a EXCEPCIONES con el motivo. Ver SCRUM-1176.',
    ).toEqual([])
  })

  it('las excepciones siguen siendo vigentes (no quedan archivos que ya no existen o que ya usan la espera)', () => {
    const porArchivo = new Map(conCampo.map(c => [c.archivo, c.codigo]))
    for (const archivo of Object.keys(EXCEPCIONES)) {
      expect(porArchivo.has(archivo), `${archivo} ya no tiene un campo de búsqueda: quítalo de EXCEPCIONES`).toBe(true)
      expect(CON_ESPERA.test(porArchivo.get(archivo) ?? ''), `${archivo} ya usa la espera: quítalo de EXCEPCIONES`).toBe(false)
    }
  })
})
