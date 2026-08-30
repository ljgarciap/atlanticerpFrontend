interface Props {
  size?: number
  /** When true, shows the icon-only version (no wordmark). Useful for small sizes. */
  iconOnly?: boolean
}

/**
 * Logo de AtlanticERP (reemplaza IlluminationsLogo.tsx, 2026-08-30). El ícono viene del
 * isólogo real de la marca (Atlantic/ats.jpeg, recortado — ver public/logo-icon.png); el
 * wordmark es texto real (no horneado en la imagen), así se lee "AtlanticERP" siempre, sin
 * depender de mantener sincronizados archivos de imagen por tema claro/oscuro.
 */
export default function AppLogo({ size = 76, iconOnly = false }: Props) {
  return (
    <div className="flex items-center gap-2.5" style={{ lineHeight: 0 }}>
      <img
        src="/logo-icon.png"
        alt="AtlanticERP"
        width={size}
        height={size}
        style={{ objectFit: 'contain' }}
      />
      {!iconOnly && (
        <span
          className="font-bold tracking-tight text-primary-dark dark:text-white"
          style={{ fontSize: size * 0.34, lineHeight: 1.1 }}
        >
          Atlantic<span className="text-accent">ERP</span>
        </span>
      )}
    </div>
  )
}
