import { useToastStore } from '@/store/toastStore'
import { IcoCheck, IcoClose } from '@/components/icons'

export default function Toaster() {
  const { toasts, remove } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-6 inset-x-0 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          onClick={() => remove(toast.id)}
          className="pointer-events-auto flex items-center gap-3 px-6 py-3.5 rounded-xl shadow-2xl text-[15px] font-bold text-white cursor-pointer select-none whitespace-nowrap"
          style={{ background: toast.type === 'success' ? '#5BA5A0' : '#ef4444' }}
        >
          <span className="leading-none">
            {toast.type === 'success' ? <IcoCheck size={16} /> : <IcoClose size={16} />}
          </span>
          {toast.message}
        </div>
      ))}
    </div>
  )
}
