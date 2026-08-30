import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gerenciaApi } from '@/api/gerenciaApi'
import { useUsers } from '@/hooks/useUsers'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPlus, IcoPencil } from '@/components/icons'
import type { ReglaAprobacion, SaveReglaAprobacionPayload } from '@/types/gerencia'

// SCRUM-163 (REQ-101) — panel de administración de REGLA_APROBACION, exclusivo de superadmin
// (gate real vive en el backend, ver routes/gerencia.php — el botón que abre este panel en
// GerenciaPage.tsx ya está condicionado a user?.role === 'superadmin', esto es solo defensa en
// profundidad de UX). El catálogo de `tipo` es texto libre a propósito: la matriz real de tipos
// vs. aprobadores está PENDIENTE DE DEFINIR CON EL CLIENTE (ver docblock de ReglaAprobacion en el
// backend) — esta pantalla solo da la infraestructura para cargarla cuando esté definida.

const QUERY_KEY = ['gerencia-reglas-aprobacion']

interface FormState {
  tipo:          string
  activo:        boolean
  observaciones: string
  aprobador_ids: number[]
}

const EMPTY_FORM: FormState = { tipo: '', activo: true, observaciones: '', aprobador_ids: [] }

interface Props {
  onClose: () => void
}

export default function GerenciaAprobacionesPanel({ onClose }: Props) {
  const qc = useQueryClient()
  const { data: reglas, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn:  gerenciaApi.reglasAprobacion.list,
  })
  const { data: usersResp } = useUsers({ per_page: 100, is_active: true })
  const users = usersResp?.data ?? []

  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY })

  const createMutation = useMutation({
    mutationFn: (payload: SaveReglaAprobacionPayload) => gerenciaApi.reglasAprobacion.create(payload),
    onSuccess:  () => { invalidate(); setEditingId(null); setForm(EMPTY_FORM) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SaveReglaAprobacionPayload }) =>
      gerenciaApi.reglasAprobacion.update(id, payload),
    onSuccess: () => { invalidate(); setEditingId(null); setForm(EMPTY_FORM) },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => gerenciaApi.reglasAprobacion.remove(id),
    onSuccess:  invalidate,
  })

  function startEdit(regla: ReglaAprobacion) {
    setEditingId(regla.id)
    setForm({
      tipo:          regla.tipo,
      activo:        regla.activo,
      observaciones: regla.observaciones ?? '',
      aprobador_ids: regla.aprobadores.map(a => a.id),
    })
    setError(null)
  }

  function startNew() {
    setEditingId('new')
    setForm(EMPTY_FORM)
    setError(null)
  }

  function toggleAprobador(id: number) {
    setForm(f => ({
      ...f,
      aprobador_ids: f.aprobador_ids.includes(id)
        ? f.aprobador_ids.filter(x => x !== id)
        : [...f.aprobador_ids, id],
    }))
  }

  function submit() {
    setError(null)
    if (form.tipo.trim() === '') { setError('El tipo de solicitud es obligatorio.'); return }
    if (form.aprobador_ids.length === 0) { setError('Elegí al menos un aprobador.'); return }

    const payload: SaveReglaAprobacionPayload = {
      tipo:          form.tipo.trim(),
      activo:        form.activo,
      observaciones: form.observaciones.trim() || null,
      aprobador_ids: form.aprobador_ids,
    }

    const mutation = editingId === 'new'
      ? createMutation.mutateAsync(payload)
      : updateMutation.mutateAsync({ id: editingId as number, payload })

    mutation.catch(e => {
      if (isAxiosError(e) && e.response?.data?.message) {
        setError(String(e.response.data.message))
      } else {
        setError('No se pudo guardar la regla.')
      }
    })
  }

  const saving = createMutation.isPending || updateMutation.isPending
  const isEditing = editingId !== null

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Configurar reglas de aprobación</h2>
            <p className="text-xs text-slate-400 mt-0.5">Tipo de solicitud → quién puede aprobarla</p>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
          {isLoading ? (
            <p className="text-sm text-slate-400 text-center py-8">Cargando...</p>
          ) : (
            <div className="space-y-2">
              {(reglas ?? []).length === 0 && !isEditing && (
                <p className="text-sm text-slate-400 text-center py-8">
                  Sin reglas configuradas todavía. La matriz real (qué tipo aprueba cada persona) sigue pendiente de definir con el cliente.
                </p>
              )}
              {(reglas ?? []).map(regla => (
                <div key={regla.id} className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{regla.tipo}</span>
                      {!regla.activo && (
                        <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">Inactiva</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {regla.aprobadores.map(a => `${a.first_name} ${a.last_name}`).join(', ') || 'Sin aprobadores'}
                    </p>
                    {regla.observaciones && (
                      <p className="text-[11px] text-slate-400 mt-0.5">{regla.observaciones}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="icon" onClick={() => startEdit(regla)}><IcoPencil size={14} /></Button>
                    <Button
                      variant="danger-text"
                      className="!text-xs"
                      onClick={() => { if (confirm(`¿Eliminar la regla "${regla.tipo}"?`)) deleteMutation.mutate(regla.id) }}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isEditing ? (
            <div className="border border-slate-200 dark:border-slate-600 rounded-xl p-4 space-y-3">
              <div>
                <label className="text-[11px] text-slate-500 font-medium">Tipo de solicitud</label>
                <input
                  type="text"
                  value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  placeholder='Ej. "Orden de compra fuera de rango"'
                  className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-500 font-medium">Aprobadores</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {users.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleAprobador(u.id)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        form.aprobador_ids.includes(u.id)
                          ? 'bg-teal-100 dark:bg-teal-900/40 border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {u.first_name} {u.last_name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 font-medium">Observaciones (opcional)</label>
                <textarea
                  value={form.observaciones}
                  onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                />
                Regla activa
              </label>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex items-center gap-2 pt-1">
                <Button variant="primary" onClick={submit} loading={saving}>Guardar</Button>
                <Button variant="secondary" onClick={() => { setEditingId(null); setError(null) }}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={startNew} className="flex items-center gap-1.5">
              <IcoPlus size={14} /> Nueva regla
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
