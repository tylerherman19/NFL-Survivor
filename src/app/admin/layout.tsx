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
    <div className="min-h-screen" style={{ background: 'var(--cream)' }}>
      {isAdmin && (
        <nav style={{ background: 'var(--dark)' }}>
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4 min-w-0">
            <span className="font-display text-white tracking-wider text-sm shrink-0">ADMIN</span>
            <div className="flex gap-4 overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
              {([['/admin','Dashboard'],['/admin/schedule','Schedule'],['/admin/results','Results'],['/admin/players','Players'],['/admin/recap','Recap']] as [string,string][]).map(([href, label]) => (
                <Link key={href} href={href} className="text-xs tracking-widest uppercase transition-colors shrink-0 py-1" style={{ color: '#888' }}>{label}</Link>
              ))}
            </div>
            <div className="ml-auto shrink-0">
              <AdminLogoutButton />
            </div>
          </div>
        </nav>
      )}
      {children}
    </div>
  )
}
