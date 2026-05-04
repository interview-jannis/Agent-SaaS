import AdminSidebar from '@/components/admin/AdminSidebar'
import SessionGuard from '@/components/SessionGuard'
import NotificationBell from '@/components/NotificationBell'
import { MobileNavProvider } from '@/components/MobileNavContext'
import MobileTopBar from '@/components/MobileTopBar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <div className="flex h-[100svh] bg-white overflow-hidden print:block print:h-auto print:overflow-visible">
        <SessionGuard />
        <div className="print:hidden contents">
          <AdminSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white print:block print:overflow-visible">
          <div className="print:hidden">
            <MobileTopBar homeHref="/admin/overview" />
          </div>
          <main className="flex-1 overflow-hidden bg-white print:overflow-visible print:flex-none">
            {children}
          </main>
        </div>
        <div className="hidden md:block print:hidden">
          <NotificationBell />
        </div>
      </div>
    </MobileNavProvider>
  )
}
