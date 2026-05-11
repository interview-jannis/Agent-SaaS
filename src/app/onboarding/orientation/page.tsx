'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AgentGuideContent from '@/components/AgentGuideContent'

export default function OrientationPage() {
  const router = useRouter()
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(false)
  }, [])

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Step 1 of 3</span>
        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-[#0f4c35]" style={{ width: '33%' }} />
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Orientation</h1>
        <p className="text-sm text-gray-500 mt-1">Review the platform guide and materials before proceeding to the agreements.</p>
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="h-96 flex items-center justify-center">
            <p className="text-sm text-gray-400">Loading...</p>
          </div>
        ) : (
          <div className="px-4 md:px-8 py-8">
            <AgentGuideContent embedded />
          </div>
        )}
      </section>

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input type="checkbox" checked={acknowledged}
          onChange={e => setAcknowledged(e.target.checked)}
          className="w-4 h-4 accent-[#0f4c35]" />
        <span className="text-sm text-gray-700">I&apos;ve reviewed the orientation materials.</span>
      </label>

      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors">
          Back
        </button>
        <button
          disabled={!acknowledged}
          onClick={() => router.push('/onboarding/nda')}
          className="ml-auto px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Next: NDA →
        </button>
      </div>
    </div>
  )
}
