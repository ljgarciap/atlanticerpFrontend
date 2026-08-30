import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '@/api/projectsApi'
import type { CreatedShareLink, Document, ShareLink } from '@/types/project'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

interface Props {
  projectId: number
  document:  Document
  onClose:   () => void
}

function linkStatus(link: ShareLink): 'active' | 'revoked' | 'expired' {
  if (link.revoked_at !== null) return 'revoked'
  if (new Date(link.expires_at).getTime() < Date.now()) return 'expired'
  return 'active'
}

export default function ShareLinkModal({ projectId, document: doc, onClose }: Props) {
  const { t } = useTranslation(['crm', 'common'])
  const qc    = useQueryClient()

  // El token real solo existe una vez, en la respuesta de crear el link — a partir
  // de ahí el backend solo guarda su hash, así que no se puede "volver a ver" la
  // URL de un link ya listado (ver CreatedShareLink en types/project.ts).
  const [justCreated, setJustCreated] = useState<CreatedShareLink | null>(null)
  const [copied,      setCopied]      = useState(false)
  const [revokingId,  setRevokingId]  = useState<number | null>(null)

  const queryKey = ['share-links', projectId, doc.id]

  const { data: links = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => projectsApi.listShareLinks(projectId, doc.id),
  })

  const createMutation = useMutation({
    mutationFn: () => projectsApi.createShareLink(projectId, doc.id),
    onSuccess: (created) => {
      setJustCreated(created)
      setCopied(false)
      qc.invalidateQueries({ queryKey })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (id: number) => {
      setRevokingId(id)
      return projectsApi.revokeShareLink(id)
    },
    onSuccess: (_data, id) => {
      setRevokingId(null)
      setJustCreated(current => (current?.id === id ? null : current))
      qc.invalidateQueries({ queryKey })
    },
    onError: () => setRevokingId(null),
  })

  async function handleCopyJustCreated() {
    if (!justCreated) return
    await navigator.clipboard.writeText(justCreated.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusBadge: Record<'active' | 'revoked' | 'expired', string> = {
    active:  'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
    revoked: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
    expired: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
  }
  const statusLabel: Record<'active' | 'revoked' | 'expired', string> = {
    active:  t('crm:shareLink.statusActive'),
    revoked: t('crm:shareLink.statusRevoked'),
    expired: t('crm:shareLink.statusExpired'),
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[1100] flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <Card variant="modal" className="w-full max-w-lg my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[80vh]">
        <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('crm:shareLink.modalTitle')}</h2>
            <p className="text-xs text-slate-400 truncate">{doc.nombre_archivo}</p>
          </div>
          <Button variant="icon" onClick={onClose} className="w-10 h-10 flex items-center justify-center shrink-0"><IcoClose size={16} /></Button>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-4 flex-1 overflow-y-auto">
          <Button
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="w-full"
          >
            {createMutation.isPending ? t('crm:shareLink.generating') : t('crm:shareLink.generate')}
          </Button>

          {justCreated && (
            <div className="rounded-lg border border-[#5BA5A0]/40 bg-[#5BA5A0]/10 dark:bg-[#5BA5A0]/5 px-3 py-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-[#1f6b66] dark:text-[#7fc4bf]">{t('crm:shareLink.newLinkReady')}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 break-all">{justCreated.url}</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-slate-400">
                  {t('crm:shareLink.expiresAt', { date: new Date(justCreated.expires_at).toLocaleDateString() })}
                </p>
                <Button
                  variant="ghost"
                  onClick={() => { void handleCopyJustCreated() }}
                  className="!text-xs min-h-[28px] px-1 shrink-0"
                >
                  {copied ? t('crm:shareLink.copied') : t('crm:shareLink.copy')}
                </Button>
              </div>
              <p className="text-[10px] text-amber-600 dark:text-amber-400">{t('crm:shareLink.copyNowWarning')}</p>
            </div>
          )}

          {isLoading && <p className="text-[12px] text-slate-400">{t('common:labels.loading')}</p>}
          {!isLoading && links.length === 0 && (
            <p className="text-[12px] text-slate-400">{t('crm:shareLink.noLinks')}</p>
          )}

          {links.length > 0 && (
            <ul className="space-y-2">
              {links.map(link => {
                const status = linkStatus(link)
                return (
                  <li
                    key={link.id}
                    className="bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${statusBadge[status]}`}>
                        {statusLabel[status]}
                      </span>
                      <p className="text-[10px] text-slate-400">
                        {t('crm:shareLink.expiresAt', { date: new Date(link.expires_at).toLocaleDateString() })}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] text-slate-400">
                        {link.created_by.first_name} {link.created_by.last_name}
                      </p>
                      {status === 'active' && (
                        <Button
                          variant="danger-text"
                          onClick={() => revokeMutation.mutate(link.id)}
                          disabled={revokingId === link.id}
                          className="!text-xs min-h-[28px] px-1"
                        >
                          {revokingId === link.id ? t('crm:shareLink.revoking') : t('crm:shareLink.revoke')}
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>
            {t('crm:shareLink.close')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
