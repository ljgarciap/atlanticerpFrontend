import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import {
  useBankAccounts, useCreateBankAccount, useBankMovements, useAssignBankMovementAccount,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoDollarSign, IcoEye, IcoPlus } from '@/components/icons'
import BankAccountDetailModal from './BankAccountDetailModal'
import type { BankAccount, BankMovement, CreateBankAccountPayload } from '@/types/adminContab'

/**
 * Batch 1 del cuerpo principal de Admin&Cont (SCRUM-607→611, REQ-530→534) — Cuentas Bancarias.
 * A diferencia de Configuración Fiscal/Datos de la Empresa, NO es exclusiva de Mark: la ven varios
 * roles (Felix, Yaneth, Gerencia), el backend gatea cada acción por su cuenta — sin estado
 * especial de "acceso restringido" acá, el gate de entrada es el `RequirePermission` normal.
 */

type SelectedTab = 'all' | 'deleted' | number

function mutationErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

function formatCurrency(value: number, moneda: string): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: moneda || 'USD' }).format(value)
}

function accountLabel(account: BankAccount, t: (key: string) => string): string {
  return `${account.banco} — ${t(`adminContab:cuentasBancarias.tipos.${account.tipo_cuenta}`)} ****${account.ultimos_4_digitos}`
}

/** Catálogo cerrado de monedas del selector — evita códigos inválidos (hallazgo QA SCRUM-607). */
const MONEDA_OPTIONS = ['USD', 'PAB', 'EUR'] as const

function buildAccountSchema(t: (key: string) => string) {
  return z.object({
    // .trim() antes de .min(1) — un banco de solo espacios debe fallar igual que uno vacío, con
    // el mismo mensaje (antes llegaba al backend y volvía con un mensaje distinto, hallazgo QA SCRUM-607).
    banco: z.string().trim().min(1, t('adminContab:cuentasBancarias.validation.bancoRequired')),
    ultimos_4_digitos: z.string().regex(/^\d{4}$/, t('adminContab:cuentasBancarias.validation.digits4')),
    tipo_cuenta: z.enum(['corriente', 'ahorro', 'tarjeta_credito']),
    moneda: z.enum(MONEDA_OPTIONS),
  })
}
type AccountFormData = z.infer<ReturnType<typeof buildAccountSchema>>

