import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import AutoPrint from '@/components/AutoPrint'

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
      id, pdf_url, version,
      first_opened_at, open_count,
      cases(id, agent_id)
    `)
    .eq('slug', slug)
  if (versionPin && Number.isFinite(versionPin)) {
    query = query.eq('version', versionPin)
  } else {
    query = query.order('version', { ascending: false })
  }
  const { data: schedules } = await query.limit(1)

  const schedule = schedules?.[0] as {
    id: string
    pdf_url: string | null
    version: number
    first_opened_at: string | null
    open_count: number | null
    cases: { id: string; agent_id: string | null } | null
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
