'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DeactivatedPage() {
  const router = useRouter()
  const [adminEmails, setAdminEmails] = useState<string[]>([])

  useEffect(() => {
    supabase
      .from('admins')
      .select('email')
      .eq('is_super_admin', true)
      .then(({ data }) => {
        if (data) setAdminEmails(data.map(a => a.email).filter(Boolean))
      })
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-6">

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tiktak-logo-short.png" alt="TikkTakk" className="h-24 w-auto mx-auto" />

        <div className="flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-gray-900">Account Deactivated</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Your account has been deactivated.<br />
            Please contact your TikkTakk admin to resolve this.
          </p>
        </div>

        {adminEmails.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Contact</p>
            {adminEmails.map(email => (
              <a key={email} href={`mailto:${email}`}
                className="block text-sm font-medium text-[#0f4c35] hover:underline">
                {email}
              </a>
            ))}
          </div>
        )}

        <button
          onClick={handleSignOut}
          className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          Sign out
        </button>

      </div>
    </div>
  )
}
