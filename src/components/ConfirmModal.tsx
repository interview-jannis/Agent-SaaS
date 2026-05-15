'use client'

type Props = {
  title: string
  description?: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
  loading?: boolean
}

export default function ConfirmModal({ title, description, confirmLabel = 'Send', onCancel, onConfirm, loading }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          {description && <p className="text-xs text-gray-500 break-all">{description}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={loading}
            className="text-sm text-gray-500 hover:text-gray-800 px-4 py-2 disabled:opacity-40">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-[#0f4c35] text-white hover:bg-[#0a3828] flex items-center gap-1.5 disabled:opacity-40">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            {loading ? 'Sending…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
