import { useTranslation } from 'react-i18next'
import { IcoClose } from '@/components/icons'

/**
 * SCRUM-819(b) — primer lightbox del proyecto (confirmado, no había ninguno). El pedido de
 * Daniela es solo "verla más grande", no pan/zoom real — un modal simple con la imagen a mayor
 * tamaño alcanza, sin traer una librería nueva.
 */
interface Props {
  src:     string
  alt:     string
  onClose: () => void
}

export default function ImageLightboxModal({ src, alt, onClose }: Props) {
  const { t } = useTranslation(['common'])

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[2200] flex items-center justify-center p-6"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-4 right-4 text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
        onClick={onClose}
        aria-label={t('common:actions.close')}
      >
        <IcoClose size={20} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full rounded-lg object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}
