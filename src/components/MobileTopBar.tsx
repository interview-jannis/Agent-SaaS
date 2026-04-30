'use client'

import Link from 'next/link'
import { useMobileNav } from './MobileNavContext'
import NotificationBell from './NotificationBell'

export default function MobileTopBar({ homeHref }: { homeHref: string }) {
  const { setOpen } = useMobileNav()
  return (
    <header className="md:hidden h-14 flex items-center gap-3 px-4 border-b border-gray-100 bg-white shrink-0">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="-ml-2 p-2 rounded-lg text-gray-700 hover:bg-gray-100"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
        </svg>
      </button>
      <Link href={homeHref} className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#0f4c35] flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-gray-900">Tiktak</span>
      </Link>
      <div className="ml-auto">
        <NotificationBell variant="inline" />
      </div>
    </header>
  )
}
