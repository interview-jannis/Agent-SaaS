import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Super-admin-only: hard-delete an admin (removes auth.users row + admins row).
// Cannot delete self or another super admin (super admin demotion happens
// directly in Supabase by the user with DB access).

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured on server.' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!accessToken) {
    return NextResponse.json({ error: 'Missing access token.' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken)
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Invalid session.' }, { status: 401 })
  }
  const { data: callerAdmin } = await supabase.from('admins')
    .select('id, is_super_admin').eq('auth_user_id', userData.user.id).maybeSingle()
  const caller = callerAdmin as { id: string; is_super_admin?: boolean } | null
  if (!caller || !caller.is_super_admin) {
    return NextResponse.json({ error: 'Super admin access required.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { admin_id?: string } | null
  if (!body?.admin_id) return NextResponse.json({ error: 'admin_id required.' }, { status: 400 })

  if (body.admin_id === caller.id) {
    return NextResponse.json({ error: 'You cannot delete your own admin account.' }, { status: 400 })
  }

  const { data: target } = await supabase.from('admins')
    .select('auth_user_id, is_super_admin').eq('id', body.admin_id).maybeSingle()
  const t = target as { auth_user_id: string | null; is_super_admin?: boolean } | null
  if (!t) return NextResponse.json({ error: 'Admin not found.' }, { status: 404 })
  if (t.is_super_admin) {
    return NextResponse.json({ error: 'Cannot delete a super admin from the UI. Demote first via Supabase.' }, { status: 400 })
  }

  // Delete admins row first (FK ON DELETE SET NULL on agent_contracts.approved_by handles linkage)
  const { error: delAdminErr } = await supabase.from('admins').delete().eq('id', body.admin_id)
  if (delAdminErr) {
    return NextResponse.json({ error: delAdminErr.message }, { status: 500 })
  }

  if (t.auth_user_id) {
    await supabase.auth.admin.deleteUser(t.auth_user_id)
  }

  return NextResponse.json({ ok: true })
}
