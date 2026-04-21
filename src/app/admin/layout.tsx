import AdminSidebar from '@/components/admin/AdminSidebar'
import SessionGuard from '@/components/SessionGuard'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-white">
      <SessionGuard />
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
    </div>
  )
}
