import { create } from 'zustand'

interface ToastItem {
  id:      number
  message: string
  type:    'success' | 'error'
}

interface ToastState {
  toasts: ToastItem[]
  show:   (message: string, type?: 'success' | 'error') => void
  remove: (id: number) => void
}

let nextId = 0

export const useToastStore = create<ToastState>()(set => ({
  toasts: [],
  show: (message, type = 'success') => {
    const id = ++nextId
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3500)
  },
  remove: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))
