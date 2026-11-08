import ApproverSubstitutesPanel from '@/components/ApproverSubstitutesPanel'
import ProcessApproversPanel from '@/components/ProcessApproversPanel'

/** Pestaña «Aprobadores» de Configuración global: suplentes del aprobador primario (Fase 12b) y aprobadores por proceso (Fase 28). */
export default function ApproversTab() {
  return (
    <div className="flex flex-col gap-5">
      <ApproverSubstitutesPanel />
      <ProcessApproversPanel />
    </div>
  )
}
