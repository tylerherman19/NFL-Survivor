import Link from 'next/link'
import { NFL_TEAM_NAMES } from '@/types'
import type { StandingRow, TeamStat, Week } from '@/types'
import Countdown from './components/Countdown'
import LiveTicker from './components/LiveTicker'
import SiteHeader from './components/SiteHeader'

// Cache the server render for 60 seconds — serves ~1k concurrent users from CDN
// without hitting Supabase 1k times simultaneously. Pick deadline countdown
// updates client-side via the Countdown component regardless.
export const revalidate = 60

const TOTAL_WEEKS = 18

async function getDashboardData() {
  try {
    const { supabase } = await import('@/lib/supabase')
    const { getWeekSundayDeadline } = await import('@/lib/deadline')

    // Single Promise.all with 4 queries: all weeks, all players, all picks with team, all games
    const [
      { data: allWeeks },
      { data: allPlayers },
      { data: allPicks },
      { data: allGames }
    ] = await Promise.all([
      supabase.from('weeks').select('*').order('week_number'),
      supabase.from('players').select('id, full_name, email, status, elimination_week, elimination_reason, paid').order('full_name'),
      supabase.from('picks').select('player_id, week_id, team'),
      supabase.from('games').select('*')
    ])

    if (!allPlayers) return null
    const players = allPlayers.filter((p: { email: string }) => !p.email?.endsWith('@nflsurvivor.internal'))
    const realPlayerIds = new Set(players.map((p: { id: string }) => p.id))

    const totalPaid = players.filter((p: { paid: boolean }) => p.paid).length
    const potSize = totalPaid * 25
    const alive = players.filter((p: { status: string }) => p.status === 'alive')
    const payoutPerSurvivor = alive.length > 0 ? Math.floor(potSize / alive.length) : 0

    // Find active week from allWeeks
    const week = (allWeeks || []).find((w: { is_active: boolean }) => w.is_active) || null

    let currentPicks: Record<string, string> = {}
    let nextDeadline: string | null = null
    let nextDeadlineFormatted: string | null = null
    let picksRevealed = false

    if (week) {
      // Filter picks for current week from allPicks
      const picksData = (allPicks || []).filter((p: { week_id: string }) => p.week_id === week.id)
      if (picksData) {
        currentPicks = Object.fromEntries(
          picksData
            .filter((p: { player_id: string }) => realPlayerIds.has(p.player_id))
            .map((p: { player_id: string; team: string }) => [p.player_id, p.team])
        )
      }

      // Filter games for current week from allGames
      const gamesData = (allGames || []).filter((g: { week_id: string }) => g.week_id === week.id)
      if (gamesData) {
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
        picksRevealed = sundayDeadline ? sundayDeadline <= new Date() : false
      }
    }

    // Count weeks survived per player from all picks (including current week)
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

    // Filter picks to exclude current week for team stats and carnage
    const allPicksWithTeam = (allPicks || []).filter((p: { week_id: string }) => !week || p.week_id !== week.id)

    const teamMap: Record<string, { times_picked: number; wins: number; eliminations: number }> = {}
    if (allPicksWithTeam) {
      const winnersByWeek: Record<string, string[]> = {}
      for (const g of allGames || []) {
        if (g.result === 'home_win') winnersByWeek[g.week_id] = [...(winnersByWeek[g.week_id] || []), g.home_team]
        else if (g.result === 'away_win') winnersByWeek[g.week_id] = [...(winnersByWeek[g.week_id] || []), g.away_team]
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

    // Current-week pick distribution (only shown publicly after the reveal)
    const distMap: Record<string, number> = {}
    for (const team of Object.values(currentPicks)) {
      distMap[team] = (distMap[team] || 0) + 1
    }
    const pickDistribution = Object.entries(distMap)
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team))
    const picksMade = alive.filter((p: { id: string }) => currentPicks[p.id]).length
    const picksPending = alive.length - picksMade

    // Survival curve: players remaining after each completed week
    const completedWeeks = (allWeeks || []).filter(
      (w: { week_number: number }) => !week || w.week_number < week.week_number
    )
    const survivalCurve = completedWeeks.map((w: { week_number: number }) => ({
      week_number: w.week_number,
      remaining:
        players.length -
        players.filter(
          (p: { elimination_week: number | null }) =>
            p.elimination_week !== null && p.elimination_week <= w.week_number
        ).length,
    }))

    // Weekly carnage: eliminations per past week and the team most responsible
    const weekIdByNumber: Record<number, string> = {}
    for (const w of allWeeks || []) weekIdByNumber[w.week_number] = w.id
    const carnage = completedWeeks
      .map((w: { week_number: number }) => {
        const elim = players.filter(
          (p: { elimination_week: number | null }) => p.elimination_week === w.week_number
        )
        if (elim.length === 0) return null
        const teamCounts: Record<string, number> = {}
        for (const p of elim) {
          const pick = (allPicksWithTeam || []).find(
            (pk: { player_id: string; week_id: string }) =>
              pk.player_id === p.id && pk.week_id === weekIdByNumber[w.week_number]
          )
          const key = pick ? pick.team : 'no pick'
          teamCounts[key] = (teamCounts[key] || 0) + 1
        }
        let topTeam: string | null = null
        let topCount = 0
        for (const [team, count] of Object.entries(teamCounts)) {
          if (count > topCount) { topTeam = team; topCount = count }
        }
        return { week_number: w.week_number, eliminated: elim.length, topTeam }
      })
      .filter((c): c is { week_number: number; eliminated: number; topTeam: string | null } => c !== null)

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
      picksRevealed,
      pickDistribution,
      picksMade,
      picksPending,
      survivalCurve,
      carnage,
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
      <SiteHeader />

      {/* Live scores ticker — client component, polls independently of cached server render */}
      <LiveTicker weekNumber={data?.week?.week_number} season={data?.week?.season_year} />

      {data && data.aliveCount === 1 && aliveRows.length === 1 && (
        <div style={{ background: 'var(--dark)', borderBottom: '4px solid var(--green)' }}>
          <div className="mx-auto max-w-5xl px-4 py-8 text-center">
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--green)' }}>SURVIVOR CHAMPION</p>
            <p className="font-display text-7xl sm:text-8xl" style={{ color: 'var(--cream)' }}>{aliveRows[0].full_name.toUpperCase()}</p>
            <p className="mt-3 text-sm tracking-widest uppercase" style={{ color: 'var(--green)' }}>WINNER TAKES ${data.potSize}</p>
          </div>
        </div>
      )}

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
              <h1 className="font-display text-7xl sm:text-8xl leading-none" style={{ color: 'var(--dark)' }}>
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
            <table className="w-full text-sm">
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
                {aliveRows.map((row, i) => (
                  <tr key={row.player_id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 text-sm" style={{ color: 'var(--muted)' }}>{i + 1}</td>
                    <td className="py-3 font-bold" style={{ color: 'var(--dark)' }}>{row.full_name}</td>
                    <td className="py-3 hidden sm:table-cell">
                      <span className="text-xs font-bold tracking-wider" style={{ color: 'var(--green)' }}>• ALIVE</span>
                    </td>
                    <td className="py-3">
                      {row.current_pick ? (
                        data.picksRevealed ? (
                          <div>
                            <span className="font-bold font-mono text-sm" style={{ color: 'var(--green)' }}>{row.current_pick}</span>
                            <span className="ml-1 text-xs" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[row.current_pick]}</span>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>✓ Pick In</span>
                        )
                      ) : (
                        <span className="text-xs italic" style={{ color: 'var(--red)' }}>no pick yet</span>
                      )}
                    </td>
                    <td className="py-3 text-right text-xs hidden sm:table-cell" style={{ color: 'var(--muted)' }}>
                      {row.weeks_survived > 0 ? `${row.weeks_survived} wk${row.weeks_survived !== 1 ? 's' : ''}` : '—'}
                    </td>
                  </tr>
                ))}

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
                {elimRows.map((row) => (
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
              </tbody>
            </table>
          </div>

          {/* This Week's Pick Distribution */}
          {data.week && (
            <div className="py-8 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--muted)' }}>
                Week {data.week.week_number} Pick Distribution
              </p>
              {data.picksRevealed ? (
                data.pickDistribution.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>No picks were made this week.</p>
                ) : (
                  <div className="space-y-2">
                    {data.pickDistribution.map((d) => {
                      const max = data.pickDistribution[0].count
                      return (
                        <div key={d.team} className="flex items-center gap-3">
                          <span className="font-bold font-mono text-sm w-12 shrink-0" style={{ color: 'var(--dark)' }}>{d.team}</span>
                          <div className="flex-1 border" style={{ borderColor: 'var(--border)', background: 'white' }}>
                            <div
                              style={{
                                width: `${Math.max((d.count / max) * 100, 4)}%`,
                                background: 'var(--green)',
                                height: 10,
                              }}
                            />
                          </div>
                          <span className="text-sm w-16 shrink-0 text-right" style={{ color: 'var(--dark)' }}>
                            {d.count} {d.count === 1 ? 'pick' : 'picks'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : (
                <p className="text-sm" style={{ color: 'var(--dark)' }}>
                  <span className="font-bold" style={{ color: 'var(--green)' }}>{data.picksMade}</span> picks in ·{' '}
                  <span className="font-bold" style={{ color: 'var(--red)' }}>{data.picksPending}</span> pending
                  <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>— team breakdown revealed after Sunday 12 PM CT</span>
                </p>
              )}
            </div>
          )}

          {/* Survival curve */}
          {data.survivalCurve.length > 0 && (
            <div className="py-8 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--muted)' }}>Survivors by Week</p>
              <div className="flex flex-wrap gap-2">
                <div className="border px-4 py-2 text-center" style={{ borderColor: 'var(--border)', background: 'white' }}>
                  <p className="font-display text-2xl leading-none" style={{ color: 'var(--dark)' }}>{data.totalPlayers}</p>
                  <p className="text-xs tracking-widest uppercase mt-1" style={{ color: 'var(--muted)' }}>Start</p>
                </div>
                {data.survivalCurve.map((s) => (
                  <div key={s.week_number} className="border px-4 py-2 text-center" style={{ borderColor: 'var(--border)', background: 'white' }}>
                    <p
                      className="font-display text-2xl leading-none"
                      style={{ color: s.remaining <= data.aliveCount ? 'var(--green)' : 'var(--dark)' }}
                    >
                      {s.remaining}
                    </p>
                    <p className="text-xs tracking-widest uppercase mt-1" style={{ color: 'var(--muted)' }}>After Wk {s.week_number}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weekly carnage */}
          {data.carnage.length > 0 && (
            <div className="py-8 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--muted)' }}>Weekly Carnage</p>
              <div className="space-y-2 text-sm" style={{ color: 'var(--dark)' }}>
                {data.carnage.map((c) => (
                  <p key={c.week_number}>
                    <span className="font-bold" style={{ color: 'var(--red)' }}>Week {c.week_number}:</span>{' '}
                    {c.eliminated} player{c.eliminated !== 1 ? 's' : ''} eliminated
                    {c.topTeam && c.topTeam !== 'no pick' ? (
                      <span style={{ color: 'var(--muted)' }}>
                        {' '}(mostly on <span className="font-mono font-bold" style={{ color: 'var(--dark)' }}>{c.topTeam}</span>
                        {NFL_TEAM_NAMES[c.topTeam] ? ` — ${NFL_TEAM_NAMES[c.topTeam]}` : ''})
                      </span>
                    ) : c.topTeam === 'no pick' ? (
                      <span style={{ color: 'var(--muted)' }}> (mostly missed picks)</span>
                    ) : null}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Team Pick Stats (past weeks only) */}
          {data.teamStats.length > 0 && (
            <div className="py-8 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--muted)' }}>Team Pick History</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    {['Team', 'Times Picked', 'Win Rate', 'Eliminations'].map((h) => (
                      <th key={h} className="py-2 text-left text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.teamStats.map((stat) => (
                    <tr key={stat.team} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2.5">
                        <span className="font-bold font-mono" style={{ color: 'var(--dark)' }}>{stat.team}</span>
                        <span className="ml-2 text-xs hidden sm:inline" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[stat.team]}</span>
                      </td>
                      <td className="py-2.5" style={{ color: 'var(--dark)' }}>{stat.times_picked}</td>
                      <td className="py-2.5 font-semibold" style={{ color: stat.win_rate >= 0.6 ? 'var(--green)' : stat.win_rate >= 0.4 ? 'var(--dark)' : 'var(--red)' }}>
                        {(stat.win_rate * 100).toFixed(0)}%
                      </td>
                      <td className="py-2.5" style={{ color: 'var(--dark)' }}>{stat.eliminations_caused}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        <div className="mx-auto max-w-5xl px-4 py-5 flex items-center justify-between">
          <span className="text-xs tracking-widest uppercase text-gray-500">$25 Entry · Venmo @griffinsell</span>
          <div className="flex items-center gap-6">
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
      className="py-6 px-4 sm:px-6"
      style={{ borderLeft: border ? `1px solid var(--border)` : undefined }}
    >
      <p className="font-display text-5xl sm:text-6xl leading-none" style={{ color: valueColor ?? 'var(--dark)' }}>
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
