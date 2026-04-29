'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ChangePasswordCard from '@/components/ChangePasswordCard'

type BankDetails = {
  bank_name: string
  account_number: string
  address: string
  swift_code: string
  beneficiary: string
  beneficiary_number: string
}

const DEFAULT_BANK: BankDetails = {
  bank_name: '', account_number: '', address: '',
  swift_code: '', beneficiary: '', beneficiary_number: '',
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true)

  // Exchange rate
  const [rate, setRate] = useState('')
  const [savingRate, setSavingRate] = useState(false)
  const [rateSaved, setRateSaved] = useState(false)
  const [rateError, setRateError] = useState('')

  // Company margin
  const [companyMargin, setCompanyMargin] = useState('')
  const [savingMargin, setSavingMargin] = useState(false)
  const [marginSaved, setMarginSaved] = useState(false)
  const [marginError, setMarginError] = useState('')

  // Bank details
  const [bank, setBank] = useState<BankDetails>(DEFAULT_BANK)
  const [savingBank, setSavingBank] = useState(false)
  const [bankSaved, setBankSaved] = useState(false)
  const [bankError, setBankError] = useState('')

  useEffect(() => {
    async function load() {
      const [rateRes, marginRes, bankRes] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
        supabase.from('system_settings').select('value').eq('key', 'company_margin_rate').single(),
        supabase.from('system_settings').select('value').eq('key', 'bank_details').single(),
      ])

      const r = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw
      if (r) setRate(String(r))

      const m = (marginRes.data?.value as { rate?: number } | null)?.rate
      if (m !== undefined) setCompanyMargin(String(Math.round(m * 100)))

      const b = bankRes.data?.value as BankDetails | null
      if (b) setBank({ ...DEFAULT_BANK, ...b })

      setLoading(false)
    }
    load()
  }, [])

  async function saveRate() {
    if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
      setRateError('Please enter a valid exchange rate.')
      return
    }
    setSavingRate(true)
    setRateError('')
    setRateSaved(false)
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'exchange_rate', value: { usd_krw: Number(rate) } }, { onConflict: 'key' })
    if (error) { setRateError(error.message) }
    else { setRateSaved(true); setTimeout(() => setRateSaved(false), 3000) }
    setSavingRate(false)
  }

  async function saveMargin() {
    const pct = Number(companyMargin)
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setMarginError('Please enter a value between 0 and 100.')
      return
    }
    setSavingMargin(true)
    setMarginError('')
    setMarginSaved(false)
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'company_margin_rate', value: { rate: pct / 100 } }, { onConflict: 'key' })
    if (error) { setMarginError(error.message) }
    else { setMarginSaved(true); setTimeout(() => setMarginSaved(false), 3000) }
    setSavingMargin(false)
  }

  async function saveBank() {
    setSavingBank(true)
    setBankError('')
    setBankSaved(false)
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'bank_details', value: bank }, { onConflict: 'key' })
    if (error) { setBankError(error.message) }
    else { setBankSaved(true); setTimeout(() => setBankSaved(false), 3000) }
    setSavingBank(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="h-14 shrink-0 flex items-center gap-4 px-6 border-b border-gray-100">
        <h1 className="text-base font-semibold text-gray-900">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Exchange Rate */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Exchange Rate</h2>
            <p className="text-xs text-gray-600 mt-1">Used to convert product prices from KRW to USD. Agents see prices in USD only.</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">1 USD = ? KRW</label>
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#0f4c35] transition-all">
                  <span className="px-3 py-2.5 text-sm text-gray-600 bg-gray-50 border-r border-gray-200">₩</span>
                  <input
                    type="number" value={rate} onChange={(e) => setRate(e.target.value)}
                    placeholder="1350" min={1}
                    className="w-36 px-3 py-2.5 text-sm text-gray-900 focus:outline-none bg-white"
                  />
                </div>
                {rate && !isNaN(Number(rate)) && Number(rate) > 0 && (
                  <p className="text-xs text-gray-600">$1,000 = ₩{(1000 * Number(rate)).toLocaleString()}</p>
                )}
              </div>
            </div>
            {rateError && <p className="text-sm text-red-500">{rateError}</p>}
            {rateSaved && <p className="text-sm text-[#0f4c35]">Exchange rate saved.</p>}
            <button onClick={saveRate} disabled={savingRate}
              className="px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
              {savingRate ? 'Saving...' : 'Save'}
            </button>
          </div>
        </section>

        {/* Company Margin Rate */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Company Margin Rate</h2>
            <p className="text-xs text-gray-600 mt-1">Applied on top of product base price before the agent margin is added.</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Company Margin (%)</label>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#0f4c35] transition-all w-32">
                <input
                  type="number" value={companyMargin} onChange={(e) => setCompanyMargin(e.target.value)}
                  placeholder="20" min={0} max={100}
                  className="flex-1 px-3 py-2.5 text-sm text-gray-900 focus:outline-none bg-white"
                />
                <span className="px-3 py-2.5 text-sm text-gray-600 bg-gray-50 border-l border-gray-200">%</span>
              </div>
              <p className="text-xs text-gray-600 mt-1.5">
                Customer price = base price × (1 + {companyMargin || '?'}%) × (1 + agent margin%)
              </p>
            </div>
            {marginError && <p className="text-sm text-red-500">{marginError}</p>}
            {marginSaved && <p className="text-sm text-[#0f4c35]">Company margin rate saved.</p>}
            <button onClick={saveMargin} disabled={savingMargin}
              className="px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
              {savingMargin ? 'Saving...' : 'Save'}
            </button>
          </div>
        </section>

        {/* Bank Account Details */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Bank Account Details</h2>
            <p className="text-xs text-gray-600 mt-1">Displayed on Commercial Invoice (quote page) sent to agents.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Bank Name', key: 'bank_name', placeholder: 'SHINHAN BANK' },
              { label: 'Account Number', key: 'account_number', placeholder: '180 039 209697' },
              { label: 'Swift Code', key: 'swift_code', placeholder: 'SHBKKRSE' },
              { label: 'Beneficiary', key: 'beneficiary', placeholder: 'INTERVIEW CO LTD' },
              { label: 'Beneficiary Number', key: 'beneficiary_number', placeholder: '+82 10 2396 0469' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
                <input
                  type="text"
                  value={bank[key as keyof BankDetails]}
                  onChange={(e) => setBank((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] transition-all"
                />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Bank Address</label>
              <input
                type="text"
                value={bank.address}
                onChange={(e) => setBank((p) => ({ ...p, address: e.target.value }))}
                placeholder="20, SEJONG-DAERO 9-GIL, JUNG-GU, SOUTH KOREA"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-[#0f4c35] transition-all"
              />
            </div>
          </div>
          {bankError && <p className="text-sm text-red-500">{bankError}</p>}
          {bankSaved && <p className="text-sm text-[#0f4c35]">Bank details saved.</p>}
          <button onClick={saveBank} disabled={savingBank}
            className="px-5 py-2.5 text-sm font-medium bg-[#0f4c35] text-white rounded-xl hover:bg-[#0a3828] disabled:opacity-40 transition-colors">
            {savingBank ? 'Saving...' : 'Save'}
          </button>
        </section>

        <ChangePasswordCard />

        </div>
      </div>
    </div>
  )
}
