import Link from 'next/link'
import { NFL_TEAM_NAMES } from '@/types'
import type { StandingRow, TeamStat, Week, Game } from '@/types'
import Countdown from './components/Countdown'

const ALIVE_PREVIEW = 7
const ELIM_PREVIEW = 5
const TOTAL_WEEKS = 18

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
    let nextDeadlineFormatted: string | null = null

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
          nextDeadlineFormatted = sundayDeadline.toLocaleString('en-US', {
            timeZone: 'America/Chicago',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          })
        }
      }
    }

    const { data: allPicks } = await supabase.from('picks').select('player_id, week_id')
    const weeksSurvivedByPlayer: Record<string, number> = {}
    if (allPicks) {
      for (const pick of allPicks) {
        weeksSurvivedByPlayer[pick.player_id] = (weeksSurvivedByPlayer[pick.player_id] || 0) + 1
      }
    }

    const standings: StandingRow[] = players.map(
      (p: { id: string; full_name: string; status: string; elimination_reason: string | null; elimination_week: number | null }) => ({
        player_id: p.id,
        full_name: p.full_name,
        status: p.status as 'alive' | 'eliminated',
        weeks_survived: weeksSurvivedByPlayer[p.id] || 0,
        current_pick: currentPicks[p.id] || null,
        pick_locked: !!currentPicks[p.id],
        elimination_reason: p.elimination_reason,
        elimination_week: p.elimination_week,
      })
    )

    standings.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'alive' ? -1 : 1
      return b.weeks_survived - a.weeks_survived
    })

    const pastPicksQuery = supabase.from('picks').select('team, week_id')
    if (week) pastPicksQuery.neq('week_id', week.id)
    const { data: allPicksWithTeam } = await pastPicksQuery

    const teamMap: Record<string, { times_picked: number; wins: number; eliminations: number }> = {}
    if (allPicksWithTeam) {
      const { data: allGames } = await supabase.from('games').select('*')
      const winnersByWeek: Record<string, string[]> = {}
      if (allGames) {
        for (const g of allGames) {
          if (g.result === 'home_win') winnersByWeek[g.week_id] = [...(winnersByWeek[g.week_id] || []), g.home_team]
          else if (g.result === 'away_win') winnersByWeek[g.week_id] = [...(winnersByWeek[g.week_id] || []), g.away_team]
        }
      }
      for (const pick of allPicksWithTeam) {
        if (!teamMap[pick.team]) teamMap[pick.team] = { times_picked: 0, wins: 0, eliminations: 0 }
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
      eliminatedCount: players.length - alive.length,
      totalPlayers: players.length,
      nextDeadline,
      nextDeadlineFormatted,
    }
  } catch {
    return null
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  const aliveRows = data?.standings.filter((r) => r.status === 'alive') ?? []
  const elimRows = data?.standings.filter((r) => r.status === 'eliminated') ?? []

  return (
    <div style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ background: 'var(--dark)' }}>
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <span className="font-display text-white text-base sm:text-lg tracking-wider">NFL SURVIVOR</span>
          <nav className="flex items-center gap-2 sm:gap-6">
            <a href="#standings" className="text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors hidden sm:block">Standings</a>
            <a href="#rules" className="text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors hidden sm:block">Rules</a>
            <Link href="/login" className="text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors hidden sm:block">Log In</Link>
            <Link
              href="/pick"
              className="font-display text-xs sm:text-sm tracking-wider px-3 sm:px-4 py-1.5 sm:py-2 text-white whitespace-nowrap"
              style={{ background: 'var(--red)' }}
            >
              SUBMIT PICK →
            </Link>
          </nav>
        </div>
      </header>

      {!data ? (
        <main className="mx-auto max-w-5xl px-4 py-20 text-center">
          <p className="font-display text-6xl" style={{ color: 'var(--dark)' }}>POOL SETUP IN PROGRESS</p>
          <p className="mt-4 text-sm tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Check back soon</p>
        </main>
      ) : (
        <main className="mx-auto max-w-5xl px-4">
          {/* Hero */}
          <div className="py-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <div>
              <h1 className="font-display text-5xl sm:text-7xl leading-none" style={{ color: 'var(--dark)' }}>
                {data.week?.season_year ?? '2026'} SEASON
              </h1>
              <p className="mt-1 text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                Week {data.week?.week_number ?? '—'} of {TOTAL_WEEKS}
              </p>
            </div>
            {data.nextDeadline && (
              <div className="sm:text-right">
                <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--red)' }}>Pick Deadline</p>
                <p className="font-bold text-base mt-0.5" style={{ color: 'var(--dark)' }}>{data.nextDeadlineFormatted}</p>
                <Countdown deadline={data.nextDeadline} />
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <StatCol value={data.aliveCount} label="Still Alive" valueColor="var(--green)" />
            <StatCol value={data.eliminatedCount} label="Eliminated" valueColor="var(--red)" border />
            <StatCol value={`$${data.potSize}`} label="Pot Size" border />
            <StatCol
              value={data.aliveCount > 0 ? `$${data.payoutPerSurvivor}` : '—'}
              label={data.aliveCount === 1 ? 'Winner Takes' : 'Split Estimate'}
              border
            />
          </div>

          {/* Standings */}
          <div id="standings" className="py-8">
            <table className="w-full text-sm min-w-0">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="py-2 w-8 text-left text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>#</th>
                  <th className="py-2 text-left text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Player</th>
                  <th className="py-2 text-left text-xs tracking-widest uppercase hidden sm:table-cell" style={{ color: 'var(--muted)' }}>Status</th>
                  <th className="py-2 text-left text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                    {data.week ? `Wk ${data.week.week_number} Pick` : 'Pick'}
                  </th>
                  <th className="py-2 text-right text-xs tracking-widest uppercase hidden sm:table-cell" style={{ color: 'var(--muted)' }}>Streak</th>
                </tr>
              </thead>
              <tbody>
                {/* Alive section */}
                {aliveRows.length > 0 && (
                  <tr>
                    <td colSpan={5} className="pt-5 pb-2">
                      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--green)' }}>
                        • {aliveRows.length} Still Alive
                      </span>
                    </td>
                  </tr>
                )}
                {aliveRows.slice(0, ALIVE_PREVIEW).map((row, i) => (
                  <tr key={row.player_id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 text-sm" style={{ color: 'var(--muted)' }}>{i + 1}</td>
                    <td className="py-3 font-bold" style={{ color: 'var(--dark)' }}>{row.full_name}</td>
                    <td className="py-3 hidden sm:table-cell">
                      <span className="text-xs font-bold tracking-wider" style={{ color: 'var(--green)' }}>• ALIVE</span>
                    </td>
                    <td className="py-3">
                      {row.current_pick ? (
                        <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>✓ Pick In</span>
                      ) : (
                        <span className="text-xs italic" style={{ color: 'var(--red)' }}>no pick yet</span>
                      )}
                    </td>
                    <td className="py-3 text-right text-xs hidden sm:table-cell" style={{ color: 'var(--muted)' }}>
                      {row.weeks_survived > 0 ? `${row.weeks_survived} wk${row.weeks_survived !== 1 ? 's' : ''}` : '—'}
                    </td>
                  </tr>
                ))}
                {aliveRows.length > ALIVE_PREVIEW && (
                  <tr>
                    <td colSpan={5} className="py-2 text-xs italic" style={{ color: 'var(--muted)' }}>
                      + {aliveRows.length - ALIVE_PREVIEW} more still alive
                    </td>
                  </tr>
                )}

                {/* Eliminated section */}
                {elimRows.length > 0 && (
                  <tr>
                    <td colSpan={5} className="pt-6 pb-2">
                      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--red)' }}>
                        ♦ {elimRows.length} Eliminated
                      </span>
                    </td>
                  </tr>
                )}
                {elimRows.slice(0, ELIM_PREVIEW).map((row) => (
                  <tr key={row.player_id} className="border-b" style={{ borderColor: 'var(--border)', opacity: 0.6 }}>
                    <td className="py-2.5 text-sm" style={{ color: 'var(--muted)' }}>—</td>
                    <td className="py-2.5 text-sm" style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>{row.full_name}</td>
                    <td className="py-2.5 hidden sm:table-cell">
                      <span className="text-xs font-bold tracking-wider" style={{ color: 'var(--red)' }}>
                        OUT{(row as StandingRow & { elimination_week?: number | null }).elimination_week ? ` WK ${(row as StandingRow & { elimination_week?: number | null }).elimination_week}` : ''}
                      </span>
                    </td>
                    <td className="py-2.5 text-xs font-mono" style={{ color: 'var(--muted)' }}>—</td>
                    <td className="py-2.5 text-right text-xs hidden sm:table-cell" style={{ color: 'var(--muted)' }}>
                      {row.weeks_survived > 0 ? `${row.weeks_survived} wk${row.weeks_survived !== 1 ? 's' : ''}` : '1 wk'}
                    </td>
                  </tr>
                ))}
                {elimRows.length > ELIM_PREVIEW && (
                  <tr>
                    <td colSpan={5} className="py-2 text-xs italic" style={{ color: 'var(--muted)' }}>
                      + {elimRows.length - ELIM_PREVIEW} more eliminated
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Team Pick Stats (past weeks only) */}
          {data.teamStats.length > 0 && (
            <div className="py-8 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--muted)' }}>Team Pick History</p>
              <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-[340px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    {['Team', 'Times Picked', 'Win Rate', 'Elims'].map((h) => (
                      <th key={h} className="py-2 text-left text-xs tracking-widest uppercase whitespace-nowrap pr-4" style={{ color: 'var(--muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.teamStats.map((stat) => (
                    <tr key={stat.team} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2.5 pr-4">
                        <span className="font-bold font-mono" style={{ color: 'var(--dark)' }}>{stat.team}</span>
                        <span className="ml-2 text-xs hidden sm:inline" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[stat.team]}</span>
                      </td>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--dark)' }}>{stat.times_picked}</td>
                      <td className="py-2.5 pr-4 font-semibold" style={{ color: stat.win_rate >= 0.6 ? 'var(--green)' : stat.win_rate >= 0.4 ? 'var(--dark)' : 'var(--red)' }}>
                        {(stat.win_rate * 100).toFixed(0)}%
                      </td>
                      <td className="py-2.5" style={{ color: 'var(--dark)' }}>{stat.eliminations_caused}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Rules */}
          <div id="rules" className="py-8 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--muted)' }}>How It Works</p>
            <div className="grid sm:grid-cols-2 gap-x-12 gap-y-3 text-sm" style={{ color: 'var(--dark)' }}>
              <Rule n="1" text="Pay $25 entry via Venmo to @griffinsell." />
              <Rule n="2" text="Each week, pick one NFL team to win their game." />
              <Rule n="3" text="You can't pick the same team twice all season." />
              <Rule n="4" text="Your team wins → you survive. Loses or ties → you're out." />
              <Rule n="5" text="Thu/Fri/Sat games lock at kickoff. All other picks lock Sunday 12 PM CT." />
              <Rule n="6" text="Miss the deadline and you'll be auto-assigned the SNF away team, then MNF. Miss both and you're eliminated." />
            </div>
          </div>
        </main>
      )}

      {/* Footer */}
      <footer style={{ background: 'var(--dark)' }} className="mt-8">
        <div className="mx-auto max-w-5xl px-4 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-0 justify-between">
          <span className="text-xs tracking-widest uppercase text-gray-500">$25 Entry · Venmo @griffinsell</span>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-xs tracking-widest uppercase text-gray-500 hover:text-white transition-colors sm:hidden">Log In</Link>
            <Link href="/signup" className="text-xs tracking-widest uppercase text-gray-500 hover:text-white transition-colors">Sign Up</Link>
            <Link href="/admin/login" className="text-xs tracking-widest uppercase text-gray-500 hover:text-white transition-colors">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function StatCol({ value, label, valueColor, border }: { value: string | number; label: string; valueColor?: string; border?: boolean }) {
  return (
    <div
      className="py-4 sm:py-6 px-3 sm:px-6"
      style={{ borderLeft: border ? `1px solid var(--border)` : undefined }}
    >
      <p className="font-display text-3xl sm:text-5xl leading-none" style={{ color: valueColor ?? 'var(--dark)' }}>
        {value}
      </p>
      <p className="mt-1 text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>{label}</p>
    </div>
  )
}

function Rule({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="font-bold shrink-0" style={{ color: 'var(--red)' }}>{n}.</span>
      <span>{text}</span>
    </div>
  )
}
