import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useUsers, useToggleUserStatus, usePendingUsers, useRejectUser, useResetUserMfa } from '@/hooks/useUsers'
import { rolesApi } from '@/api/rolesApi'
import UserTable from '@/components/security/UserTable'
import UserFormDrawer from '@/components/security/UserFormDrawer'
import ApproveUserModal from '@/components/security/ApproveUserModal'
import UserVisibilityModal from '@/components/security/UserVisibilityModal'
import BulkModuleVisibilityModal from '@/components/security/BulkModuleVisibilityModal'
import type { UserListItem } from '@/api/usersApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoChevronLeft, IcoChevronRight } from '@/components/icons'

type Tab = 'active' | 'inactive' | 'pending'

export default function UsersPage() {
  const { t }     = useTranslation(['common', 'security'])
  const { user: authUser } = useAuthStore()
  const actorPermissions   = authUser?.permissions ?? []
  const actorHasSuperadmin = actorPermissions.includes('superadmin.all')
  const canManage           = actorHasSuperadmin || actorPermissions.includes('security.users')
  const actorLevel          = authUser?.security_level ?? 0

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('active')

  // ── Active users tab state ─────────────────────────────────────────────────
  const [search,      setSearch]      = useState('')
  const [query,       setQuery]       = useState('')
  const [roleFilter,  setRoleFilter]  = useState<number | ''>('')
  const [page,        setPage]        = useState(1)
  const [perPage,     setPerPage]     = useState(20)
  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null)
  const [visibilityUser, setVisibilityUser] = useState<UserListItem | null>(null)
  const [bulkVisibilityOpen, setBulkVisibilityOpen] = useState(false)

  const { data, isFetching } = useUsers({ search: query, page, per_page: perPage, is_active: true, role_id: roleFilter || undefined })
  const toggleStatus         = useToggleUserStatus()
  const resetMfa             = useResetUserMfa()
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list })

  const users    = data?.data ?? []
  const meta     = data?.meta
  const lastPage = meta?.last_page ?? 1

  // ── Inactive users tab state ───────────────────────────────────────────────
  const [inactiveSearch, setInactiveSearch] = useState('')
  const [inactiveQuery,  setInactiveQuery]  = useState('')
  const [inactivePage,   setInactivePage]   = useState(1)

  const { data: inactiveData, isFetching: inactiveFetching } =
    useUsers({ search: inactiveQuery, page: inactivePage, per_page: 20, is_active: false })

  const inactiveUsers    = inactiveData?.data ?? []
  const inactiveMeta     = inactiveData?.meta
  const inactiveLastPage = inactiveMeta?.last_page ?? 1

  // ── Pending tab state ──────────────────────────────────────────────────────
  const { data: pendingData } = usePendingUsers()
  const pendingUsers          = pendingData?.data ?? []
  const pendingCount          = pendingUsers.length

  const rejectUser = useRejectUser()
  const [approvingUser,  setApprovingUser]  = useState<UserListItem | null>(null)
  const [pendingSuccess, setPendingSuccess] = useState('')
  const [confirmDialog,  setConfirmDialog]  = useState<{ msg: string; onConfirm: () => void } | null>(null)

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSearch = () => { setQuery(search); setPage(1) }

  const handleToggle = (user: UserListItem) => {
    const msg = user.is_active ? t('security:users.messages.deactivateConfirm') : null
    if (msg) {
      setConfirmDialog({ msg, onConfirm: () => toggleStatus.mutate({ id: user.id, is_active: !user.is_active }) })
      return
    }
    toggleStatus.mutate({ id: user.id, is_active: !user.is_active })
  }

  const openCreate  = () => { setEditingUser(null); setDrawerOpen(true) }
  const openEdit    = (u: UserListItem) => { setEditingUser(u); setDrawerOpen(true) }
  const closeDrawer = () => setDrawerOpen(false)

  const handleReject = (user: UserListItem) => {
    setConfirmDialog({
      msg: t('security:users.pending.rejectConfirm'),
      onConfirm: () => rejectUser.mutate(user.id, {
        onSuccess: () => setPendingSuccess(t('security:users.pending.messages.rejected')),
      }),
    })
  }

  const handleApproved = () => {
    setApprovingUser(null)
    setPendingSuccess(t('security:users.pending.messages.approved'))
  }

  const handleResetMfa = (user: UserListItem) => {
    setConfirmDialog({
      msg: t('security:users.messages.resetMfaConfirm', { name: `${user.first_name} ${user.last_name}` }),
      onConfirm: () => resetMfa.mutate(user.id),
    })
  }

  return (
    <div>
      {/* ── Tab bar ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            active={activeTab === 'active'}
            className="!px-3.5 !py-2 !text-sm !font-medium"
            onClick={() => setActiveTab('active')}
          >
            {t('security:users.tabs.active')}
          </Button>
          <Button
            variant="outline"
            active={activeTab === 'inactive'}
            className="!px-3.5 !py-2 !text-sm !font-medium"
            onClick={() => { setActiveTab('inactive'); setInactiveQuery(''); setInactiveSearch(''); setInactivePage(1) }}
          >
            {t('security:users.tabs.inactive')}
          </Button>
          {canManage && (
            <Button
              variant="outline"
              active={activeTab === 'pending'}
              className="!px-3.5 !py-2 !text-sm !font-medium"
              onClick={() => { setActiveTab('pending'); setPendingSuccess('') }}
            >
              {t('security:users.pending.tabLabel')}
              {pendingCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white"
                  style={{ background: '#9fc54d' }}>
                  {pendingCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>

      <div>
        {/* ── Active users tab ── */}
        {activeTab === 'active' && (
          <>
            <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
              <h1 className="text-lg font-bold text-slate-900">{t('security:users.title')}</h1>
              <div className="flex gap-2">
                {actorHasSuperadmin && (
                  <Button variant="secondary" onClick={() => setBulkVisibilityOpen(true)}>
                    {t('security:users.actions.bulkVisibility')}
                  </Button>
                )}
                {canManage && (
                  <Button onClick={openCreate}>
                    {t('security:users.actions.create')}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder={t('common:labels.searchPlaceholder')}
                className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <select
                value={roleFilter}
                onChange={e => { setRoleFilter(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white">
                <option value="">{t('security:users.filters.allRoles')}</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <Button variant="outline" onClick={handleSearch}>
                {t('common:actions.search')}
              </Button>
            </div>

            <UserTable
              users={users}
              roles={roles}
              loading={isFetching}
              canManage={canManage}
              actorLevel={actorLevel}
              actorHasSuperadmin={actorHasSuperadmin}
              onEdit={openEdit}
              onToggleStatus={handleToggle}
              onResetMfa={handleResetMfa}
              onVisibility={setVisibilityUser}
            />

            {meta && (
              <div className="flex flex-wrap gap-2 items-center justify-between mt-4 text-sm text-slate-600">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    {t('common:pagination.showing', {
                      from:  meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1,
                      to:    Math.min(meta.current_page * meta.per_page, meta.total),
                      total: meta.total,
                    })}
                  </span>
                  <select
                    value={perPage}
                    onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
                    className="px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white">
                    {[5, 10, 20, 50].map(n => (
                      <option key={n} value={n}>{n} {t('common:pagination.perPage')}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    <IcoChevronLeft size={13} />
                  </Button>
                  {Array.from({ length: Math.min(lastPage, 7) }, (_, i) => {
                    const pg = page <= 4 ? i + 1 : page - 3 + i
                    if (pg < 1 || pg > lastPage) return null
                    return (
                      <Button
                        key={pg}
                        variant="outline"
                        active={pg === page}
                        className="!px-3 !py-1.5 !text-xs"
                        onClick={() => setPage(pg)}
                      >
                        {pg}
                      </Button>
                    )
                  })}
                  <Button
                    variant="outline"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={page >= lastPage}
                    onClick={() => setPage(p => Math.min(lastPage, p + 1))}
                  >
                    <IcoChevronRight size={13} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Inactive users tab ── */}
        {activeTab === 'inactive' && (
          <>
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-lg font-bold text-slate-900">{t('security:users.inactiveTitle')}</h1>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={inactiveSearch}
                onChange={e => setInactiveSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setInactiveQuery(inactiveSearch); setInactivePage(1) } }}
                placeholder={t('common:labels.searchPlaceholder')}
                className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <Button variant="outline" onClick={() => { setInactiveQuery(inactiveSearch); setInactivePage(1) }}>
                {t('common:actions.search')}
              </Button>
            </div>

            <UserTable
              users={inactiveUsers}
              roles={roles}
              loading={inactiveFetching}
              canManage={canManage}
              actorLevel={actorLevel}
              actorHasSuperadmin={actorHasSuperadmin}
              onEdit={openEdit}
              onToggleStatus={handleToggle}
              onResetMfa={handleResetMfa}
              onVisibility={setVisibilityUser}
            />

            {inactiveMeta && inactiveLastPage > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
                <span className="text-xs text-slate-500">
                  {t('common:pagination.showing', {
                    from:  inactiveMeta.total === 0 ? 0 : (inactiveMeta.current_page - 1) * inactiveMeta.per_page + 1,
                    to:    Math.min(inactiveMeta.current_page * inactiveMeta.per_page, inactiveMeta.total),
                    total: inactiveMeta.total,
                  })}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={inactivePage <= 1}
                    onClick={() => setInactivePage(p => Math.max(1, p - 1))}
                  >
                    <IcoChevronLeft size={13} />
                  </Button>
                  {Array.from({ length: Math.min(inactiveLastPage, 7) }, (_, i) => {
                    const pg = inactivePage <= 4 ? i + 1 : inactivePage - 3 + i
                    if (pg < 1 || pg > inactiveLastPage) return null
                    return (
                      <Button
                        key={pg}
                        variant="outline"
                        active={pg === inactivePage}
                        className="!px-3 !py-1.5 !text-xs"
                        onClick={() => setInactivePage(pg)}
                      >
                        {pg}
                      </Button>
                    )
                  })}
                  <Button
                    variant="outline"
                    className="!px-3 !py-1.5 !text-xs"
                    disabled={inactivePage >= inactiveLastPage}
                    onClick={() => setInactivePage(p => Math.min(inactiveLastPage, p + 1))}
                  >
                    <IcoChevronRight size={13} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Pending tab ── */}
        {activeTab === 'pending' && (
          <>
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-lg font-bold text-slate-900">{t('security:users.pending.title')}</h1>
            </div>

            {pendingSuccess && (
              <div className="mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
                {pendingSuccess}
              </div>
            )}

            {pendingUsers.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-12 text-center">
                <p className="text-slate-400 text-sm">{t('security:users.pending.empty')}</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {t('security:users.pending.columns.name')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {t('security:users.pending.columns.email')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">
                        {t('security:users.pending.columns.department')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {t('security:users.pending.columns.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingUsers.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-800">
                            {u.first_name} {u.last_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">{u.email}</td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                          {u.department?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="accent"
                              className="!px-3 !py-1.5 !text-xs"
                              onClick={() => { setPendingSuccess(''); setApprovingUser(u) }}
                            >
                              {t('security:users.pending.approve')}
                            </Button>
                            <Button
                              variant="danger"
                              className="!px-3 !py-1.5 !text-xs"
                              disabled={rejectUser.isPending}
                              onClick={() => handleReject(u)}
                            >
                              {t('security:users.pending.reject')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Drawers / Modals ── */}
      {drawerOpen && (
        <UserFormDrawer
          user={editingUser}
          onClose={closeDrawer}
          onSaved={closeDrawer}
        />
      )}

      {approvingUser && (
        <ApproveUserModal
          user={approvingUser}
          onClose={() => setApprovingUser(null)}
          onApproved={handleApproved}
        />
      )}

      {visibilityUser && (
        <UserVisibilityModal
          user={visibilityUser}
          onClose={() => setVisibilityUser(null)}
        />
      )}

      {bulkVisibilityOpen && (
        <BulkModuleVisibilityModal onClose={() => setBulkVisibilityOpen(false)} />
      )}

      {confirmDialog && (
        <div className="fixed inset-0 bg-slate-900/50 z-[2000] flex items-center justify-center p-4">
          <Card variant="modal" className="p-6 max-w-sm w-full">
            <p className="text-sm text-slate-700 dark:text-slate-200 mb-5 leading-relaxed">{confirmDialog.msg}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmDialog(null)}>
                {t('common:actions.cancel')}
              </Button>
              <Button variant="danger" onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null) }}>
                {t('common:actions.confirm')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
