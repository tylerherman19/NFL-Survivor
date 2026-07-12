import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { getDb } from '@/lib/testMode'
import ScheduleForm from './ScheduleForm'
import type { Game, Week } from '@/types'

export default async function SchedulePage() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')
  const supabase = await getDb()

  const { data: weeks } = await supabase
    .from('weeks')
    .select('*')
    .order('week_number')

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
      <h1 className="font-display text-5xl leading-none" style={{ color: 'var(--dark)' }}>📅 WEEKLY SCHEDULE</h1>
      <ScheduleForm
        weeks={(weeks || []) as Week[]}
        activeWeek={activeWeek as Week | null}
        games={games}
      />
    </div>
  )
}
