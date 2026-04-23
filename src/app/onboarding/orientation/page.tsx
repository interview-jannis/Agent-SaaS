'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type OtSetting = { pdf_url?: string; file_name?: string; updated_at?: string }

export default function OrientationPage() {
  const router = useRouter()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('system_settings').select('value').eq('key', 'onboarding_ot').maybeSingle()
      const v = (data?.value as OtSetting | null) ?? null
      setPdfUrl(v?.pdf_url ?? null)
      setLoading(false)
    }
    load()
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
        <p className="text-sm text-gray-500 mt-1">Review the materials below before proceeding to the agreements.</p>
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="h-96 flex items-center justify-center">
            <p className="text-sm text-gray-400">Loading...</p>
          </div>
        ) : !pdfUrl ? (
          <div className="h-96 flex flex-col items-center justify-center gap-2 bg-gray-50">
            <p className="text-sm text-gray-500">Orientation material not available yet.</p>
            <p className="text-xs text-gray-400">Please contact your Tiktak admin.</p>
          </div>
        ) : (
          <iframe src={pdfUrl} className="w-full h-[85vh]" title="Orientation" />
        )}
      </section>

      {pdfUrl && (
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" checked={acknowledged}
            onChange={e => setAcknowledged(e.target.checked)}
            className="w-4 h-4 accent-[#0f4c35]" />
          <span className="text-sm text-gray-700">I&apos;ve reviewed the orientation materials.</span>
        </label>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors">
          Back
        </button>
        <button
          disabled={!acknowledged || !pdfUrl}
          onClick={() => router.push('/onboarding/nda')}
          className="ml-auto px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Next: NDA →
        </button>
      </div>
    </div>
  )
}
