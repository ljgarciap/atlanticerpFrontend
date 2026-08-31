import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  useReplacementRequests, useGenerateReplacementOrder,
  useSearchSubstitutes, useSubstituteSearchResult, useCreateReplacementRequest,
} from '@/hooks/useCompras'
import { comprasApi } from '@/api/comprasApi'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import SalesProjectPicker from '@/components/compras/SalesProjectPicker'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import type { ComprasCatalogProduct, SubstituteSearchResult } from '@/types/compras'

type Chip = 'all' | 'pendiente' | 'pendiente_gerencia' | 'aprobada' | 'rechazada'
type Tab = 'search' | 'requests'
type SearchMethod = 'catalog' | 'photo' | 'datasheet'

function apiErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

/**
 * SCRUM-245→249 (REQ-182→186, ADR-SCRUM245) — Sustitutos. "Solicitudes" (Oleada 1) + "Buscar
 * sustituto" (Oleada 2: catálogo sin IA, foto/ficha técnica con IA, familia obligatoria).
 */
export default function ReplacementRequestsPage() {
  const { t } = useTranslation(['common', 'compras'])
  const [tab, setTab] = useState<Tab>('requests')

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900">{t('compras:replacements.title')}</h1>
      </div>

      <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-4 w-fit">
        <Button
          variant={tab === 'search' ? 'primary' : 'secondary'}
          className="!rounded-none !border-0"
          onClick={() => setTab('search')}
        >
          {t('compras:replacements.tabs.search')}
        </Button>
        <Button
          variant={tab === 'requests' ? 'primary' : 'secondary'}
          className="!rounded-none !border-0"
          onClick={() => setTab('requests')}
        >
          {t('compras:replacements.tabs.requests')}
        </Button>
      </div>

      {tab === 'search' ? <SearchTab /> : <RequestsTab />}
    </div>
  )
}

