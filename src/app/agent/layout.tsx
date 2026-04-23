import AgentSidebar from '@/components/agent/AgentSidebar'
import SessionGuard from '@/components/SessionGuard'
import NotificationBell from '@/components/NotificationBell'
import AgentOnboardingGuard from '@/components/AgentOnboardingGuard'

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <SessionGuard />
      <AgentOnboardingGuard />
      <AgentSidebar />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
      <NotificationBell />
    </div>
  )
}
