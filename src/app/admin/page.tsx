import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { NFL_TEAM_NAMES } from '@/types'
import Link from 'next/link'
import AdvanceWeekButton from './AdvanceWeekButton'
import SetActiveWeek from './SetActiveWeek'

export default async function AdminDashboard() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')

  const [{ data: week }, { data: players }, { data: allWeeks }] = await Promise.all([
    supabase.from('weeks').select('*').eq('is_active', true).single(),
    supabase.from('players').select('id, full_name, email, status, paid'),
    supabase.from('weeks').select('id, week_number, season_year, is_active').order('week_number'),
  ])

  const alive = players?.filter((p: { status: string }) => p.status === 'alive') || []
  const paid = players?.filter((p: { paid: boolean }) => p.paid) || []

  // Internal test accounts shouldn't clutter chase lists
  const realPlayers = (players || []).filter(
    (p: { email: string }) => !p.email?.endsWith('@nflsurvivor.internal')
  )
  const unpaidPlayers = realPlayers.filter((p: { paid: boolean }) => !p.paid)

  let pickCount = 0
  let pickDistribution: { team: string; count: number; pct: number }[] = []
  let notPickedYet: string[] = []
  let games: { id: string; home_team: string; away_team: string; result: string; game_day: string }[] = []

  if (week) {
    const [{ data: picks }, { data: gamesData }] = await Promise.all([
      supabase.from('picks').select('player_id, team').eq('week_id', week.id),
      supabase.from('games').select('id, home_team, away_team, result, game_day').eq('week_id', week.id).order('kickoff_central'),
    ])
    games = gamesData || []
    const picksData = picks || []
    pickCount = picksData.length

    const countByTeam: Record<string, number> = {}
    for (const p of picksData) {
      countByTeam[p.team] = (countByTeam[p.team] || 0) + 1
    }
    pickDistribution = Object.entries(countByTeam)
      .map(([team, count]) => ({ team, count, pct: pickCount > 0 ? (count / pickCount) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)

    const pickedIds = new Set(picksData.map((p: { player_id: string }) => p.player_id))
    notPickedYet = realPlayers
      .filter((p: { id: string; status: string }) => p.status === 'alive' && !pickedIds.has(p.id))
      .map((p: { full_name: string }) => p.full_name)
      .sort()
  }

  const gradedCount = games.filter((g) => g.result !== 'pending').length

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
      {week && <AdvanceWeekButton currentWeekNumber={week.week_number} seasonYear={week.season_year} />}

      {week && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Pick distribution */}
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
              Week {week.week_number} Pick Distribution
            </p>
            {pickDistribution.length === 0 ? (
              <p className="text-slate-500 text-sm">No picks yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {pickDistribution.map(({ team, count, pct }) => (
                    <tr key={team} className="border-b border-slate-700/60 last:border-0">
                      <td className="py-1.5">
                        <span className="font-mono font-bold text-white">{team}</span>
                        <span className="ml-2 text-xs text-slate-400 hidden sm:inline">{NFL_TEAM_NAMES[team]}</span>
                      </td>
                      <td className="py-1.5 text-right text-white">{count}</td>
                      <td className="py-1.5 text-right text-slate-400 w-16">{pct.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Missing picks */}
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
              Haven&apos;t Picked Yet ({notPickedYet.length})
            </p>
            {notPickedYet.length === 0 ? (
              <p className="text-green-400 text-sm">Everyone alive has picked. 🎉</p>
            ) : (
              <>
                <p className="text-sm text-slate-300 leading-relaxed">{notPickedYet.join(', ')}</p>
                <Link href="/admin/email" className="inline-block mt-3 text-xs text-blue-400 underline">
                  Email these players →
                </Link>
              </>
            )}
          </div>

          {/* Games / results status */}
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
              Week {week.week_number} Games ({gradedCount}/{games.length} graded)
            </p>
            {games.length === 0 ? (
              <p className="text-slate-500 text-sm">No games entered.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {games.map((g) => (
                  <li key={g.id} className="flex items-center justify-between">
                    <span className="font-mono text-white">
                      {g.away_team} @ {g.home_team}
                    </span>
                    <ResultBadge result={g.result} home={g.home_team} away={g.away_team} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Unpaid */}
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
              Unpaid Players ({unpaidPlayers.length})
            </p>
            {unpaidPlayers.length === 0 ? (
              <p className="text-green-400 text-sm">Everyone has paid. 💰</p>
            ) : (
              <p className="text-sm text-slate-300 leading-relaxed">
                {unpaidPlayers.map((p: { full_name: string }) => p.full_name).sort().join(', ')}
              </p>
            )}
          </div>
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
        <AdminCard
          href="/admin/history"
          title="📜 Season History"
          desc="Every week's games, results, pick counts, and eliminations in one view"
        />
        <AdminCard
          href="/admin/email"
          title="✉️ Email Players"
          desc="Broadcast a message to everyone, alive players, or those missing a pick"
        />
      </div>

      {/* Data export */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">Data Export</p>
        <div className="flex flex-wrap gap-3">
          <a
            href="/api/admin/export?type=players"
            className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 transition-colors"
          >
            ⬇ Export Players CSV
          </a>
          <a
            href="/api/admin/export?type=picks"
            className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 transition-colors"
          >
            ⬇ Export Picks CSV
          </a>
        </div>
      </div>

      {allWeeks && allWeeks.length > 0 && <SetActiveWeek weeks={allWeeks} />}
    </div>
  )
}

function ResultBadge({ result, home, away }: { result: string; home: string; away: string }) {
  if (result === 'pending') return <span className="text-xs text-amber-400">pending</span>
  if (result === 'home_win') return <span className="text-xs font-semibold text-green-400">{home} won</span>
  if (result === 'away_win') return <span className="text-xs font-semibold text-green-400">{away} won</span>
  return <span className="text-xs font-semibold text-red-400">tie</span>
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
