import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import Link from 'next/link'
import AdminLogoutButton from './AdminLogoutButton'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isAdmin = await getAdminSession()

  // Allow /admin/login without auth
  // (Next.js will still render the layout for /admin/login — handle in the page)
  // We check the path to avoid redirect loops

  return (
    <div className="min-h-screen bg-slate-950">
      {isAdmin && (
        <nav className="border-b border-slate-700 bg-slate-900">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
            <span className="font-bold text-white text-sm">⚙️ Admin</span>
            <div className="flex gap-4 text-sm">
              <Link href="/admin" className="text-slate-400 hover:text-white transition-colors">Dashboard</Link>
              <Link href="/admin/schedule" className="text-slate-400 hover:text-white transition-colors">Schedule</Link>
              <Link href="/admin/results" className="text-slate-400 hover:text-white transition-colors">Results</Link>
              <Link href="/admin/players" className="text-slate-400 hover:text-white transition-colors">Players</Link>
              <Link href="/admin/recap" className="text-slate-400 hover:text-white transition-colors">Recap</Link>
            </div>
            <div className="ml-auto">
              <AdminLogoutButton />
            </div>
          </div>
        </nav>
      )}
      {children}
    </div>
  )
}
