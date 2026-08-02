import { getAdminSession } from '@/lib/session'
import { isTestMode } from '@/lib/testMode'
import AdminNav from './AdminNav'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isAdmin = await getAdminSession()
  const testMode = await isTestMode()

  // Allow /admin/login without auth
  // (Next.js will still render the layout for /admin/login — handle in the page)
  // We check the path to avoid redirect loops

  return (
    <div className="min-h-screen" style={{ background: 'var(--cream)' }}>
      {isAdmin && <AdminNav testMode={testMode} />}
      {children}
    </div>
  )
}
