import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import ResultsForm from './ResultsForm'
import type { Game, Week } from '@/types'

export default async function ResultsPage() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')

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
      <h1 className="text-2xl font-bold text-white">🏆 Enter Results</h1>
      {!activeWeek ? (
        <p className="text-slate-400">No active week. Set up the schedule first.</p>
      ) : (
        <ResultsForm week={activeWeek as Week} games={games} />
      )}
    </div>
  )
}
