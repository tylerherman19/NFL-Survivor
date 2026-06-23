import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import RecapClient from './RecapClient'

export default async function RecapPage() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')

  const { data: activeWeek } = await supabase
    .from('weeks')
    .select('*')
    .eq('is_active', true)
    .single()

  let recapText = ''

  if (activeWeek) {
    const [{ data: games }, { data: players }, { data: picks }] = await Promise.all([
      supabase.from('games').select('*').eq('week_id', activeWeek.id).order('kickoff_central'),
      supabase.from('players').select('*'),
      supabase.from('picks').select('*, players(full_name)').eq('week_id', activeWeek.id),
    ])

    const { generateRecap } = await import('@/lib/recap')
    const { getWeekSundayDeadline } = await import('@/lib/deadline')

    const allPlayers = players || []
    const alivePlayers = allPlayers.filter((p: { status: string }) => p.status === 'alive')
    const eliminatedThisWeek = allPlayers.filter(
      (p: { elimination_week: number | null }) => p.elimination_week === activeWeek.week_number
    )

    const totalPaid = allPlayers.filter((p: { paid: boolean }) => p.paid).length
    const potSize = totalPaid * 25

    const sundayDeadline = games ? getWeekSundayDeadline(games) : null

    recapText = generateRecap({
      week: activeWeek,
      games: games || [],
      picks: (picks || []) as Parameters<typeof generateRecap>[0]['picks'],
      players: allPlayers,
      alivePlayers,
      eliminatedThisWeek,
      potSize,
      nextDeadline: sundayDeadline?.toISOString() || null,
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-white">📋 Weekly Recap</h1>
      {!activeWeek ? (
        <p className="text-slate-400">No active week.</p>
      ) : (
        <RecapClient weekNumber={activeWeek.week_number} recapText={recapText} />
      )}
    </div>
  )
}