export default function BankAccountsPage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const { data: accounts, isLoading } = useBankAccounts()
  const createAccount = useCreateBankAccount()

  const [selectedTab, setSelectedTab]   = useState<SelectedTab>('all')
  const [addingAccount, setAddingAccount] = useState(false)
  const [detailAccount, setDetailAccount] = useState<BankAccount | null>(null)

  const accountForm = useForm<AccountFormData>({
    resolver: zodResolver(buildAccountSchema(t)),
    defaultValues: { tipo_cuenta: 'corriente', moneda: 'USD' },
  })

  const activeAccounts   = (accounts ?? []).filter(a => a.activa)
  const deletedAccounts  = (accounts ?? []).filter(a => !a.activa)

  const movementsAccountId = typeof selectedTab === 'number' ? selectedTab : undefined
  const { data: movements } = useBankMovements(movementsAccountId)

  function onCreate(data: AccountFormData) {
    const payload: CreateBankAccountPayload = data
    createAccount.mutate(payload, {
      onSuccess: (created) => {
        accountForm.reset({ tipo_cuenta: 'corriente', moneda: 'USD' })
        setAddingAccount(false)
        // RN3 REQ-530 — al guardar, la pantalla cambia automáticamente a la tab de la cuenta nueva.
        setSelectedTab(created.id)
      },
    })
  }

  if (isLoading) {
    return <div className="max-w-4xl mx-auto px-6 py-8 text-slate-400 text-sm">{t('common:labels.loading')}</div>
  }

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <IcoDollarSign size={20} className="text-slate-500 dark:text-slate-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('adminContab:cuentasBancarias.title')}</h1>
        </div>
        {!addingAccount && (
          <Button variant="outline" onClick={() => setAddingAccount(true)}>
            <span className="inline-flex items-center gap-1.5"><IcoPlus size={14} />{t('adminContab:cuentasBancarias.addButton')}</span>
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">{t('adminContab:cuentasBancarias.subtitle')}</p>

      {addingAccount && (
        <Card variant="panel" shadow className="p-4 mb-5">
          <form
            className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start"
            onSubmit={accountForm.handleSubmit(onCreate)}
          >
            <TextField label={t('adminContab:cuentasBancarias.fields.banco')} error={accountForm.formState.errors.banco?.message}>
              <input {...accountForm.register('banco')} className={inputClass(!!accountForm.formState.errors.banco)} />
            </TextField>
            <TextField label={t('adminContab:cuentasBancarias.fields.ultimos4')} error={accountForm.formState.errors.ultimos_4_digitos?.message}>
              <input
                {...accountForm.register('ultimos_4_digitos')}
                maxLength={4}
                placeholder="0000"
                className={inputClass(!!accountForm.formState.errors.ultimos_4_digitos)}
              />
            </TextField>
            <TextField label={t('adminContab:cuentasBancarias.fields.tipoCuenta')}>
              <select {...accountForm.register('tipo_cuenta')} className={inputClass(false)}>
                <option value="corriente">{t('adminContab:cuentasBancarias.tipos.corriente')}</option>
                <option value="ahorro">{t('adminContab:cuentasBancarias.tipos.ahorro')}</option>
                <option value="tarjeta_credito">{t('adminContab:cuentasBancarias.tipos.tarjeta_credito')}</option>
              </select>
            </TextField>
            <TextField label={t('adminContab:cuentasBancarias.fields.moneda')}>
              <select {...accountForm.register('moneda')} className={inputClass(false)}>
                {MONEDA_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </TextField>
            {createAccount.isError && (
              <p className="sm:col-span-4 text-xs text-red-500">
                {mutationErrorMessage(createAccount.error, t('adminContab:cuentasBancarias.saveError'))}
              </p>
            )}
            <div className="sm:col-span-4 flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => { setAddingAccount(false); accountForm.reset({ tipo_cuenta: 'corriente', moneda: 'USD' }) }}>
                {t('common:actions.cancel')}
              </Button>
              <Button type="submit" loading={createAccount.isPending}>{t('adminContab:cuentasBancarias.saveButton')}</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Button variant="secondary" active={selectedTab === 'all'} onClick={() => setSelectedTab('all')}>
          {t('adminContab:cuentasBancarias.tabs.all')}
        </Button>
        {activeAccounts.map(account => (
          <div key={account.id} className="flex items-center rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
            <Button
              variant="secondary" active={selectedTab === account.id} className="!rounded-none !border-0"
              onClick={() => setSelectedTab(account.id)}
            >
              {accountLabel(account, t)} · {account.moneda}
            </Button>
            <button
              type="button"
              aria-label={t('adminContab:cuentasBancarias.detail')}
              title={t('adminContab:cuentasBancarias.detail')}
              onClick={() => setDetailAccount(account)}
              className="px-2 h-full text-slate-400 hover:text-primary border-l border-slate-200 dark:border-slate-600"
            >
              <IcoEye size={14} />
            </button>
          </div>
        ))}
        {deletedAccounts.length > 0 && (
          <Button variant="secondary" active={selectedTab === 'deleted'} onClick={() => setSelectedTab('deleted')}>
            {t('adminContab:cuentasBancarias.tabs.deleted')} ({deletedAccounts.length})
          </Button>
        )}
      </div>

      {selectedTab === 'deleted' ? (
        <DeletedAccountsList accounts={deletedAccounts} onDetail={setDetailAccount} t={t} />
      ) : (
        <MovementsTable movements={movements ?? []} activeAccounts={activeAccounts} t={t} />
      )}

      {detailAccount && (
        <BankAccountDetailModal
          account={detailAccount}
          onClose={() => setDetailAccount(null)}
        />
      )}
    </div>
  )
}

function DeletedAccountsList(
  { accounts, onDetail, t }:
  { accounts: BankAccount[]; onDetail: (a: BankAccount) => void; t: (key: string) => string },
) {
  if (accounts.length === 0) {
    return <p className="text-xs text-slate-400">{t('adminContab:cuentasBancarias.empty')}</p>
  }
  return (
    <Card variant="panel" shadow className="p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
            <th className="py-2 px-4">{t('adminContab:cuentasBancarias.fields.banco')}</th>
            <th className="py-2 px-4">{t('adminContab:cuentasBancarias.fields.tipoCuenta')}</th>
            <th className="py-2 px-4">{t('adminContab:cuentasBancarias.fields.moneda')}</th>
            <th className="py-2 px-4" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {accounts.map(account => (
            <tr key={account.id}>
              <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-100">
                {account.banco} ****{account.ultimos_4_digitos}
              </td>
              <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                {t(`adminContab:cuentasBancarias.tipos.${account.tipo_cuenta}`)}
              </td>
              <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{account.moneda}</td>
              <td className="py-2.5 px-4 text-right">
                <Button variant="outline" onClick={() => onDetail(account)}>{t('adminContab:cuentasBancarias.detail')}</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function MovementRow(
  { movement, activeAccounts, t }:
  { movement: BankMovement; activeAccounts: BankAccount[]; t: (key: string) => string },
) {
  const [assigning, setAssigning] = useState(false)
  const assignAccount = useAssignBankMovementAccount()

  // RN1 REQ-534 — solo movimientos de tipo "comision" sin cuenta pueden asignarse acá.
  const canAssign = movement.tipo === 'comision' && movement.bank_account_id === null

  return (
    <tr>
      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{movement.fecha}</td>
      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
        {t(`adminContab:cuentasBancarias.movimientoTipos.${movement.tipo}`)}
      </td>
      <td className="py-2.5 px-4 text-slate-800 dark:text-slate-100">{movement.concepto}</td>
      <td className={`py-2.5 px-4 font-medium ${movement.direccion === 'entrada' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
        {movement.direccion === 'entrada' ? '+' : '−'}{formatCurrency(Math.abs(movement.monto), 'USD')}
      </td>
      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
        {movement.bank_account_label ?? (
          <span className="italic text-slate-400">{t('adminContab:cuentasBancarias.sinCuentaAsignada')}</span>
        )}
      </td>
      <td className="py-2.5 px-4 text-right">
        {canAssign && !assigning && (
          <Button variant="outline" onClick={() => setAssigning(true)}>{t('adminContab:cuentasBancarias.seleccionarCuenta')}</Button>
        )}
        {canAssign && assigning && (
          <div className="inline-flex items-center gap-1.5">
            <select
              autoFocus
              defaultValue=""
              disabled={assignAccount.isPending}
              onChange={(e) => {
                const id = Number(e.target.value)
                if (id) assignAccount.mutate({ id: movement.id, bankAccountId: id }, { onSuccess: () => setAssigning(false) })
              }}
              className={inputClass(false) + ' !w-auto'}
            >
              <option value="" disabled>{t('adminContab:cuentasBancarias.selectAccountPlaceholder')}</option>
              {activeAccounts.map(a => (
                <option key={a.id} value={a.id}>{accountLabel(a, t)}</option>
              ))}
            </select>
            <button type="button" aria-label={t('common:actions.cancel')} onClick={() => setAssigning(false)} className="text-slate-400 hover:text-slate-600 text-xs">
              {t('common:actions.cancel')}
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

function MovementsTable(
  { movements, activeAccounts, t }:
  { movements: BankMovement[]; activeAccounts: BankAccount[]; t: (key: string) => string },
) {
  if (movements.length === 0) {
    return <p className="text-xs text-slate-400">{t('adminContab:cuentasBancarias.movimientosEmpty')}</p>
  }
  return (
    <Card variant="panel" shadow className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
            <th className="py-2 px-4">{t('adminContab:cuentasBancarias.movimientos.fecha')}</th>
            <th className="py-2 px-4">{t('adminContab:cuentasBancarias.movimientos.tipo')}</th>
            <th className="py-2 px-4">{t('adminContab:cuentasBancarias.movimientos.concepto')}</th>
            <th className="py-2 px-4">{t('adminContab:cuentasBancarias.movimientos.monto')}</th>
            <th className="py-2 px-4">{t('adminContab:cuentasBancarias.movimientos.cuenta')}</th>
            <th className="py-2 px-4" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {movements.map(m => <MovementRow key={m.id} movement={m} activeAccounts={activeAccounts} t={t} />)}
        </tbody>
      </table>
    </Card>
  )
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 transition disabled:opacity-60 disabled:cursor-not-allowed
    ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 dark:border-slate-600 dark:bg-slate-900 focus:ring-primary/20 focus:border-primary'}`
}

function TextField(
  { label, error, className, children }:
  { label: string; error?: string; className?: string; children: React.ReactNode },
) {
  return (
    <label className={`block text-sm ${className ?? ''}`}>
      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{label}</span>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </label>
  )
}
