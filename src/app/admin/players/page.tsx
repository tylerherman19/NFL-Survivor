import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { getDb } from '@/lib/testMode'
import PlayersManager from './PlayersManager'
import type { Player } from '@/types'

export default async function PlayersPage() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')
  const supabase = await getDb()

  const { data: players } = await supabase
    .from('players')
    .select('id, full_name, email, phone, venmo_handle, paid, status, elimination_week, elimination_reason')
    .order('status')
    .order('full_name')

  const { data: activeWeek } = await supabase
    .from('weeks')
    .select('id, week_number')
    .eq('is_active', true)
    .single()

  const { data: picksData } = activeWeek
    ? await supabase.from('picks').select('player_id, team').eq('week_id', activeWeek.id)
    : { data: [] }

  const { data: allPicks } = await supabase.from('picks').select('player_id')
  const weeksSurvived: Record<string, number> = {}
  for (const p of allPicks || []) {
    weeksSurvived[p.player_id] = (weeksSurvived[p.player_id] || 0) + 1
  }
  const currentPicks: Record<string, string> = Object.fromEntries(
    (picksData || []).map((p: { player_id: string; team: string }) => [p.player_id, p.team])
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <h1 className="font-display text-5xl leading-none" style={{ color: 'var(--dark)' }}>👥 MANAGE PLAYERS</h1>
      <PlayersManager
        players={(players || []) as Player[]}
        activeWeekId={activeWeek?.id || null}
        activeWeekNumber={activeWeek?.week_number || null}
        currentPicks={currentPicks}
        weeksSurvived={weeksSurvived}
      />
    </div>
  )
}