function RequestsTab() {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()

  const [chip, setChip] = useState<Chip>('all')
  const [errorById, setErrorById] = useState<Record<number, string>>({})
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const { data, isFetching } = useReplacementRequests(chip === 'all' ? undefined : chip, page, perPage)
  const generateOrder = useGenerateReplacementOrder()
  const requests = data?.data ?? []
  const meta = data?.meta

  const handleGenerate = (id: number) => {
    setErrorById(prev => { const next = { ...prev }; delete next[id]; return next })
    generateOrder.mutate(id, {
      onSuccess: res => navigate(`/compras/ordenes/${res.order_id}`),
      onError:   err => setErrorById(prev => ({ ...prev, [id]: apiErrorMessage(err, t('compras:replacements.errors.generateGeneric')) })),
    })
  }

  return (
    <>
      <div className="flex gap-2 mb-4">
        {(['all', 'pendiente', 'pendiente_gerencia', 'aprobada', 'rechazada'] as Chip[]).map(c => (
          <Button
            key={c} variant="outline" active={chip === c}
            className="!text-xs !px-3 !py-1.5"
            onClick={() => { setChip(c); setPage(1) }}
          >
            {c === 'all' ? t('compras:replacements.chips.all') : t(`compras:replacements.status.${c}`)}
          </Button>
        ))}
      </div>

      <Card variant="panel" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:replacements.table.original')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:replacements.table.proposed')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:replacements.table.project')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:replacements.table.status')}</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:orders.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.length === 0 && !isFetching && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">{t('compras:replacements.table.empty')}</td>
              </tr>
            )}
            {requests.map(r => (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-600">{r.original_product_name}</td>
                <td className="px-4 py-3 text-slate-600">{r.proposed_product_name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{r.sales_project_name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{t(`compras:replacements.status.${r.status}`)}</td>
                <td className="px-4 py-3 text-right">
                  {r.status === 'rechazada' && r.generated_order_id === null && (
                    <>
                      <Button
                        variant="outline" className="!px-3 !py-1.5 !text-xs"
                        loading={generateOrder.isPending}
                        onClick={() => handleGenerate(r.id)}
                      >
                        {t('compras:replacements.actions.generateOrder')}
                      </Button>
                      {errorById[r.id] && (
                        <p className="text-xs text-red-600 mt-1">{errorById[r.id]}</p>
                      )}
                    </>
                  )}
                  {r.generated_order_id !== null && (
                    <button
                      onClick={() => navigate(`/compras/ordenes/${r.generated_order_id}`)}
                      className="text-primary hover:underline text-xs font-semibold"
                    >
                      {t('compras:replacements.actions.viewOrder')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {meta && (
        <Pagination
          meta={meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={p => { setPerPage(p); setPage(1) }}
        />
      )}
    </>
  )
}

/** Fila unificada de resultado — catálogo (sin IA) y foto/ficha (con IA) comparten esta forma. */
interface ResultRow {
  catalog_product_id: number
  reference:            string
  name:                  string
  // SCRUM-246 (rebote de Gerencia Test 2026-08-09) — Categoría, columna nueva del orden exacto
  // pedido: Producto candidato, Categoría, Stock disponible, Precio, % de similitud, Acción.
  category:               string | null
  price_full:             number
  cost:                    number | null
  stock_quantity:          number | null
  // Lote 4 (SCRUM-246, 2026-08-17) — método "catalog" ahora SÍ calcula similitud server-side
  // (SubstituteSimilarityService); sigue null solo para foto/ficha técnica (hueco documentado a
  // propósito, fuera de alcance de este batch).
  similarity_percent:      number | null
  reasoning:                string | null
}

function fromCatalogProduct(p: ComprasCatalogProduct): ResultRow {
  return {
    catalog_product_id: p.id, reference: p.reference, name: p.name,
    category: p.category ?? null,
    price_full: p.price_full, cost: p.cost, stock_quantity: p.stock_quantity,
    similarity_percent: p.similarity_percent ?? null, reasoning: null,
  }
}

function fromSearchResult(r: SubstituteSearchResult): ResultRow {
  return {
    catalog_product_id: r.catalog_product_id, reference: r.reference, name: r.name,
    category: r.category ?? null,
    price_full: r.price_full, cost: r.cost, stock_quantity: r.stock_quantity,
    similarity_percent: r.similarity_percent, reasoning: r.reasoning,
  }
}

/**
 * SCRUM-246 (rebote de Gerencia Test 2026-08-09) — "% de similitud" siempre como número + barra
 * visual, nunca solo el número. Sin dato (método "catalog", sin IA) muestra "—", nunca 0% (0%
 * implicaría "comparado y sin ninguna similitud", distinto de "no se calculó").
 */
function SimilarityBar({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-slate-400 text-xs">—</span>
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div
        className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"
        role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600 tabular-nums">{clamped}%</span>
    </div>
  )
}

function SearchTab() {
  const { t } = useTranslation(['common', 'compras'])

  const [original, setOriginal] = useState<ComprasCatalogProduct | null>(null)
  const [originalSearch, setOriginalSearch] = useState('')
  const [method, setMethod] = useState<SearchMethod>('catalog')

  const [familyId, setFamilyId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [modalProduct, setModalProduct] = useState<ResultRow | null>(null)

  const { data: originalResults } = useQuery({
    queryKey: ['compras/products/replacement-original', originalSearch],
    queryFn:  () => comprasApi.products.search(undefined, originalSearch),
    enabled:  original === null && originalSearch.trim() !== '',
  })

  const { data: families } = useQuery({
    queryKey: ['ventas-diseno/catalog-product-families'],
    queryFn:  () => ventasDisenoApi.catalogProductFamilies.list(),
    enabled:  method !== 'catalog',
  })

  const { data: catalogResults, isFetching: catalogFetching } = useQuery({
    queryKey: ['compras/products/replacement-catalog', catalogSearch, original?.id],
    // Lote 4 (SCRUM-246) — original.id viaja siempre que el input esté habilitado (gateado más
    // abajo a `original !== null`), para que el backend calcule similarity_percent.
    queryFn:  () => comprasApi.products.search(undefined, catalogSearch, original?.id),
    enabled:  method === 'catalog' && original !== null && catalogSearch.trim() !== '',
  })

  const search = useSearchSubstitutes()
  const poll = useSubstituteSearchResult(jobId)

  const handleAiSearch = () => {
    setFormError(null)
    if (original === null) { setFormError(t('compras:replacements.search.chooseOriginalFirst')); return }
    if (familyId === '') { setFormError(t('compras:replacements.search.chooseFamilyRequired')); return }
    if (file === null) { setFormError(t('compras:replacements.search.chooseFileRequired')); return }

    setJobId(null)
    search.mutate({ originalCatalogProductId: original.id, familyId, file }, {
      onSuccess: res => setJobId(res.job_id),
      onError:   err => setFormError(apiErrorMessage(err, t('compras:replacements.errors.searchGeneric'))),
    })
  }

  const results: ResultRow[] = method === 'catalog'
    ? (catalogResults?.data ?? []).filter(p => original === null || p.id !== original.id).map(fromCatalogProduct)
    : (poll.data?.results ?? []).map(fromSearchResult)

  const searching = search.isPending || poll.data?.status === 'pending' || poll.data?.status === 'running'

  return (
    <>
      <Card variant="panel" className="p-5 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
          {t('compras:replacements.search.originalLabel')}
        </h2>
        {original === null ? (
          <div>
            <input
              type="text"
              value={originalSearch}
              onChange={e => setOriginalSearch(e.target.value)}
              placeholder={t('compras:replacements.search.originalPlaceholder')}
              className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {originalResults && originalResults.data.length > 0 && (
              <ul className="mt-2 max-w-md border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                {originalResults.data.map(p => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50">
                    <div>
                      <span className="font-medium text-slate-800">{p.name}</span>
                      <span className="text-slate-400 ml-2">{p.reference}</span>
                    </div>
                    <Button
                      variant="outline" className="!text-xs !px-3 !py-1"
                      onClick={() => { setOriginal(p); setOriginalSearch(''); setJobId(null) }}
                    >
                      {t('common:actions.select')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-800">{original.name}</span>
            <span className="text-slate-400 text-sm">{original.reference}</span>
            <button
              type="button"
              className="text-xs text-primary underline"
              onClick={() => { setOriginal(null); setJobId(null); setFile(null) }}
            >
              {t('compras:replacements.search.originalChange')}
            </button>
          </div>
        )}
      </Card>

      {original !== null && (
        <Card variant="panel" className="p-5 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
            {t('compras:replacements.search.methodLabel')}
          </h2>
          <div className="flex gap-2 mb-4">
            {(['catalog', 'photo', 'datasheet'] as SearchMethod[]).map(m => (
              <Button
                key={m} variant="outline" active={method === m}
                className="!text-xs !px-3 !py-1.5"
                onClick={() => { setMethod(m); setJobId(null); setFormError(null) }}
              >
                {t(`compras:replacements.search.method${m === 'catalog' ? 'Catalog' : m === 'photo' ? 'Photo' : 'Datasheet'}`)}
              </Button>
            ))}
          </div>

          {method === 'catalog' ? (
            <input
              type="text"
              value={catalogSearch}
              onChange={e => setCatalogSearch(e.target.value)}
              placeholder={t('compras:replacements.search.catalogPlaceholder')}
              className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('compras:replacements.search.familyLabel')}
                </label>
                <select
                  value={familyId}
                  onChange={e => setFamilyId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">{t('compras:replacements.search.familyPlaceholder')}</option>
                  {(families?.data ?? []).map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('compras:replacements.search.fileLabel')}
                </label>
                <input
                  type="file"
                  accept={method === 'photo' ? 'image/png,image/jpeg,image/webp,image/gif' : 'application/pdf,image/png,image/jpeg,image/webp,image/gif'}
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
              </div>
              <Button loading={searching} onClick={handleAiSearch}>
                {searching ? t('compras:replacements.search.searching') : t('compras:replacements.search.searchButton')}
              </Button>
            </div>
          )}

          {formError && <p className="text-xs text-red-600 mt-3">{formError}</p>}
          {poll.data?.status === 'failed' && (
            <p className="text-xs text-red-600 mt-3">{poll.data.error ?? t('compras:replacements.errors.searchGeneric')}</p>
          )}
        </Card>
      )}

      {original !== null && (method === 'catalog' ? catalogSearch.trim() !== '' : jobId !== null) && (
        <Card variant="panel" className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              {/* SCRUM-246 (rebote de Gerencia Test 2026-08-09) — orden exacto pedido: Producto
                  candidato, Categoría, Stock disponible, Precio, % de similitud, Acción. Costo
                  sale de la tabla (no forma parte del pedido); Categoría/Similitud se ven siempre,
                  sin importar el método — "Siempre en formato tabla" del rebote incluye el shape
                  de columnas fijo, no solo el contenedor visual. */}
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:replacements.search.resultsTable.product')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:replacements.search.resultsTable.category')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:replacements.search.resultsTable.stock')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:replacements.search.resultsTable.price')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:replacements.search.resultsTable.similarity')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:replacements.search.resultsTable.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.length === 0 && (catalogFetching || searching) && (
                // SCRUM-245 (hallazgo QA 2026-07-20) — mientras la búsqueda está en curso el
                // cuerpo de la tabla quedaba completamente en blanco (ni el estado vacío ni los
                // resultados se mostraban todavía), indistinguible de "no pasó nada" al escribir.
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-4 h-4 rounded-full animate-spin border-2 border-slate-300 border-t-primary" />
                      {t('compras:replacements.search.resultsLoading')}
                    </span>
                  </td>
                </tr>
              )}
              {results.length === 0 && !catalogFetching && !searching && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">
                    {t('compras:replacements.search.resultsEmpty')}
                  </td>
                </tr>
              )}
              {results.map(r => (
                <tr key={r.catalog_product_id} className="hover:bg-slate-50 transition-colors align-top">
                  <td className="px-4 py-3 text-slate-600">
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-400">{r.reference}</div>
                    {r.reasoning && <div className="text-xs text-slate-400 mt-1 max-w-sm">{r.reasoning}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.category ? t(`compras:newOrder.newProduct.categories.${r.category}`) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.stock_quantity ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">${r.price_full.toFixed(2)}</td>
                  <td className="px-4 py-3"><SimilarityBar percent={r.similarity_percent} /></td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={() => setModalProduct(r)}>
                      {t('compras:replacements.actions.generateRequest')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {modalProduct !== null && original !== null && (
        <GenerateRequestModal
          original={original}
          proposed={modalProduct}
          onClose={() => setModalProduct(null)}
        />
      )}
    </>
  )
}

function GenerateRequestModal({ original, proposed, onClose }: {
  original: ComprasCatalogProduct
  proposed: ResultRow
  onClose:  () => void
}) {
  const { t } = useTranslation(['common', 'compras'])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [projectLabel, setProjectLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const createRequest = useCreateReplacementRequest()

  const estimatedMargin = proposed.cost !== null && proposed.price_full > 0
    ? Math.round(((proposed.price_full - proposed.cost) / proposed.price_full) * 100 * 100) / 100
    : null

  const handleSubmit = () => {
    setError(null)
    if (projectId === null) { setError(t('compras:replacements.generateModal.projectRequired')); return }

    createRequest.mutate({
      original_catalog_product_id: original.id,
      proposed_catalog_product_id: proposed.catalog_product_id,
      sales_project_id:            projectId,
    }, {
      onSuccess: () => setSuccess(true),
      onError:   err => setError(apiErrorMessage(err, t('compras:replacements.errors.createRequestGeneric'))),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="panel" className="w-full max-w-md p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-4">{t('compras:replacements.generateModal.title')}</h2>

        {success ? (
          <div>
            <p className="text-sm text-green-700 mb-4">{t('compras:replacements.generateModal.success')}</p>
            <Button onClick={onClose}>{t('common:actions.close')}</Button>
          </div>
        ) : (
          <>
            <div className="text-sm mb-2">
              <span className="text-slate-400">{t('compras:replacements.generateModal.original')}: </span>
              <span className="text-slate-800">{original.name}</span>
            </div>
            <div className="text-sm mb-2">
              <span className="text-slate-400">{t('compras:replacements.generateModal.proposed')}: </span>
              <span className="text-slate-800">{proposed.name}</span>
            </div>
            <div className="text-sm mb-4">
              <span className="text-slate-400">{t('compras:replacements.generateModal.margin')}: </span>
              <span className="text-slate-800">{estimatedMargin !== null ? `${estimatedMargin}%` : '—'}</span>
            </div>

            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('compras:replacements.generateModal.project')}
            </label>
            <SalesProjectPicker
              projectId={projectId}
              projectLabel={projectLabel}
              onChange={(id, label) => { setProjectId(id); setProjectLabel(label) }}
              emptyLabel={t('compras:replacements.generateModal.projectPlaceholder')}
            />

            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={onClose}>{t('compras:replacements.generateModal.cancel')}</Button>
              <Button loading={createRequest.isPending} onClick={handleSubmit}>
                {t('compras:replacements.generateModal.submit')}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
