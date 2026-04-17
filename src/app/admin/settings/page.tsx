'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminSettingsPage() {
  const [rate, setRate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'exchange_rate')
      .single()
      .then(({ data }) => {
        const r = (data?.value as { usd_krw?: number } | null)?.usd_krw
        if (r) setRate(String(r))
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
      setError('Please enter a valid exchange rate.')
      return
    }
    setSaving(true)
    setError('')
    setSaved(false)

    // Upsert into system_settings
    const { error: err } = await supabase
      .from('system_settings')
      .upsert({ key: 'exchange_rate', value: { usd_krw: Number(rate) } }, { onConflict: 'key' })

    if (err) {
      setError(err.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-12 py-10 max-w-xl space-y-6">

        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

        {/* Exchange Rate */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Exchange Rate</h2>
            <p className="text-xs text-gray-400 mt-1">
              Used to convert product prices from KRW to USD. Agents see prices in USD only.
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  1 USD = ? KRW
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#0f4c35] focus-within:ring-2 focus-within:ring-[#0f4c35]/10 transition-all">
                    <span className="px-3 py-2.5 text-sm text-gray-400 bg-gray-50 border-r border-gray-200">₩</span>
                    <input
                      type="number"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      placeholder="1350"
                      min={1}
                      className="w-36 px-3 py-2.5 text-sm focus:outline-none bg-white"
                    />
                  </div>
                  {rate && !isNaN(Number(rate)) && Number(rate) > 0 && (
                    <p className="text-xs text-gray-400">
                      $1,000 = ₩{(1000 * Number(rate)).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
              {saved && <p className="text-sm text-[#0f4c35]">Exchange rate saved.</p>}

              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
