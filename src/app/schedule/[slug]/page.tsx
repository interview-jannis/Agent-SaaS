import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import AutoPrint from '@/components/AutoPrint'
import ScheduleDocument from '@/components/ScheduleDocument'
import { type ScheduleItem } from '@/types/schedule'

export const dynamic = 'force-dynamic'

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ autoprint?: string; preview?: string; v?: string }>
}) {
  const { slug } = await params
  const { autoprint, preview, v } = await searchParams
  const supabase = createServerClient()

  // Default: latest version (client-facing). Admin preview can pin a specific version via ?v=.
  const versionPin = v ? Number(v) : null
  let query = supabase
    .from('schedules')
    .select(`
      id, pdf_url, items, version, created_at,
      first_opened_at, open_count,
      cases(id, agent_id, case_number, travel_start_date, travel_end_date,
        case_members(is_lead, clients(name)),
        documents(
          type,
          document_groups(
            document_items(
              product_name_snapshot,
              variant_label_snapshot,
              products(name, product_categories(name), product_subcategories(name))
            )
          )
        )
      )
    `)
    .eq('slug', slug)
  if (versionPin && Number.isFinite(versionPin)) {
    query = query.eq('version', versionPin)
  } else {
    query = query.order('version', { ascending: false })
  }
  const { data: schedules } = await query.limit(1)

  type CaseLite = {
    id: string
    agent_id: string | null
    case_number: string | null
    travel_start_date: string | null
    travel_end_date: string | null
    case_members: { is_lead: boolean; clients: { name: string | null } | null }[] | null
    documents: {
      type: string
      document_groups: {
        document_items: {
          product_name_snapshot: string | null
          variant_label_snapshot: string | null
          products: {
            name: string | null
            product_categories: { name: string | null } | null
            product_subcategories: { name: string | null } | null
          } | null
        }[] | null
      }[] | null
    }[] | null
  }

  const schedule = schedules?.[0] as {
    id: string
    pdf_url: string | null
    items: ScheduleItem[] | null
    version: number
    created_at: string | null
    first_opened_at: string | null
    open_count: number | null
    cases: CaseLite | null
  } | undefined

  if (!schedule) notFound()

  // Record open + notify agent (skip for internal autoprint/preview views)
  const isInternal = autoprint === '1' || preview === '1'
  if (!isInternal) {
    const caseRef = schedule.cases
    const isFirstOpen = !schedule.first_opened_at

    if (isFirstOpen) {
      await supabase
        .from('schedules')
        .update({
          first_opened_at: new Date().toISOString(),
          open_count: 1,
        })
        .eq('id', schedule.id)

      if (caseRef?.agent_id) {
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
            message: `Schedule v${schedule.version} was opened by client`,
            link_url: caseRef.id ? `/agent/cases/${caseRef.id}` : null,
            is_read: false,
          })
        }
      }
    } else {
      await supabase
        .from('schedules')
        .update({ open_count: (schedule.open_count ?? 0) + 1 })
        .eq('id', schedule.id)
    }
  }

  // Native (items) renderer takes precedence over PDF.
  if (schedule.items && schedule.items.length > 0) {
    const caseRef = schedule.cases
    const lead = caseRef?.case_members?.find(m => m.is_lead)?.clients?.name ?? null

    // Find the hotel partner name (Subpackage > Hotel) from the case's quotation
    let hotelName: string | null = null
    const quotation = caseRef?.documents?.find(d => d.type === 'quotation')
    if (quotation) {
      for (const grp of quotation.document_groups ?? []) {
        for (const it of grp.document_items ?? []) {
          const cat = it.products?.product_categories?.name
          const sub = it.products?.product_subcategories?.name
          if (cat === 'Subpackage' && sub === 'Hotel') {
            hotelName = it.product_name_snapshot ?? it.products?.name ?? null
            break
          }
        }
        if (hotelName) break
      }
    }

    // Look up the agent for concierge footer
    let agentName: string | null = null
    let agentPhone: string | null = null
    if (caseRef?.agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('name, phone')
        .eq('id', caseRef.agent_id)
        .single()
      if (agent) {
        agentName = (agent as { name: string | null }).name ?? null
        agentPhone = (agent as { phone: string | null }).phone ?? null
      }
    }

    return (
      <>
        <ScheduleDocument
          items={schedule.items}
          caseNumber={caseRef?.case_number ?? null}
          leadName={lead}
          travelStartDate={caseRef?.travel_start_date ?? null}
          travelEndDate={caseRef?.travel_end_date ?? null}
          hotelName={hotelName}
          agentName={agentName}
          agentPhone={agentPhone}
          version={schedule.version}
          createdAt={schedule.created_at}
        />
        <AutoPrint enabled={autoprint === '1'} />
      </>
    )
  }

  // Legacy PDF fallback (existing schedules created before items model).
  if (!schedule.pdf_url) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm text-gray-500">The schedule document is not yet available.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen">
      <iframe src={schedule.pdf_url} className="w-full h-full border-0" title="Travel Schedule" />
      <AutoPrint enabled={autoprint === '1'} />
    </div>
  )
}
