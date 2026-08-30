interface Props {
  size?: number
  /** When true, shows the icon-only version (no text). Useful for small sizes. */
  iconOnly?: boolean
}

export default function IlluminationsLogo({ size = 76, iconOnly = false }: Props) {
  return (
    <>
      <img
        src={iconOnly ? '/logo-icon.png' : '/logo-light.png'}
        alt="Illuminations"
        width={size}
        height={size}
        className={iconOnly ? '' : 'dark:hidden'}
        style={{ objectFit: 'contain' }}
      />
      {!iconOnly && (
        <img
          src="/logo-dark.png"
          alt="Illuminations"
          width={size}
          height={size}
          className="hidden dark:block"
          style={{ objectFit: 'contain' }}
        />
      )}
    </>
  )
}
