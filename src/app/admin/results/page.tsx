import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { getDb } from '@/lib/testMode'
import ResultsForm from './ResultsForm'
import type { Game, Week } from '@/types'

export default async function ResultsPage() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')
  const supabase = await getDb()

  const { data: activeWeek } = await supabase
    .from('weeks')
    .select('*')
    .eq('is_active', true)
    .single()

  let games: Game[] = []
  if (activeWeek) {
    const { data } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', activeWeek.id)
      .order('kickoff_central')
    games = data || []
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <h1 className="font-display text-5xl leading-none" style={{ color: 'var(--dark)' }}>🏆 ENTER RESULTS</h1>
      {!activeWeek ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>No active week. Set up the schedule first.</p>
      ) : (
        <ResultsForm week={activeWeek as Week} games={games} />
      )}
    </div>
  )
}
