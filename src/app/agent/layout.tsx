import AgentSidebar from '@/components/agent/AgentSidebar'
import SessionGuard from '@/components/SessionGuard'
import NotificationBell from '@/components/NotificationBell'
import AgentOnboardingGuard from '@/components/AgentOnboardingGuard'
import { MobileNavProvider } from '@/components/MobileNavContext'
import MobileTopBar from '@/components/MobileTopBar'

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <div className="flex h-screen bg-white overflow-hidden">
        <SessionGuard />
        <AgentOnboardingGuard />
        <AgentSidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <MobileTopBar homeHref="/agent/home" />
          <main className="flex-1 overflow-hidden">
            {children}
          </main>
        </div>
        <div className="hidden md:block">
          <NotificationBell />
        </div>
      </div>
    </MobileNavProvider>
  )
}
