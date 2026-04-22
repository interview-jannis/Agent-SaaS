import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import PrintButton from '@/components/PrintButton'

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
  member_count: number
  quote_items: QuoteItem[]
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

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
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
      id, quote_number, total_price, payment_due_date,
      company_margin_rate, agent_margin_rate,
      cases(
        id, created_at,
        agents!cases_agent_id_fkey(name, email, phone),
        case_members(is_lead, clients(name, nationality, needs_muslim_friendly))
      ),
      quote_groups(
        id, name, order, member_count,
        quote_items(id, base_price, final_price, products(name, description))
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
    created_at: string | null
    agents: { name: string } | null
    case_members: { is_lead: boolean; clients: { name: string; nationality: string | null; needs_muslim_friendly: boolean | null } | null }[]
  } | null

  const agentName = caseData?.agents?.name ?? '—'
  const leadClient = caseData?.case_members?.find((m) => m.is_lead)?.clients ?? null

  const groups = ((quote.quote_groups as unknown as QuoteGroup[]) ?? [])
    .sort((a, b) => a.order - b.order)

  // Build line items
  type LineItem = { no: number; group: string; description: string; qty: number; unitUSD: number; amtUSD: number }
  const lineItems: LineItem[] = []
  let no = 1
  for (const group of groups) {
    const memberCount = Math.max(group.member_count ?? 1, 1)
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

  // Dates: use case's created_at as issue date (quotes table has no created_at column).
  // Due date comes from quote.payment_due_date which is pre-computed as issue + 7 days.
  const issuedAt = caseData?.created_at ?? new Date().toISOString()

  const qNum = quote.quote_number.replace('#Q-', '').replace('#', '')
  const year = new Date(issuedAt).getFullYear()
  const refNo = `INTERVIEW-${qNum}-${year}`

  const issueDate = fmtDate(issuedAt)
  const dueDate = quote.payment_due_date ? fmtDate(quote.payment_due_date) : addDays(issuedAt, 7)

  const isMuslim = leadClient?.needs_muslim_friendly === true

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto bg-white shadow-lg print:shadow-none">

        {/* Print button */}
        <div className="flex justify-end px-8 pt-6 print:hidden">
          <PrintButton />
        </div>

        <div className="px-12 pb-12 pt-4 print:px-10 print:pt-6">

          {/* ── Header row: Logo | Title ── */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0f4c35] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold text-[#0f4c35]">Tiktak</p>
                <p className="text-xs text-gray-400">by Interview Co., Ltd</p>
              </div>
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-bold text-gray-900 underline underline-offset-4">Commercial Invoice</h1>
            </div>
          </div>

          {/* ── To / Ref block ── */}
          <div className="grid grid-cols-2 gap-0 mb-7 border border-gray-300">
            {/* Left column */}
            <div className="p-5 border-r border-gray-300 space-y-1.5 text-sm">
              <div className="flex gap-3">
                <span className="w-20 shrink-0 font-semibold text-gray-700">To</span>
                <span className="text-gray-900">: {leadClient?.name ?? '—'}</span>
              </div>
              <div className="flex gap-3">
                <span className="w-20 shrink-0 font-semibold text-gray-700">C.C</span>
                <span className="text-gray-900">: {agentName}</span>
              </div>
              <div className="flex gap-3">
                <span className="w-20 shrink-0 font-semibold text-gray-700">From</span>
                <span className="text-[#0f4c35] font-semibold">: Interview Co., Ltd</span>
              </div>
            </div>
            {/* Right column */}
            <div className="p-5 space-y-1.5 text-sm">
              <div className="flex gap-3">
                <span className="w-24 shrink-0 font-semibold text-gray-700">Ref. No.</span>
                <span className="text-gray-900 font-mono text-xs">: {refNo}</span>
              </div>
              <div className="flex gap-3">
                <span className="w-24 shrink-0 font-semibold text-gray-700">Issue Date</span>
                <span className="text-gray-900">: {issueDate}</span>
              </div>
              <div className="flex gap-3">
                <span className="w-24 shrink-0 font-semibold text-gray-700">Due Date</span>
                <span className="text-gray-900">: {dueDate}</span>
              </div>
            </div>
          </div>

          {/* ── Subject ── */}
          <div className="mb-5">
            <p className="text-sm font-bold text-gray-900">
              Subject : K-Beauty &amp; Medical Premium Tour Package
              {isMuslim ? ' for Muslim VIP Clients' : ' for VIP Clients'}
            </p>
          </div>

          {/* ── Items Table ── */}
          <div className="mb-8">
            <div className="flex justify-end mb-1">
              <span className="text-xs text-gray-500 italic">Currency: United States Dollars</span>
            </div>
            <table className="w-full text-sm border-collapse border border-gray-300">
              <thead>
                <tr style={{ backgroundColor: '#1a3a6b' }} className="text-white">
                  <th className="py-2.5 px-3 text-center font-semibold w-8 border border-[#1a3a6b]">No</th>
                  <th className="py-2.5 px-3 text-left font-semibold border border-[#1a3a6b]">Descriptions</th>
                  <th className="py-2.5 px-3 text-center font-semibold w-12 border border-[#1a3a6b]">Q&apos;ty</th>
                  <th className="py-2.5 px-3 text-right font-semibold w-32 border border-[#1a3a6b]">Unit Price</th>
                  <th className="py-2.5 px-3 text-right font-semibold w-32 border border-[#1a3a6b]">Amount</th>
                  <th className="py-2.5 px-3 text-center font-semibold w-20 border border-[#1a3a6b]">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((row, idx) => (
                  <tr key={row.no} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="py-3 px-3 text-center text-gray-600 border border-gray-300">{row.no}</td>
                    <td className="py-3 px-3 border border-gray-300">
                      <p className="font-medium text-gray-800">{row.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{row.group}</p>
                    </td>
                    <td className="py-3 px-3 text-center text-gray-700 border border-gray-300">{row.qty}</td>
                    <td className="py-3 px-3 text-right text-gray-800 font-mono border border-gray-300">
                      $ {fmtUSD(row.unitUSD)}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-gray-900 font-mono border border-gray-300">
                      $ {fmtUSD(row.amtUSD)}
                    </td>
                    <td className="py-3 px-3 border border-gray-300" />
                  </tr>
                ))}
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-gray-400 border border-gray-300">
                      No items in this quote.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100">
                  <td colSpan={3} className="py-3 px-3 border border-gray-300" />
                  <td className="py-3 px-3 text-right font-bold text-gray-900 border border-gray-300">
                    Total Amount (USD)
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-gray-900 font-mono border border-gray-300 text-base">
                    $ {fmtUSD(totalUSD)}
                  </td>
                  <td className="py-3 px-3 border border-gray-300" />
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
          <div className="mb-10">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Bank Account Details</h3>
            {(bank.bank_name || bank.account_number) ? (
              <div className="grid grid-cols-[9rem_auto_1fr] gap-x-2 gap-y-1 text-sm">
                {bank.bank_name && (
                  <>
                    <span className="text-gray-500">1. Name of Bank</span>
                    <span className="text-gray-500">:</span>
                    <span className="font-medium text-gray-800">{bank.bank_name}</span>
                  </>
                )}
                {bank.account_number && (
                  <>
                    <span className="text-gray-500">2. Account No.</span>
                    <span className="text-gray-500">:</span>
                    <span className="text-gray-800">{bank.account_number}</span>
                  </>
                )}
                {bank.address && (
                  <>
                    <span className="text-gray-500">3. Address</span>
                    <span className="text-gray-500">:</span>
                    <span className="text-gray-800">{bank.address}</span>
                  </>
                )}
                {bank.swift_code && (
                  <>
                    <span className="text-gray-500">4. Swift Code</span>
                    <span className="text-gray-500">:</span>
                    <span className="text-gray-800">{bank.swift_code}</span>
                  </>
                )}
                {bank.beneficiary && (
                  <>
                    <span className="text-gray-500">5. Beneficiary</span>
                    <span className="text-gray-500">:</span>
                    <span className="text-gray-800">{bank.beneficiary}</span>
                  </>
                )}
                {bank.beneficiary_number && (
                  <>
                    <span className="text-gray-500 pl-4">Beneficiary No.</span>
                    <span className="text-gray-500">:</span>
                    <span className="text-gray-800">{bank.beneficiary_number}</span>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">Bank details not configured. Please set them in Admin &gt; Settings.</p>
            )}
          </div>

          {/* ── Signature ── */}
          <div className="mb-12">
            <p className="text-sm text-gray-600 italic mb-5">Yours Faithfully,</p>
            <p className="text-base font-bold text-gray-900">Interview Co.,Ltd.</p>
          </div>

          {/* ── Footer ── */}
          <div className="border-t-4 pt-4" style={{ borderColor: '#0f4c35' }}>
            <div className="grid grid-cols-3 gap-4 text-xs text-gray-500">
              <div>
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
