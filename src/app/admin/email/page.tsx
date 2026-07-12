import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { getDb } from '@/lib/testMode'
import BroadcastForm from './BroadcastForm'

export default async function AdminEmailPage() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')
  const supabase = await getDb()

  const [{ data: players }, { data: week }] = await Promise.all([
    supabase.from('players').select('id, email, status'),
    supabase.from('weeks').select('id, week_number').eq('is_active', true).single(),
  ])

  // Match the broadcast route's recipient logic so previewed counts are accurate
  const real = (players || []).filter((p) => !p.email?.endsWith('@nflsurvivor.internal'))
  const aliveCount = real.filter((p) => p.status === 'alive').length

  let unpickedCount: number | null = null
  if (week) {
    const { data: picks } = await supabase.from('picks').select('player_id').eq('week_id', week.id)
    const pickedIds = new Set((picks || []).map((p) => p.player_id))
    unpickedCount = real.filter((p) => p.status === 'alive' && !pickedIds.has(p.id)).length
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <h1 className="font-display text-5xl leading-none" style={{ color: 'var(--dark)' }}>EMAIL PLAYERS</h1>
        <p className="mt-2 eyebrow">
          Send a broadcast to the pool · plain text, line breaks preserved
        </p>
      </div>
      <BroadcastForm
        counts={{
          all: real.length,
          alive: aliveCount,
          unpicked: unpickedCount,
        }}
        weekNumber={week?.week_number ?? null}
      />
    </div>
  )
}
