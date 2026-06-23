import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import PlayersManager from './PlayersManager'
import type { Player } from '@/types'

export default async function PlayersPage() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')

  const { data: players } = await supabase
    .from('players')
    .select('id, full_name, email, phone, venmo_handle, paid, status, elimination_week, elimination_reason')
    .order('full_name')

  const { data: activeWeek } = await supabase
    .from('weeks')
    .select('id, week_number')
    .eq('is_active', true)
    .single()

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-white">👥 Manage Players</h1>
      <PlayersManager
        players={(players || []) as Player[]}
        activeWeekId={activeWeek?.id || null}
        activeWeekNumber={activeWeek?.week_number || null}
      />
    </div>
  )
}
