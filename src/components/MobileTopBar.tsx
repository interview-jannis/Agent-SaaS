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
      <Link href={homeHref} className="flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tiktak-logo-long.png" alt="Tiktak" className="h-11 w-auto -mt-1" />
      </Link>
      <div className="ml-auto">
        <NotificationBell variant="inline" />
      </div>
    </header>
  )
}
