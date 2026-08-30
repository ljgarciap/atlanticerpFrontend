import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Activity, TipoActividad } from '@/types/project'
import { ACTIVITY_META } from '@/types/project'
import { Button } from '@/components/ui/Button'
import { ICONS_BY_NAME, IcoClose } from '@/components/icons'

interface Props {
  activities:   Activity[]
  canWrite?:    boolean
  onAdd:        (data: { tipo: TipoActividad; fecha: string; notas: string; siguiente?: string }) => void
  onDelete:     (id: number) => void
}

const TIPOS: TipoActividad[] = ['llamada', 'email', 'reunion', 'whatsapp', 'visita', 'otro']

export default function ActivityTimeline({ activities, canWrite = false, onAdd, onDelete }: Props) {
  const { t } = useTranslation(['crm', 'common'])
  const [tipo,     setTipo]     = useState<TipoActividad>('llamada')
  const [fecha,    setFecha]    = useState(new Date().toISOString().slice(0, 10))
  const [siguiente,setSiguiente]= useState('')
  const [notas,    setNotas]    = useState('')

  const handleAdd = () => {
    if (!notas.trim()) return
    onAdd({ tipo, fecha, notas, siguiente: siguiente || undefined })
    setNotas(''); setSiguiente('')
  }

  return (
    <div className="mt-5 pt-5 border-t-2 border-slate-200">
      <h3 className="text-[15px] font-bold text-slate-900 mb-3 flex items-center justify-between">
        <span>{t('crm:activity.timeline')}</span>
        <span className="bg-blue-800 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full">{activities.length}</span>
      </h3>

      {/* Form — only visible to users with crm.write */}
      {canWrite && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">{t('crm:activity.logNew')}</p>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {TIPOS.map(tp => {
              const m = ACTIVITY_META[tp]
              return (
                <button key={tp} type="button"
                  onClick={() => setTipo(tp)}
                  className={`py-1.5 text-[11px] font-semibold rounded-lg border-2 transition-all ${
                    tipo === tp
                      ? ''
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                  }`}
                  style={tipo === tp
                    ? { background: m.color, color: 'white', borderColor: m.color }
                    : undefined}>
                  {t(`crm:activityTypes.${tp}`)}
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-xs text-slate-500 block mb-1">{t('crm:activity.fecha')}</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-2 text-base md:text-[13px] focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">{t('crm:activity.siguiente')}</label>
              <input type="date" value={siguiente} onChange={e => setSiguiente(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-2 text-base md:text-[13px] focus:outline-none focus:border-primary" />
            </div>
          </div>
          <textarea value={notas} onChange={e => setNotas(e.target.value)}
            placeholder={t('crm:activity.notasPlaceholder')}
            className="w-full border border-slate-200 rounded-lg px-2 py-2 text-base md:text-[13px] resize-none h-16 focus:outline-none focus:border-primary mb-2" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setNotas(''); setSiguiente('') }}
              className="!px-3 !py-2 !min-h-[40px]">{t('common:actions.clear')}</Button>
            <Button type="button" onClick={handleAdd}
              className="!px-3 !py-2 !min-h-[40px]">{t('crm:activity.add')}</Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {activities.length === 0 && (
        <p className="text-center text-[13px] text-slate-400 py-6">{t('crm:activity.noActivity')}</p>
      )}
      <div className="relative pl-7 space-y-3.5">
        <div className="absolute left-[11px] top-1 bottom-1 w-[2px] bg-slate-200" />
        {activities.map(act => {
          const m = ACTIVITY_META[act.tipo]
          const Icon = ICONS_BY_NAME[m.icon]
          return (
            <div key={act.id} className="relative">
              <div className="absolute -left-[23px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-white border-[3px] border-white"
                style={{ background: m.color }}>
                <Icon size={12} />
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-2.5"
                style={{ borderLeftWidth: 3, borderLeftColor: m.color }}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: m.color }}>{t(`crm:activityTypes.${act.tipo}`)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">{act.fecha}</span>
                    {canWrite && (
                      <button onClick={() => onDelete(act.id)} className="text-slate-300 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 leading-none">
                        <IcoClose size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[13px] text-slate-600 whitespace-pre-wrap">{act.notas}</p>
                {act.siguiente && (
                  <p className="text-[11px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-100">
                    {t('crm:activity.followup')} {act.siguiente}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
