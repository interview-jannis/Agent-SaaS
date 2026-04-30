import AdminSidebar from '@/components/admin/AdminSidebar'
import SessionGuard from '@/components/SessionGuard'
import NotificationBell from '@/components/NotificationBell'
import { MobileNavProvider } from '@/components/MobileNavContext'
import MobileTopBar from '@/components/MobileTopBar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <div className="flex h-[100svh] bg-white overflow-hidden">
        <SessionGuard />
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
          <MobileTopBar homeHref="/admin/overview" />
          <main className="flex-1 overflow-hidden bg-white">
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
