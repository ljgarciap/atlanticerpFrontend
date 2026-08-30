interface Props {
  size?: number
}

export default function UserAvatar({ size = 32 }: Props) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 bg-slate-200 select-none"
      style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        style={{ width: size * 0.6, height: size * 0.6 }}
        aria-hidden="true">
        <circle cx="12" cy="8" r="4" fill="#64748b" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="#64748b" />
      </svg>
    </div>
  )
}
