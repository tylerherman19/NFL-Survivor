import Link from 'next/link'
import { NFL_TEAM_NAMES } from '@/types'
import type { StandingRow, TeamStat, Week, Game } from '@/types'
import Countdown from './components/Countdown'

async function getDashboardData() {
  try {
    const { supabase } = await import('@/lib/supabase')
    const { getWeekSundayDeadline } = await import('@/lib/deadline')

    const { data: week } = await supabase
      .from('weeks')
      .select('*')
      .eq('is_active', true)
      .single()

    const { data: allPlayers } = await supabase
      .from('players')
      .select('id, full_name, email, status, elimination_week, elimination_reason, paid')
      .order('full_name')

    if (!allPlayers) return null
    const players = allPlayers.filter((p: { email: string }) => !p.email?.endsWith('@nflsurvivor.internal'))

    const totalPaid = players.filter((p: { paid: boolean }) => p.paid).length
    const potSize = totalPaid * 25
    const alive = players.filter((p: { status: string }) => p.status === 'alive')
    const payoutPerSurvivor = alive.length > 0 ? Math.floor(potSize / alive.length) : 0

    let currentPicks: Record<string, string> = {}
    let games: Game[] = []
    let nextDeadline: string | null = null
    let nextDeadlineLabel: string | null = null

    if (week) {
      const { data: picksData } = await supabase
        .from('picks')
        .select('player_id, team')
        .eq('week_id', week.id)

      if (picksData) {
        currentPicks = Object.fromEntries(
          picksData.map((p: { player_id: string; team: string }) => [p.player_id, p.team])
        )
      }

      const { data: gamesData } = await supabase
        .from('games')
        .select('*')
        .eq('week_id', week.id)

      if (gamesData) {
        games = gamesData
        const sundayDeadline = getWeekSundayDeadline(gamesData)
        if (sundayDeadline && sundayDeadline > new Date()) {
          nextDeadline = sundayDeadline.toISOString()
          nextDeadlineLabel = `Week ${week.week_number} Sunday Deadline`
        }
      }
    }

    const { data: allPicks } = await supabase
      .from('picks')
      .select('player_id, week_id')

    const weeksSurvivedByPlayer: Record<string, number> = {}
    if (allPicks) {
      for (const pick of allPicks) {
        weeksSurvivedByPlayer[pick.player_id] =
          (weeksSurvivedByPlayer[pick.player_id] || 0) + 1
      }
    }

    const standings: StandingRow[] = players.map(
      (p: { id: string; full_name: string; status: string; elimination_reason: string | null }) => ({
        player_id: p.id,
        full_name: p.full_name,
        status: p.status as 'alive' | 'eliminated',
        weeks_survived: weeksSurvivedByPlayer[p.id] || 0,
        current_pick: currentPicks[p.id] || null,
        pick_locked: !!currentPicks[p.id],
        elimination_reason: p.elimination_reason,
      })
    )

    standings.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'alive' ? -1 : 1
      return b.weeks_survived - a.weeks_survived
    })

    const { data: allPicksWithTeam } = await supabase
      .from('picks')
      .select('team, week_id')

    const teamMap: Record<
      string,
      { times_picked: number; wins: number; eliminations: number }
    > = {}

    if (allPicksWithTeam) {
      const { data: allGames } = await supabase.from('games').select('*')
      const winnersByWeek: Record<string, string[]> = {}
      if (allGames) {
        for (const g of allGames) {
          if (g.result === 'home_win')
            winnersByWeek[g.week_id] = [...(winnersByWeek[g.week_id] || []), g.home_team]
          else if (g.result === 'away_win')
            winnersByWeek[g.week_id] = [...(winnersByWeek[g.week_id] || []), g.away_team]
        }
      }

      for (const pick of allPicksWithTeam) {
        if (!teamMap[pick.team])
          teamMap[pick.team] = { times_picked: 0, wins: 0, eliminations: 0 }
        teamMap[pick.team].times_picked++
        const winners = winnersByWeek[pick.week_id] || []
        if (winners.includes(pick.team)) teamMap[pick.team].wins++
        else if (winners.length > 0) teamMap[pick.team].eliminations++
      }
    }

    const teamStats: TeamStat[] = Object.entries(teamMap)
      .map(([team, stats]) => ({
        team,
        times_picked: stats.times_picked,
        win_rate: stats.times_picked > 0 ? stats.wins / stats.times_picked : 0,
        eliminations_caused: stats.eliminations,
      }))
      .sort((a, b) => b.times_picked - a.times_picked)

    return {
      week: week as Week | null,
      standings,
      teamStats,
      potSize,
      payoutPerSurvivor,
      aliveCount: alive.length,
      totalPlayers: players.length,
      nextDeadline,
      nextDeadlineLabel,
    }
  } catch {
    return null
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="border-b border-slate-700 bg-slate-800">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">🏈 NFL Survivor Pool</h1>
            {data?.week && (
              <p className="text-slate-400 text-sm mt-0.5">
                Week {data.week.week_number} · Season {data.week.season_year}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <Link
              href="/signup"
              className="rounded-lg border border-green-600 px-4 py-2 text-sm font-semibold text-green-400 hover:bg-green-600 hover:text-white transition-colors"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 transition-colors"
            >
              Log In
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        {!data ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-4">🏈</p>
            <p className="text-xl font-semibold text-white">Pool setup in progress</p>
            <p className="mt-2">The season hasn&apos;t started yet. Check back soon!</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Still Alive" value={data.aliveCount} color="text-green-400" />
              <StatCard
                label="Eliminated"
                value={data.totalPlayers - data.aliveCount}
                color="text-red-400"
              />
              <StatCard label="Pot Size" value={`$${data.potSize}`} color="text-yellow-400" />
              <StatCard
                label={data.aliveCount === 1 ? 'Winner Gets' : 'Split Estimate'}
                value={data.aliveCount > 0 ? `$${data.payoutPerSurvivor}` : '—'}
                color="text-yellow-400"
                sub={data.aliveCount > 1 ? `${data.aliveCount} survivors` : undefined}
              />
            </div>

            {data.nextDeadline && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
                <p className="text-sm text-amber-400 font-medium mb-1">
                  ⏰ {data.nextDeadlineLabel}
                </p>
                <Countdown deadline={data.nextDeadline} />
              </div>
            )}

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Standings</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800 text-slate-400 text-left">
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Player</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Weeks</th>
                      <th className="px-4 py-3">This Week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.standings.map((row, i) => (
                      <tr
                        key={row.player_id}
                        className={`border-b border-slate-700/50 ${
                          row.status === 'alive'
                            ? 'bg-slate-800/50'
                            : 'bg-slate-900/50 opacity-60'
                        }`}
                      >
                        <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-white">{row.full_name}</td>
                        <td className="px-4 py-3">
                          {row.status === 'alive' ? (
                            <span className="text-green-400 font-medium">✅ Alive</span>
                          ) : (
                            <span className="text-red-400">❌ Out</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{row.weeks_survived}</td>
                        <td className="px-4 py-3">
                          {row.current_pick ? (
                            <span className="rounded bg-green-900/50 border border-green-700/50 px-2 py-0.5 text-xs font-medium text-green-400">
                              ✓ Pick Made
                            </span>
                          ) : row.status === 'alive' ? (
                            <span className="text-amber-400 text-xs">pending</span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {data.teamStats.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-white mb-3">Team Pick Stats</h2>
                <div className="overflow-x-auto rounded-xl border border-slate-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-800 text-slate-400 text-left">
                        <th className="px-4 py-3">Team</th>
                        <th className="px-4 py-3">Times Picked</th>
                        <th className="px-4 py-3">Win Rate</th>
                        <th className="px-4 py-3">Eliminations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.teamStats.map((stat) => (
                        <tr
                          key={stat.team}
                          className="border-b border-slate-700/50 bg-slate-800/30"
                        >
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-white">{stat.team}</span>
                            <span className="ml-2 text-slate-400 text-xs hidden sm:inline">
                              {NFL_TEAM_NAMES[stat.team]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{stat.times_picked}</td>
                          <td className="px-4 py-3">
                            <span
                              className={
                                stat.win_rate >= 0.7
                                  ? 'text-green-400'
                                  : stat.win_rate >= 0.5
                                  ? 'text-yellow-400'
                                  : 'text-red-400'
                              }
                            >
                              {(stat.win_rate * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{stat.eliminations_caused}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="mt-16 border-t border-slate-700 py-6 text-center text-slate-500 text-sm">
        NFL Survivor Pool · $25 entry via Venmo @griffinsell ·{' '}
        <Link href="/admin/login" className="hover:text-slate-300 underline">
          Admin
        </Link>
      </footer>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string
  value: string | number
  color: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-center">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}
