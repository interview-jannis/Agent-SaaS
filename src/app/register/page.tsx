import { redirect } from 'next/navigation'

// Public self-signup is disabled. Agent accounts are provisioned by admin.
// This route kept as a hard redirect so any old bookmarks land on the login page.
export default function RegisterPage() {
  redirect('/login')
}
