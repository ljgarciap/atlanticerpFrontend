import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserTable from './UserTable'
import type { UserListItem } from '@/api/usersApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

function makeUser(overrides: Partial<UserListItem> = {}): UserListItem {
  return {
    id: 5, first_name: 'Juan', last_name: 'García', email: 'juan@atlantic.test', phone: null,
    job_title: null, hire_date: null, manager: null,
    is_active: true, mfa_enabled: false, notes: null, department: null, extra_permissions: [],
    security_level: { id: 3, level: 3, name: 'Nivel 3' }, roles: [],
    role_id: 1, additional_role_ids: [], approve_large_amounts: false, manage_users: false,
    ...overrides,
  }
}

function renderTable(opts: { users?: UserListItem[]; actorHasSuperadmin?: boolean; canResetPassword?: boolean; canManage?: boolean; onResetPassword?: (u: UserListItem) => void } = {}) {
  const onResetPassword = opts.onResetPassword ?? vi.fn()
  render(
    <UserTable
      users={opts.users ?? [makeUser()]}
      roles={[]}
      loading={false}
      canManage={opts.canManage ?? true}
      actorLevel={9}
      actorHasSuperadmin={opts.actorHasSuperadmin ?? true}
      canResetPassword={opts.canResetPassword ?? true}
      onEdit={vi.fn()}
      onToggleStatus={vi.fn()}
      onResetMfa={vi.fn()}
      onResetPassword={onResetPassword}
      onVisibility={vi.fn()}
    />,
  )
  return { onResetPassword }
}

describe('UserTable — acción "Restablecer contraseña"', () => {
  it('un superadmin ve la acción en cada fila y abre el flujo con ese usuario', () => {
    const { onResetPassword } = renderTable({ users: [makeUser({ id: 1 }), makeUser({ id: 2, email: 'b@x.test' })] })
    const buttons = screen.getAllByText('security:users.actions.resetPassword')
    expect(buttons).toHaveLength(2)

    fireEvent.click(buttons[1])
    expect(onResetPassword).toHaveBeenCalledTimes(1)
    expect((onResetPassword as ReturnType<typeof vi.fn>).mock.calls[0][0].id).toBe(2)
  })

  it('quien gestiona usuarios pero NO es superadmin no la ve', () => {
    renderTable({ actorHasSuperadmin: false, canResetPassword: false, canManage: true })
    expect(screen.queryByText('security:users.actions.resetPassword')).not.toBeInTheDocument()
  })

  it('M1: la acción depende de canResetPassword (rol base), no de actorHasSuperadmin (permiso superadmin.all)', () => {
    renderTable({ actorHasSuperadmin: true, canResetPassword: false, canManage: true })
    expect(screen.queryByText('security:users.actions.resetPassword')).not.toBeInTheDocument()
  })

  it('queda deshabilitada para un usuario inactivo y no dispara el flujo', () => {
    const { onResetPassword } = renderTable({ users: [makeUser({ is_active: false })] })
    const button = screen.getByText('security:users.actions.resetPassword').closest('button')!
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'security:users.resetPassword.inactiveTooltip')

    fireEvent.click(button)
    expect(onResetPassword).not.toHaveBeenCalled()
  })

  it('un usuario activo no tiene tooltip de bloqueo y el botón está habilitado', () => {
    renderTable()
    const button = screen.getByText('security:users.actions.resetPassword').closest('button')!
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('title')
  })
})

// SCRUM-1158 — «Ver como usuario»
describe('UserTable — acción "Ver como"', () => {
  function renderImpersonable(opts: { canImpersonate?: boolean; users?: UserListItem[]; actorId?: number; onImpersonate?: (u: UserListItem) => void } = {}) {
    const onImpersonate = opts.onImpersonate ?? vi.fn()
    render(
      <UserTable
        users={opts.users ?? [makeUser()]}
        roles={[]}
        loading={false}
        canManage
        actorLevel={9}
        actorHasSuperadmin
        canResetPassword
        onEdit={vi.fn()}
        onToggleStatus={vi.fn()}
        onResetMfa={vi.fn()}
        onResetPassword={vi.fn()}
        onVisibility={vi.fn()}
        canImpersonate={opts.canImpersonate ?? true}
        actorId={opts.actorId ?? 1}
        onImpersonate={onImpersonate}
      />,
    )
    return { onImpersonate }
  }

  it('abre el flujo con la persona de la fila', () => {
    const { onImpersonate } = renderImpersonable({ users: [makeUser({ id: 5 }), makeUser({ id: 6, email: 'b@x.test' })] })
    fireEvent.click(screen.getAllByText('security:users.actions.impersonate')[1])
    expect((onImpersonate as ReturnType<typeof vi.fn>).mock.calls[0][0].id).toBe(6)
  })

  it('sin canImpersonate no se ofrece', () => {
    renderImpersonable({ canImpersonate: false })
    expect(screen.queryByText('security:users.actions.impersonate')).not.toBeInTheDocument()
  })

  it('para uno mismo queda deshabilitada y explica por qué', () => {
    renderImpersonable({ users: [makeUser({ id: 1 })], actorId: 1 })
    const btn = screen.getByText('security:users.actions.impersonate').closest('button')!
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'security:impersonate.tooltips.self')
  })

  it('para un superadmin queda deshabilitada y explica por qué', () => {
    renderImpersonable({ users: [makeUser({ roles: ['superadmin'] })] })
    const btn = screen.getByText('security:users.actions.impersonate').closest('button')!
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'security:impersonate.tooltips.superadmin')
  })
})

