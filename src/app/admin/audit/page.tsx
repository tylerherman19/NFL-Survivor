import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { getDb } from '@/lib/testMode'
import type { AuditRow } from '@/lib/auditEvents'
import AuditLogClient from './AuditLogClient'

// Newest-first slice of the trail. Deliberately capped: the log grows forever
// (it survives pool resets), so the page loads a recent window rather than
// everything ever recorded.
const MAX_ROWS = 1000

export default async function AdminAuditPage() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')

  const supabase = await getDb()
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-display text-3xl" style={{ color: 'var(--dark)' }}>AUDIT LOG</h1>
        <p className="mt-4 text-sm" style={{ color: 'var(--red)' }}>
          Couldn&apos;t load the audit log: {error.message}
        </p>
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          If this says the table is missing, run migration 012_audit_log.sql.
        </p>
      </div>
    )
  }

  return <AuditLogClient rows={(data || []) as AuditRow[]} />
}
