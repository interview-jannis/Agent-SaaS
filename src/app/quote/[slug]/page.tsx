import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// ── Types ─────────────────────────────────────────────────────────────────────

type QuoteItem = {
  id: string
  base_price: number
  final_price: number
  products: { name: string; description: string | null } | null
}

type QuoteGroup = {
  id: string
  name: string
  order: number
  quote_items: QuoteItem[]
  quote_group_members: { id: string }[]
}

type BankDetails = {
  bank_name?: string
  account_number?: string
  address?: string
  swift_code?: string
  beneficiary?: string
  beneficiary_number?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtUSD(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function QuotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: quote } = await supabase
    .from('quotes')
    .select(`
      id, quote_number, total_price, payment_due_date, created_at,
      company_margin_rate, agent_margin_rate,
      cases(
        id, travel_start_date, travel_end_date,
        agents(name, email, phone, country),
        case_members(is_lead, clients(name, nationality))
      ),
      quote_groups(
        id, name, order,
        quote_items(id, base_price, final_price, products(name, description)),
        quote_group_members(id)
      )
    `)
    .eq('slug', slug)
    .single()

  if (!quote) notFound()

  const [rateRes, bankRes] = await Promise.all([
    supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
    supabase.from('system_settings').select('value').eq('key', 'bank_details').single(),
  ])

  const exchangeRate = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw ?? 1350
  const bank = (bankRes.data?.value as BankDetails | null) ?? {}

  const caseData = quote.cases as unknown as {
    travel_start_date: string | null
    travel_end_date: string | null
    agents: { name: string } | null
    case_members: { is_lead: boolean; clients: { name: string; nationality: string | null } | null }[]
  } | null

  const agent = caseData?.agents ?? null
  const leadClient = caseData?.case_members?.find((m) => m.is_lead)?.clients ?? null

  const groups = ((quote.quote_groups as unknown as QuoteGroup[]) ?? [])
    .sort((a, b) => a.order - b.order)

  // Build line items: one row per quote_item
  type LineItem = { no: number; group: string; description: string; qty: number; unitUSD: number; amtUSD: number }
  const lineItems: LineItem[] = []
  let no = 1
  for (const group of groups) {
    const memberCount = Math.max(group.quote_group_members?.length ?? 0, 1)
    for (const item of group.quote_items) {
      const amtUSD = item.final_price / exchangeRate
      const unitUSD = amtUSD / memberCount
      lineItems.push({
        no: no++,
        group: group.name,
        description: item.products?.name ?? 'Service',
        qty: memberCount,
        unitUSD,
        amtUSD,
      })
    }
  }

  const totalUSD = lineItems.reduce((s, r) => s + r.amtUSD, 0)
  const issueDate = fmtDate(quote.created_at)
  const refNo = quote.quote_number.replace('#Q-', 'INTERVIEW-') + '-' + new Date(quote.created_at).getFullYear()

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto bg-white shadow-lg print:shadow-none">

        {/* Print button */}
        <div className="flex justify-end px-8 pt-6 print:hidden">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#0f4c35] border border-[#0f4c35] rounded-lg hover:bg-[#0f4c35]/5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Print / Save PDF
          </button>
        </div>

        <div className="px-10 pb-12 pt-4 print:px-8 print:pt-6">

          {/* ── Header ── */}
          <div className="flex items-start justify-between mb-10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#0f4c35] flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
              </div>
              <span className="text-lg font-bold text-[#0f4c35]">interview</span>
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-gray-900 underline underline-offset-4">Commercial Invoice</h1>
            </div>
            <div className="w-32" />
          </div>

          {/* ── To / Ref block ── */}
          <div className="grid grid-cols-2 gap-10 mb-7 text-sm">
            <table className="text-sm">
              <tbody>
                <tr>
                  <td className="pr-4 pb-1.5 font-semibold text-gray-700 w-24">To</td>
                  <td className="pb-1.5 text-gray-900">: {leadClient?.name ?? agent?.name ?? '—'}</td>
                </tr>
                <tr>
                  <td className="pr-4 pb-1.5 font-semibold text-gray-700">Attention</td>
                  <td className="pb-1.5 text-gray-900">: {agent?.name ?? '—'}</td>
                </tr>
                <tr>
                  <td className="pr-4 pb-1.5 font-semibold text-gray-700">C.C</td>
                  <td className="pb-1.5 text-gray-400">:</td>
                </tr>
                <tr>
                  <td className="pr-4 font-semibold text-gray-700">From</td>
                  <td className="text-[#0f4c35] font-semibold">: Interview Co., Ltd</td>
                </tr>
              </tbody>
            </table>
            <table className="text-sm">
              <tbody>
                <tr>
                  <td className="pr-4 pb-1.5 font-semibold text-gray-700 w-28">Ref. No.</td>
                  <td className="pb-1.5 text-gray-900 font-mono text-xs">: {refNo}</td>
                </tr>
                <tr>
                  <td className="pr-4 pb-1.5 font-semibold text-gray-700">Issue Date</td>
                  <td className="pb-1.5 text-gray-900">: {issueDate}</td>
                </tr>
                {quote.payment_due_date && (
                  <tr>
                    <td className="pr-4 font-semibold text-gray-700">Due Date</td>
                    <td className="text-gray-900">: {fmtDate(quote.payment_due_date)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Subject ── */}
          <div className="mb-6">
            <p className="text-sm font-bold text-gray-900">
              Subject : K-Beauty &amp; Medical Premium Tour Package
              {leadClient?.nationality ? ` for ${leadClient.nationality} VIP Clients` : ' for VIP Clients'}
            </p>
          </div>

          {/* ── Items Table ── */}
          <div className="mb-8">
            <div className="flex justify-end mb-1.5">
              <span className="text-xs text-gray-500 italic">Currency: United States Dollars</span>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ backgroundColor: '#1a3a6b' }} className="text-white">
                  <th className="py-3 px-3 text-center font-semibold w-10 border border-white/20">No</th>
                  <th className="py-3 px-3 text-left font-semibold border border-white/20">Descriptions</th>
                  <th className="py-3 px-3 text-center font-semibold w-12 border border-white/20">Q&apos;ty</th>
                  <th className="py-3 px-3 text-right font-semibold w-32 border border-white/20">Unit Price</th>
                  <th className="py-3 px-3 text-right font-semibold w-32 border border-white/20">Amount</th>
                  <th className="py-3 px-3 text-center font-semibold w-20 border border-white/20">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((row) => (
                  <tr key={row.no} className="border-b border-gray-200">
                    <td className="py-3 px-3 text-center text-gray-600 border-x border-gray-200">{row.no}</td>
                    <td className="py-3 px-3 text-gray-800 border-x border-gray-200">
                      <div className="font-medium">{row.description}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{row.group}</div>
                    </td>
                    <td className="py-3 px-3 text-center text-gray-700 border-x border-gray-200">{row.qty}</td>
                    <td className="py-3 px-3 text-right text-gray-800 font-mono border-x border-gray-200">
                      $ {fmtUSD(row.unitUSD)}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-gray-900 font-mono border-x border-gray-200">
                      $ {fmtUSD(row.amtUSD)}
                    </td>
                    <td className="py-3 px-3 text-center text-gray-300 border-x border-gray-200">—</td>
                  </tr>
                ))}
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-gray-400">No items in this quote.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f0f4f8' }} className="border-t-2 border-gray-400">
                  <td colSpan={4} className="py-3 px-3 text-right font-bold text-gray-900">Total Amount (USD)</td>
                  <td className="py-3 px-3 text-right font-bold text-gray-900 font-mono text-base">
                    $ {fmtUSD(totalUSD)}
                  </td>
                  <td className="py-3 px-3 border-x border-gray-200" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Body text ── */}
          <div className="mb-8">
            <p className="text-sm text-gray-700 leading-relaxed italic">
              We are pleased to submit an invoice for the K-Beauty &amp; Medical Premium Tour Package for your VIP clients.
            </p>
          </div>

          {/* ── Bank Account Details ── */}
          {(bank.bank_name || bank.account_number) && (
            <div className="mb-10">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Bank Account Details</h3>
              <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm max-w-lg">
                {bank.bank_name && (<><span className="text-gray-500">1. Name of Bank</span><span className="font-medium text-gray-800">: {bank.bank_name}</span></>)}
                {bank.account_number && (<><span className="text-gray-500">2. Account No.</span><span className="font-mono text-gray-800">: {bank.account_number}</span></>)}
                {bank.address && (<><span className="text-gray-500">3. Address</span><span className="text-gray-800">: {bank.address}</span></>)}
                {bank.swift_code && (<><span className="text-gray-500">4. Swift Code</span><span className="font-mono text-gray-800">: {bank.swift_code}</span></>)}
                {bank.beneficiary && (<><span className="text-gray-500">5. Beneficiary</span><span className="text-gray-800">: {bank.beneficiary}</span></>)}
                {bank.beneficiary_number && (<><span className="text-gray-500 pl-4">Beneficiary No.</span><span className="font-mono text-gray-800">: {bank.beneficiary_number}</span></>)}
              </div>
            </div>
          )}

          {/* ── Signature ── */}
          <div className="mb-12">
            <p className="text-sm text-gray-600 italic mb-5">Yours Faithfully,</p>
            <p className="text-base font-bold text-gray-900">Interview Co.,Ltd.</p>
          </div>

          {/* ── Footer ── */}
          <div className="border-t-4 pt-4" style={{ borderColor: '#0f4c35' }}>
            <div className="flex items-start justify-between text-xs text-gray-500">
              <div>
                <p className="font-semibold text-gray-700 mb-0.5">Interview Co., Ltd.</p>
                <p>805ho, 8F, 229 Seokjeong-ro, Michuhol-gu,</p>
                <p>Incheon, Republic of Korea</p>
              </div>
              <div>
                <p>Tel: +82-32-715-7899</p>
                <p>Fax: +82-32-715-7946</p>
                <p>Email: info@interviewcorp.co.kr</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-[#0f4c35]">www.interviewcorp.co.kr</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
