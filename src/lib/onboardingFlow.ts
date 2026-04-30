import { supabase } from './supabase'

// Decide the next onboarding route for the current agent based on what's already signed.
// Used by entry / nda / partnership pages to skip steps the agent has already completed,
// so a refresh mid-flow doesn't create duplicate signatures.
//
// Returns null if there's no special redirect needed (caller should render its page).
// The caller is responsible for calling router.replace(returnedPath) when non-null.
export async function nextOnboardingPath(currentStep: 'entry' | 'nda' | 'partnership'): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return '/login'

  const { data: agent } = await supabase.from('agents')
    .select('id, onboarding_status')
    .eq('auth_user_id', uid).maybeSingle()
  const a = agent as { id: string; onboarding_status?: string } | null
  if (!a) return '/login'

  // Already submitted everything — waiting screen handles the rest.
  if (a.onboarding_status === 'awaiting_approval') return '/onboarding/waiting'

  const { data: contracts } = await supabase.from('agent_contracts')
    .select('contract_type')
    .eq('agent_id', a.id)
  const types = new Set(((contracts ?? []) as { contract_type: string }[]).map(c => c.contract_type))
  const hasNda = types.has('nda')
  const hasPartnership = types.has('partnership')

  if (currentStep === 'entry') {
    // Welcome page — let the agent see it on first visit, but skip ahead if they've already signed something.
    if (hasNda && !hasPartnership) return '/onboarding/partnership'
    if (hasNda && hasPartnership) return '/onboarding/waiting'
    return null
  }

  if (currentStep === 'nda') {
    if (hasNda) return hasPartnership ? '/onboarding/waiting' : '/onboarding/partnership'
    return null
  }

  // partnership
  if (hasPartnership) return '/onboarding/waiting'
  return null
}
