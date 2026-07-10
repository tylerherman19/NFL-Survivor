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
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
            <span className="font-display text-white tracking-wider text-sm">ADMIN</span>
            <div className="flex gap-5">
              {([['/admin','Dashboard'],['/admin/schedule','Schedule'],['/admin/results','Results'],['/admin/players','Players'],['/admin/recap','Recap'],['/admin/history','History'],['/admin/email','Email']] as [string,string][]).map(([href, label]) => (
                <Link key={href} href={href} className="text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors" style={{ color: '#888' }}>{label}</Link>
              ))}
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
