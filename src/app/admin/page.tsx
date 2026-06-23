import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default async function AdminDashboard() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')

  const { data: week } = await supabase
    .from('weeks')
    .select('*')
    .eq('is_active', true)
    .single()

  const { data: players } = await supabase
    .from('players')
    .select('id, full_name, status, paid')

  const alive = players?.filter((p: { status: string }) => p.status === 'alive') || []
  const paid = players?.filter((p: { paid: boolean }) => p.paid) || []

  let pickCount = 0
  if (week) {
    const { count } = await supabase
      .from('picks')
      .select('id', { count: 'exact', head: true })
      .eq('week_id', week.id)
    pickCount = count || 0
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        {week && (
          <p className="text-slate-400 mt-1">
            Active: Week {week.week_number} · Season {week.season_year}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Players" value={players?.length || 0} />
        <StatCard label="Paid" value={`${paid.length}/${players?.length || 0}`} />
        <StatCard label="Still Alive" value={alive.length} color="text-green-400" />
        <StatCard label="Picks This Week" value={`${pickCount}/${alive.length}`} />
      </div>

      {!week && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-amber-400 font-medium">No active week set.</p>
          <p className="text-slate-400 text-sm mt-1">
            Go to <Link href="/admin/schedule" className="text-blue-400 underline">Schedule</Link> to create Week 1 and add games.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminCard
          href="/admin/schedule"
          title="📅 Enter Schedule"
          desc="Add or update this week's game slate (teams, kickoff times, SNF/MNF flags)"
        />
        <AdminCard
          href="/admin/results"
          title="🏆 Enter Results"
          desc="Enter game outcomes — the app auto-grades picks and eliminates players"
        />
        <AdminCard
          href="/admin/players"
          title="👥 Manage Players"
          desc="Import CSV, toggle paid status, regen PINs, correct eliminations, submit picks"
        />
        <AdminCard
          href="/admin/recap"
          title="📋 Weekly Recap"
          desc="Generate copy-pasteable recap text for GroupMe"
        />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  color = 'text-white',
}: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-center">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function AdminCard({
  href,
  title,
  desc,
}: {
  href: string
  title: string
  desc: string
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-slate-700 bg-slate-800 p-5 hover:border-slate-500 hover:bg-slate-700/50 transition-all"
    >
      <p className="font-semibold text-white">{title}</p>
      <p className="text-slate-400 text-sm mt-1">{desc}</p>
    </Link>
  )
}
