import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi, type Notification } from '@/api/notificationsApi'
import { Button } from '@/components/ui/Button'
import { IcoBell } from '@/components/icons'

const POLL_INTERVAL_MS = 45_000

export default function NotificationBell() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn:  notificationsApi.unreadCount,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const { data: list } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn:  () => notificationsApi.list(),
    enabled:  open,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const handleClickNotification = (n: Notification) => {
    if (!n.is_read) markReadMutation.mutate(n.id)
    if (n.link_url) {
      setOpen(false)
      navigate(n.link_url)
    }
  }

  const notifications = list?.data ?? []

  return (
    <div className="relative">
      <Button
        variant="icon"
        onClick={() => setOpen(o => !o)}
        title={t('common:notifications.title')}
        className="relative min-h-[44px] min-w-[44px] flex items-center justify-center">
        <IcoBell />
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
            data-testid="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 w-80 max-w-[90vw]">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-700">
              <span className="text-xs font-semibold text-slate-500">{t('common:notifications.title')}</span>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  className="text-[11px] text-teal-600 dark:text-teal-400 font-medium hover:underline">
                  {t('common:notifications.markAllRead')}
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="px-4 py-6 text-xs text-slate-400 text-center">{t('common:notifications.empty')}</p>
              )}
              {notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={`w-full text-left px-4 py-2.5 text-xs border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700 ${
                    n.is_read ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100 font-medium'
                  }`}>
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{n.content.subject}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(n.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
