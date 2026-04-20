import AgentSidebar from '@/components/agent/AgentSidebar'
import SessionGuard from '@/components/SessionGuard'

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <SessionGuard />
      <AgentSidebar />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
