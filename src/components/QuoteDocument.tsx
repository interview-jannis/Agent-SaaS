import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

// ── Types ─────────────────────────────────────────────────────────────────────

type QuoteItem = {
  id: string
  base_price: number
  final_price: number
  variant_label_snapshot: string | null
  products: { name: string; description: string | null } | null
}

type QuoteGroup = {
  id: string
  name: string
  order: number
  member_count: number
  document_items: QuoteItem[]
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

// ── Component ────────────────────────────────────────────────────────────────
// Shared rendering for /quote/[slug] (Quotation mode) and /invoice/[slug] (Invoice mode).
// Mode is fixed by the route — no in-doc toggling.

export default async function QuoteDocument({
  slug,
  mode,
  preview,
}: {
  slug: string
  mode: 'quotation' | 'invoice'
  preview: boolean
}) {
  const isInvoice = mode === 'invoice'
  const supabase = createServerClient()

  const { data: quote } = await supabase
    .from('documents')
    .select(`
      id, type, document_number, total_price, payment_due_date,
      company_margin_rate, agent_margin_rate, finalized_at, signer_snapshot,
      from_party, to_party,
      first_opened_at, open_count, case_id,
      cases(
        id, agent_id, status, created_at,
        agents!cases_agent_id_fkey(name, email, phone, bank_info, stamp_url),
        case_members(is_lead, clients(name, nationality, needs_muslim_friendly))
      ),
      document_groups(
        id, name, order, member_count,
        document_items(id, base_price, final_price, variant_label_snapshot, products(name, description))
      )
    `)
    .eq('slug', slug)
    .single()

  if (!quote) notFound()

  // For invoice mode, also fetch the quotation document_number for cross-reference display
  let quotationRef: string | null = null
  if (isInvoice) {
    const { data: qdata } = await supabase
      .from('documents')
      .select('document_number')
      .eq('case_id', (quote as { case_id: string }).case_id)
      .eq('type', 'quotation')
      .maybeSingle()
    quotationRef = (qdata as { document_number?: string } | null)?.document_number ?? null
  }

  // For final_invoice (Balance Invoice), fetch the agent→client deposit if any —
  // we'll show it as a deduction at the top of the items table so the customer
  // sees they only owe the balance.
  type DepositInfo = { amount: number; paidAt: string | null; documentNumber: string }
  let depositInfo: DepositInfo | null = null
  const docType = (quote as { type: string }).type
  if (docType === 'final_invoice') {
    const { data: depRow } = await supabase
      .from('documents')
      .select('document_number, total_price, payment_received_at, from_party, to_party')
      .eq('case_id', (quote as { case_id: string }).case_id)
      .eq('type', 'deposit_invoice')
      .eq('from_party', 'agent')
      .eq('to_party', 'client')
      .maybeSingle()
    const dep = depRow as { document_number: string; total_price: number | null; payment_received_at: string | null } | null
    if (dep && dep.total_price && dep.total_price > 0) {
      depositInfo = {
        amount: dep.total_price,
        paidAt: dep.payment_received_at,
        documentNumber: dep.document_number,
      }
    }
  }

  // Record open + notify agent (skip in preview mode).
  if (!preview) {
    const caseRef = quote.cases as unknown as { id: string; agent_id: string | null } | null
    const q = quote as unknown as { first_opened_at: string | null; open_count: number | null; document_number: string }
    const updates: Record<string, unknown> = { open_count: (q.open_count ?? 0) + 1 }
    let notifyMessage: string | null = null

    if (!q.first_opened_at) {
      updates.first_opened_at = new Date().toISOString()
      notifyMessage = isInvoice
        ? `${q.document_number} Invoice opened by client`
        : `${q.document_number} Quotation opened by client`
    }

    await supabase.from('documents').update(updates).eq('id', quote.id)

    if (notifyMessage && caseRef?.agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('auth_user_id')
        .eq('id', caseRef.agent_id)
        .single()

      if (agent?.auth_user_id) {
        await supabase.from('notifications').insert({
          auth_user_id: agent.auth_user_id,
          target_type: 'agent',
          target_id: caseRef.agent_id,
          message: notifyMessage,
          link_url: caseRef.id ? `/agent/cases/${caseRef.id}` : null,
          is_read: false,
        })
      }
    }
  }

  const [rateRes, bankRes, stampRes] = await Promise.all([
    supabase.from('system_settings').select('value').eq('key', 'exchange_rate').single(),
    supabase.from('system_settings').select('value').eq('key', 'bank_details').single(),
    supabase.from('system_settings').select('value').eq('key', 'company_stamp').maybeSingle(),
  ])

  const exchangeRate = (rateRes.data?.value as { usd_krw?: number } | null)?.usd_krw ?? 1350
  const adminBank = (bankRes.data?.value as BankDetails | null) ?? {}
  const companyStampUrl = (stampRes.data?.value as { url?: string | null } | null)?.url ?? null

  const caseData = quote.cases as unknown as {
    status: string | null
    created_at: string | null
    agents: { name: string; email: string | null; phone: string | null; bank_info: BankDetails | null; stamp_url: string | null } | null
    case_members: { is_lead: boolean; clients: { name: string; nationality: string | null; needs_muslim_friendly: boolean | null } | null }[]
  } | null

  // Issuer-aware rendering: agent-issued documents show agent's bank + name as
  // signer; admin-issued use system settings + signer_snapshot.
  const fromParty = (quote as { from_party?: 'admin' | 'agent' | null }).from_party ?? 'admin'
  const isAgentIssued = fromParty === 'agent'
  const bank: BankDetails = isAgentIssued
    ? (caseData?.agents?.bank_info ?? {})
    : adminBank
  const stampUrl: string | null = isAgentIssued
    ? (caseData?.agents?.stamp_url ?? null)
    : companyStampUrl

  const docTitle = isInvoice ? 'Commercial Invoice' : 'Quotation'

  const agentName = caseData?.agents?.name ?? '—'
  const leadClient = caseData?.case_members?.find((m) => m.is_lead)?.clients ?? null

  const groups = ((quote.document_groups as unknown as QuoteGroup[]) ?? [])
    .sort((a, b) => a.order - b.order)

  // Also fetch any items NOT attached to a group (used for deposit / commission /
  // additional invoices that don't model family groupings).
  const { data: flatItemsData } = await supabase
    .from('document_items')
    .select('id, base_price, final_price, product_name_snapshot, document_group_id, products(name, description)')
    .eq('document_id', (quote as { id: string }).id)
    .is('document_group_id', null)
    .order('sort_order')
  const flatItems = (flatItemsData as unknown as { id: string; base_price: number; final_price: number; product_name_snapshot: string | null; products: { name: string; description: string | null } | null }[] | null) ?? []

  // Build line items
  type LineItem = { no: number; group: string; description: string; qty: number; unitUSD: number; amtUSD: number }
  const lineItems: LineItem[] = []
  let no = 1
  groups.forEach((group, gi) => {
    const memberCount = Math.max(group.member_count ?? 1, 1)
    const autoName = `Group ${gi + 1}`
    const customName = group.name?.trim() ?? ''
    // Skip the prefix when no custom name is given (or the user just typed the
    // auto-name back) so the label doesn't repeat itself ("Group 1: Group 1 · 1 pax").
    const groupLabel = !customName || customName === autoName
      ? `${autoName} · ${memberCount} pax`
      : `${autoName}: ${customName} · ${memberCount} pax`
    for (const item of group.document_items) {
      const amtUSD = item.final_price / exchangeRate
      const unitUSD = amtUSD / memberCount
      const baseName = item.products?.name ?? 'Service'
      const desc = item.variant_label_snapshot
        ? `${baseName} — ${item.variant_label_snapshot}`
        : baseName
      lineItems.push({
        no: no++,
        group: groupLabel,
        description: desc,
        qty: memberCount,
        unitUSD,
        amtUSD,
      })
    }
  })
  // Append ungrouped items (deposit/commission/additional invoices)
  for (const item of flatItems) {
    const amtUSD = item.final_price / exchangeRate
    lineItems.push({
      no: no++,
      group: '',
      description: item.product_name_snapshot ?? item.products?.name ?? 'Item',
      qty: 1,
      unitUSD: amtUSD,
      amtUSD,
    })
  }

  const itemsTotalUSD = lineItems.reduce((s, r) => s + r.amtUSD, 0)
  const depositUSD = depositInfo ? depositInfo.amount / exchangeRate : 0
  const totalUSD = itemsTotalUSD - depositUSD

  // Dates: use case's created_at as issue date.
  // Due date comes from document.payment_due_date which is pre-computed as issue + 7 days.
  const issuedAt = caseData?.created_at ?? new Date().toISOString()

  // Each document carries its own number. For invoice mode the cross-ref to
  // the parent quotation's number is fetched separately (quotationRef above).
  const docNo = (quote as { document_number: string }).document_number
  const refNo = docNo

  const issueDate = fmtDate(issuedAt)
  const dueDate = quote.payment_due_date ? fmtDate(quote.payment_due_date) : addDays(issuedAt, 7)

  const isMuslim = leadClient?.needs_muslim_friendly === true

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto bg-white shadow-lg print:shadow-none">

        <div className="px-4 md:px-12 py-8 md:py-12 print:px-10 print:py-6">

          {/* ── Header row: Logo | Title ── */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/tiktak-logo-long.png" alt="Tiktak" className="h-10 w-auto" />
              <p className="text-xs text-gray-400">by Interview Co., Ltd</p>
            </div>
            <div className="text-right">
              <h1 className={`text-2xl font-bold underline underline-offset-4 ${isInvoice ? 'text-gray-900' : 'text-[#0f4c35]'}`}>{docTitle}</h1>
              {!isInvoice && (
                <p className="text-[10px] text-gray-500 italic mt-1">Estimated · Subject to confirmation</p>
              )}
            </div>
          </div>

          {/* Quotation disclaimer banner — only for non-invoice */}
          {!isInvoice && (
            <div className="mb-7 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 rounded-r print:border-l-2">
              <p className="text-xs text-amber-900 font-medium mb-0.5">This is a tentative quotation</p>
              <p className="text-xs text-amber-800">Pricing reflects an estimate based on the proposed itinerary. Final pricing may adjust once the schedule is confirmed. A formal invoice with payment instructions will be issued at that time.</p>
            </div>
          )}

          {/* ── To / Ref block ── */}
          {(() => {
            const toParty = (quote as { to_party?: 'client' | 'agent' | 'admin' | null }).to_party ?? 'client'
            const toLabel = toParty === 'client'
              ? (leadClient?.name ?? '—')
              : toParty === 'agent'
                ? agentName
                : 'Interview Co., Ltd'
            const ccLabel = toParty === 'client' ? agentName : null
            return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 mb-7 border border-gray-300">
            {/* Left column */}
            <div className="p-4 md:p-5 border-b md:border-b-0 md:border-r border-gray-300 space-y-1.5 text-sm">
              <div className="flex gap-3">
                <span className="w-20 shrink-0 font-semibold text-gray-700">To</span>
                <span className="text-gray-900">: {toLabel}</span>
              </div>
              {ccLabel && (
                <div className="flex gap-3">
                  <span className="w-20 shrink-0 font-semibold text-gray-700">C.C</span>
                  <span className="text-gray-900">: {ccLabel}</span>
                </div>
              )}
              <div className="flex gap-3">
                <span className="w-20 shrink-0 font-semibold text-gray-700">From</span>
                <span className="text-[#0f4c35] font-semibold">
                  {(() => {
                    if (isAgentIssued) {
                      // Agent-issued (Deposit/Commission): show agent name as the issuer.
                      return (
                        <>
                          : {agentName}
                          <span className="block ml-3 font-normal text-gray-600 text-xs mt-0.5">Independent Agent</span>
                        </>
                      )
                    }
                    const signer = isInvoice
                      ? (quote as { signer_snapshot?: { name?: string | null; title?: string | null } | null }).signer_snapshot ?? null
                      : null
                    if (signer?.name) {
                      return (
                        <>
                          : {signer.name}{signer.title && <span className="font-normal text-gray-600"> ({signer.title})</span>}
                          <span className="block ml-3 font-normal text-gray-600 text-xs mt-0.5">Interview Co., Ltd</span>
                        </>
                      )
                    }
                    return ': Interview Co., Ltd'
                  })()}
                </span>
              </div>
            </div>
            {/* Right column */}
            <div className="p-4 md:p-5 space-y-1.5 text-sm">
              <div className="flex gap-3">
                <span className="w-24 shrink-0 font-semibold text-gray-700">Ref. No.</span>
                <span className="text-gray-900 font-mono text-xs">: {refNo}</span>
              </div>
              {isInvoice && quotationRef && (
                <div className="flex gap-3">
                  <span className="w-24 shrink-0 font-semibold text-gray-700">Quote Ref</span>
                  <span className="text-gray-500 font-mono text-xs">: {quotationRef}</span>
                </div>
              )}
              <div className="flex gap-3">
                <span className="w-24 shrink-0 font-semibold text-gray-700">Issue Date</span>
                <span className="text-gray-900">: {issueDate}</span>
              </div>
              {isInvoice && (
                <div className="flex gap-3">
                  <span className="w-24 shrink-0 font-semibold text-gray-700">Due Date</span>
                  <span className="text-gray-900">: {dueDate}</span>
                </div>
              )}
            </div>
          </div>
            )
          })()}

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
            <div className="overflow-x-auto print:overflow-visible -mx-4 md:mx-0 px-4 md:px-0">
            <table className="w-full text-sm border-collapse border border-gray-300 whitespace-nowrap tracking-tight">
              <thead>
                <tr style={{ backgroundColor: '#1a3a6b' }} className="text-white">
                  <th className="py-2.5 px-2 md:px-3 text-center font-semibold w-8 border border-[#1a3a6b]">No</th>
                  <th className="py-2.5 px-2 md:px-3 text-left font-semibold border border-[#1a3a6b]">Descriptions</th>
                  <th className="py-2.5 px-2 md:px-3 text-center font-semibold w-10 md:w-12 border border-[#1a3a6b] hidden md:table-cell">Q&apos;ty</th>
                  <th className="py-2.5 px-2 md:px-3 text-right font-semibold md:w-32 border border-[#1a3a6b] hidden md:table-cell">Unit Price</th>
                  <th className="py-2.5 px-2 md:px-3 text-right font-semibold md:w-32 border border-[#1a3a6b]">Amount</th>
                  <th className="py-2.5 px-2 md:px-3 text-center font-semibold md:w-20 border border-[#1a3a6b] hidden md:table-cell">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {/* Deposit row at top — only on final_invoice (Balance Invoice) */}
                {depositInfo && (
                  <tr className="bg-emerald-50">
                    <td className="py-3 px-2 md:px-3 text-center text-emerald-700 border border-gray-300">—</td>
                    <td className="py-3 px-2 md:px-3 border border-gray-300">
                      <p className="font-medium text-emerald-800">Deposit (paid)</p>
                      <p className="text-xs text-emerald-700/70 mt-0.5">
                        {depositInfo.documentNumber}
                        {depositInfo.paidAt ? ` · ${fmtDate(depositInfo.paidAt)}` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-2 md:px-3 text-center text-emerald-700 border border-gray-300 hidden md:table-cell">—</td>
                    <td className="py-3 px-2 md:px-3 text-right text-emerald-700 font-mono border border-gray-300 hidden md:table-cell">—</td>
                    <td className="py-3 px-2 md:px-3 text-right border border-gray-300">
                      <p className="font-semibold text-emerald-700 font-mono">−$ {fmtUSD(depositUSD)}</p>
                    </td>
                    <td className="py-3 px-2 md:px-3 border border-gray-300 hidden md:table-cell" />
                  </tr>
                )}
                {lineItems.map((row, idx) => (
                  <tr key={row.no} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="py-3 px-2 md:px-3 text-center text-gray-600 border border-gray-300">{row.no}</td>
                    <td className="py-3 px-2 md:px-3 border border-gray-300">
                      <p className="font-medium text-gray-800">{row.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{row.group}</p>
                    </td>
                    <td className="py-3 px-2 md:px-3 text-center text-gray-700 border border-gray-300 hidden md:table-cell">{row.qty}</td>
                    <td className="py-3 px-2 md:px-3 text-right text-gray-800 font-mono border border-gray-300 hidden md:table-cell">
                      $ {fmtUSD(row.unitUSD)}
                    </td>
                    <td className="py-3 px-2 md:px-3 text-right border border-gray-300">
                      <p className="font-semibold text-gray-900 font-mono">$ {fmtUSD(row.amtUSD)}</p>
                      <p className="md:hidden text-[10px] text-gray-400 font-mono mt-0.5">{row.qty} × $ {fmtUSD(row.unitUSD)}</p>
                    </td>
                    <td className="py-3 px-2 md:px-3 border border-gray-300 hidden md:table-cell" />
                  </tr>
                ))}
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-gray-400 border border-gray-300">
                      No items in this quote.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                {depositInfo && (
                  <tr className="bg-gray-50">
                    <td className="py-2 px-2 md:px-3 border border-gray-300" />
                    <td className="py-2 px-2 md:px-3 text-right md:text-left text-xs text-gray-600 border border-gray-300" colSpan={1}>
                      Items Subtotal
                    </td>
                    <td className="py-2 px-2 md:px-3 border border-gray-300 hidden md:table-cell" />
                    <td className="py-2 px-2 md:px-3 text-right text-xs text-gray-600 border border-gray-300 hidden md:table-cell">
                      Items Subtotal
                    </td>
                    <td className="py-2 px-2 md:px-3 text-right text-gray-700 font-mono border border-gray-300 text-sm whitespace-nowrap tracking-tight">
                      $ {fmtUSD(itemsTotalUSD)}
                    </td>
                    <td className="py-2 px-2 md:px-3 border border-gray-300 hidden md:table-cell" />
                  </tr>
                )}
                <tr className="bg-gray-100">
                  <td className="py-3 px-2 md:px-3 border border-gray-300" />
                  <td className="py-3 px-2 md:px-3 text-right md:text-left font-bold text-gray-900 border border-gray-300">
                    <span className="md:hidden">{depositInfo ? 'Balance Due (USD)' : isInvoice ? 'Total Amount (USD)' : 'Estimated Total (USD)'}</span>
                  </td>
                  <td className="py-3 px-2 md:px-3 border border-gray-300 hidden md:table-cell" />
                  <td className="py-3 px-2 md:px-3 text-right font-bold text-gray-900 border border-gray-300 hidden md:table-cell">
                    {depositInfo ? 'Balance Due (USD)' : isInvoice ? 'Total Amount (USD)' : 'Estimated Total (USD)'}
                  </td>
                  <td className="py-3 px-2 md:px-3 text-right font-bold text-gray-900 font-mono border border-gray-300 text-base whitespace-nowrap tracking-tight">
                    $ {fmtUSD(totalUSD)}
                  </td>
                  <td className="py-3 px-2 md:px-3 border border-gray-300 hidden md:table-cell" />
                </tr>
              </tfoot>
            </table>
            </div>
          </div>

          {/* ── Body text ── */}
          <div className="mb-8">
            <p className="text-sm text-gray-700 leading-relaxed italic">
              {isInvoice
                ? 'We are pleased to submit an invoice for the K-Beauty & Medical Premium Tour Package for your VIP clients.'
                : 'We are pleased to share this quotation for the K-Beauty & Medical Premium Tour Package for your VIP clients. The pricing below is an estimate; we will finalize once the schedule is confirmed.'}
            </p>
          </div>

          {/* ── Bank Account Details — Invoice only ── */}
          {isInvoice && (
          <div className="mb-10">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Bank Account Details</h3>
            {(bank.bank_name || bank.account_number) ? (
              <div className="grid grid-cols-[7rem_auto_1fr] md:grid-cols-[9rem_auto_1fr] gap-x-2 gap-y-1 text-sm">
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
          )}

          {/* ── Signature ── */}
          {(() => {
            const signer = isInvoice
              ? (quote as { signer_snapshot?: { name?: string | null; title?: string | null } | null }).signer_snapshot ?? null
              : null
            const issuerName = isAgentIssued ? agentName : 'Interview Co.,Ltd.'
            return (
              <div className="mb-12">
                <p className="text-sm text-gray-600 italic mb-5">Yours Faithfully,</p>
                <div className="flex items-end gap-4">
                  <div className="min-w-0">
                    {isAgentIssued ? (
                      <>
                        <p className="text-base font-semibold text-gray-900">{agentName}</p>
                        <p className="text-sm text-gray-600 mb-1">Independent Agent</p>
                      </>
                    ) : (
                      <>
                        {signer?.name && (
                          <>
                            <p className="text-base font-semibold text-gray-900">{signer.name}</p>
                            {signer.title && <p className="text-sm text-gray-600 mb-1">{signer.title}</p>}
                          </>
                        )}
                        <p className="text-base font-bold text-gray-900">Interview Co.,Ltd.</p>
                      </>
                    )}
                  </div>
                  {stampUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={stampUrl} alt={`${issuerName} stamp`}
                      className="h-20 w-auto object-contain opacity-90 print:opacity-100 shrink-0 -mb-2"
                      style={{ mixBlendMode: 'multiply' }} />
                  )}
                </div>
              </div>
            )
          })()}

          {/* ── Footer ── */}
          <div className="border-t-4 pt-4" style={{ borderColor: '#0f4c35' }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-500">
              <div>
                <p>805ho, 8F, 229 Seokjeong-ro, Michuhol-gu,</p>
                <p>Incheon, Republic of Korea</p>
              </div>
              <div>
                <p>Tel: +82-32-715-7899</p>
                <p>Fax: +82-32-715-7946</p>
                <p>Email: info@interviewcorp.co.kr</p>
              </div>
              <div className="md:text-right">
                <p className="font-semibold text-[#0f4c35]">www.interviewcorp.co.kr</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
