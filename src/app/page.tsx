import Link from 'next/link'
import { NFL_TEAM_NAMES } from '@/types'
import type { StandingRow, TeamStat, Week } from '@/types'
import { teamColor } from '@/lib/teamColors'
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
          <div className="mx-auto max-w-5xl px-4 py-10 text-center">
            <p className="eyebrow mb-2" style={{ color: 'var(--green)' }}>Survivor Champion</p>
            <p className="font-display text-7xl sm:text-8xl" style={{ color: 'var(--cream)' }}>{aliveRows[0].full_name.toUpperCase()}</p>
            <p className="mt-3 eyebrow" style={{ color: 'var(--green)' }}>Winner Takes ${data.potSize}</p>
          </div>
        </div>
      )}

      {!data ? (
        <main className="mx-auto max-w-5xl px-4 py-24 text-center">
          <p className="font-display text-6xl" style={{ color: 'var(--dark)' }}>POOL SETUP IN PROGRESS</p>
          <p className="mt-4 eyebrow">Check back soon</p>
        </main>
      ) : (
        <main className="mx-auto max-w-5xl px-4 pb-4">
          {/* Hero */}
          <div className="pt-9 pb-7 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
            <div>
              <h1 className="font-display text-6xl sm:text-8xl leading-[0.9]" style={{ color: 'var(--dark)' }}>
                {data.week?.season_year ?? '2026'} SEASON
              </h1>
              <div className="mt-3 flex items-center gap-3">
                <span className="eyebrow">Week {data.week?.week_number ?? '—'} of {TOTAL_WEEKS}</span>
                <span className="hidden sm:block h-2 w-40 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
                  <span className="block h-full rounded-full" style={{ background: 'var(--dark)', width: `${((data.week?.week_number ?? 0) / TOTAL_WEEKS) * 100}%` }} />
                </span>
              </div>
            </div>
            {data.nextDeadline && (
              <div className="card px-5 py-4 sm:min-w-[240px]" style={{ borderColor: 'var(--border-strong)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="pill-dot" style={{ background: 'var(--red)' }} />
                  <p className="eyebrow" style={{ color: 'var(--red)' }}>Pick Deadline</p>
                </div>
                <p className="font-bold text-[15px]" style={{ color: 'var(--dark)' }}>{data.nextDeadlineFormatted}</p>
                <Countdown deadline={data.nextDeadline} />
              </div>
            )}
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard value={data.aliveCount} label="Still Alive" accent="var(--green)" />
            <StatCard value={data.eliminatedCount} label="Eliminated" accent="var(--red)" />
            <StatCard value={`$${data.potSize}`} label="Pot Size" accent="var(--dark)" />
            <StatCard
              value={data.aliveCount > 0 ? `$${data.payoutPerSurvivor}` : '—'}
              label={data.aliveCount === 1 ? 'Winner Takes' : 'Split Estimate'}
              accent="var(--dark)"
            />
          </div>

          {/* Standings */}
          <Section id="standings" title="Standings" className="pt-10">
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--surface-sunken)' }}>
                    <th className="py-2.5 pl-4 w-10 text-left eyebrow">#</th>
                    <th className="py-2.5 text-left eyebrow">Player</th>
                    <th className="py-2.5 text-left eyebrow hidden sm:table-cell">Status</th>
                    <th className="py-2.5 text-left eyebrow">{data.week ? `Wk ${data.week.week_number} Pick` : 'Pick'}</th>
                    <th className="py-2.5 pr-4 text-right eyebrow hidden sm:table-cell">Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {aliveRows.length > 0 && (
                    <tr>
                      <td colSpan={5} className="pt-4 pb-1.5 pl-4">
                        <span className="pill pill-alive"><span className="pill-dot" />{aliveRows.length} Still Alive</span>
                      </td>
                    </tr>
                  )}
                  {aliveRows.map((row, i) => (
                    <tr key={row.player_id} className="row-hover border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-3 pl-4 tnum text-sm" style={{ color: 'var(--muted)' }}>{i + 1}</td>
                      <td className="py-3 font-bold" style={{ color: 'var(--dark)' }}>{row.full_name}</td>
                      <td className="py-3 hidden sm:table-cell">
                        <span className="pill pill-alive"><span className="pill-dot" />Alive</span>
                      </td>
                      <td className="py-3">
                        {row.current_pick ? (
                          data.picksRevealed ? (
                            <TeamChip team={row.current_pick} showName />
                          ) : (
                            <span className="pill pill-alive">✓ Pick In</span>
                          )
                        ) : (
                          <span className="text-xs italic" style={{ color: 'var(--red)' }}>no pick yet</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right text-xs tnum hidden sm:table-cell" style={{ color: 'var(--muted)' }}>
                        {row.weeks_survived > 0 ? `${row.weeks_survived} wk${row.weeks_survived !== 1 ? 's' : ''}` : '—'}
                      </td>
                    </tr>
                  ))}

                  {elimRows.length > 0 && (
                    <tr>
                      <td colSpan={5} className="pt-6 pb-1.5 pl-4">
                        <span className="pill pill-out">♦ {elimRows.length} Eliminated</span>
                      </td>
                    </tr>
                  )}
                  {elimRows.map((row) => {
                    const ew = (row as StandingRow & { elimination_week?: number | null }).elimination_week
                    return (
                      <tr key={row.player_id} className="border-t" style={{ borderColor: 'var(--border)', opacity: 0.65 }}>
                        <td className="py-2.5 pl-4 text-sm" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="py-2.5 text-sm" style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>{row.full_name}</td>
                        <td className="py-2.5 hidden sm:table-cell">
                          <span className="pill pill-out">Out{ew ? ` · Wk ${ew}` : ''}</span>
                        </td>
                        <td className="py-2.5 text-xs" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="py-2.5 pr-4 text-right text-xs tnum hidden sm:table-cell" style={{ color: 'var(--muted)' }}>
                          {row.weeks_survived > 0 ? `${row.weeks_survived} wk${row.weeks_survived !== 1 ? 's' : ''}` : '1 wk'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* This Week's Pick Distribution */}
          {data.week && (
            <Section title={`Week ${data.week.week_number} Pick Distribution`}>
              <div className="card p-5">
                {data.picksRevealed ? (
                  data.pickDistribution.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>No picks were made this week.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {data.pickDistribution.map((d) => {
                        const max = data.pickDistribution[0].count
                        const c = teamColor(d.team).primary
                        return (
                          <div key={d.team} className="flex items-center gap-3">
                            <div className="w-16 shrink-0"><TeamChip team={d.team} /></div>
                            <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)', height: 12 }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.max((d.count / max) * 100, 5)}%`, background: c }} />
                            </div>
                            <span className="text-sm w-16 shrink-0 text-right tnum" style={{ color: 'var(--dark)' }}>
                              {d.count} {d.count === 1 ? 'pick' : 'picks'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                ) : (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-4xl leading-none" style={{ color: 'var(--green)' }}>{data.picksMade}</span>
                      <span className="eyebrow">Picks In</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-4xl leading-none" style={{ color: 'var(--red)' }}>{data.picksPending}</span>
                      <span className="eyebrow">Pending</span>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>Team breakdown revealed after Sunday 12 PM CT</span>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Survival curve */}
          {data.survivalCurve.length > 0 && (
            <Section title="Survivors by Week">
              <div className="card p-5">
                <SurvivalChart start={data.totalPlayers} points={data.survivalCurve} aliveCount={data.aliveCount} />
              </div>
            </Section>
          )}

          {/* Weekly carnage */}
          {data.carnage.length > 0 && (
            <Section title="Weekly Carnage">
              <div className="grid sm:grid-cols-2 gap-3">
                {data.carnage.map((c) => (
                  <div key={c.week_number} className="card px-4 py-3 flex items-center gap-4">
                    <div className="text-center shrink-0 w-12">
                      <p className="font-display text-3xl leading-none" style={{ color: 'var(--red)' }}>{c.eliminated}</p>
                      <p className="eyebrow mt-0.5" style={{ fontSize: 9 }}>out</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm" style={{ color: 'var(--dark)' }}>Week {c.week_number}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        {c.topTeam && c.topTeam !== 'no pick' ? (
                          <>mostly on <span className="font-semibold" style={{ color: 'var(--dark)' }}>{NFL_TEAM_NAMES[c.topTeam] ?? c.topTeam}</span></>
                        ) : c.topTeam === 'no pick' ? 'mostly missed picks' : 'eliminations'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Team Pick Stats (past weeks only) */}
          {data.teamStats.length > 0 && (
            <Section title="Team Pick History">
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)' }}>
                      <th className="py-2.5 pl-4 text-left eyebrow">Team</th>
                      <th className="py-2.5 text-left eyebrow">Times Picked</th>
                      <th className="py-2.5 text-left eyebrow">Win Rate</th>
                      <th className="py-2.5 pr-4 text-left eyebrow">Eliminations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teamStats.map((stat) => (
                      <tr key={stat.team} className="row-hover border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-2.5 pl-4"><TeamChip team={stat.team} showName /></td>
                        <td className="py-2.5 tnum" style={{ color: 'var(--dark)' }}>{stat.times_picked}</td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 rounded-full overflow-hidden hidden sm:block" style={{ background: 'var(--surface-sunken)', height: 6 }}>
                              <div className="h-full rounded-full" style={{ width: `${stat.win_rate * 100}%`, background: stat.win_rate >= 0.6 ? 'var(--green)' : stat.win_rate >= 0.4 ? 'var(--dark)' : 'var(--red)' }} />
                            </div>
                            <span className="font-semibold tnum" style={{ color: stat.win_rate >= 0.6 ? 'var(--green)' : stat.win_rate >= 0.4 ? 'var(--dark)' : 'var(--red)' }}>
                              {(stat.win_rate * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 tnum" style={{ color: 'var(--dark)' }}>{stat.eliminations_caused}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Rules */}
          <Section id="rules" title="How It Works">
            <div className="card p-5 sm:p-6 grid sm:grid-cols-2 gap-x-10 gap-y-4">
              <Rule n="1" text="Pay $25 entry via Venmo to @griffinsell." />
              <Rule n="2" text="Each week, pick one NFL team to win their game." />
              <Rule n="3" text="You can't pick the same team twice all season." />
              <Rule n="4" text="Your team wins → you survive. Loses or ties → you're out." />
              <Rule n="5" text="Thu/Fri/Sat games lock at kickoff. All other picks lock Sunday 12 PM CT." />
              <Rule n="6" text="Miss the deadline and you'll be auto-assigned the SNF away team, then MNF. Miss both and you're eliminated." />
            </div>
          </Section>
        </main>
      )}

      {/* Footer */}
      <footer style={{ background: 'var(--dark)' }} className="mt-10">
        <div className="mx-auto max-w-5xl px-4 py-6 flex items-center justify-between">
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

function Section({ id, title, children, className }: { id?: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`pt-9 ${className ?? ''}`}>
      <p className="eyebrow mb-3">{title}</p>
      {children}
    </section>
  )
}

function StatCard({ value, label, accent }: { value: string | number; label: string; accent: string }) {
  return (
    <div className="card px-4 py-5 sm:px-5 relative overflow-hidden">
      <span className="absolute left-0 top-0 h-full w-1" style={{ background: accent }} />
      <p className="font-display text-5xl sm:text-6xl leading-none tnum" style={{ color: accent }}>{value}</p>
      <p className="mt-1.5 eyebrow">{label}</p>
    </div>
  )
}

function TeamChip({ team, showName }: { team: string; showName?: boolean }) {
  const c = teamColor(team).primary
  return (
    <span className="team-chip text-sm" style={{ color: 'var(--dark)' }}>
      <span className="team-chip-swatch" style={{ background: c }}>{team.slice(0, 3)}</span>
      {showName && <span className="hidden sm:inline text-xs font-normal" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[team] ?? team}</span>}
    </span>
  )
}

function SurvivalChart({ start, points, aliveCount }: { start: number; points: { week_number: number; remaining: number }[]; aliveCount: number }) {
  const series = [{ week_number: 0, remaining: start }, ...points]
  const W = 900, H = 190, padL = 8, padR = 8, padT = 12, padB = 24
  const maxN = Math.max(start, 1) // guard: start can be 0 (no real players yet) → avoid divide-by-zero → NaN coords
  const n = series.length
  const x = (i: number) => padL + (i / Math.max(n - 1, 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - v / maxN) * (H - padT - padB)
  const linePts = series.map((s, i) => `${x(i)},${y(s.remaining)}`).join(' ')
  const areaPts = `${x(0)},${y(0)} ${linePts} ${x(n - 1)},${y(0)}`
  return (
    <div>
      {/* uniform scaling (no preserveAspectRatio="none") keeps the point circles round */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block', height: 'auto' }}>
        <defs>
          <linearGradient id="survFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--green)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill="url(#survFill)" />
        <polyline points={linePts} fill="none" stroke="var(--green)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {series.map((s, i) => (
          <circle key={i} cx={x(i)} cy={y(s.remaining)} r={3} fill="var(--surface)" stroke="var(--green)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between mt-2 text-center">
        {series.map((s, i) => (
          <div key={i} className="flex-1">
            <p className="font-bold text-sm tnum" style={{ color: s.remaining <= aliveCount ? 'var(--green)' : 'var(--dark)' }}>{s.remaining}</p>
            <p className="eyebrow" style={{ fontSize: 9 }}>{i === 0 ? 'Start' : `Wk ${s.week_number}`}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Rule({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex items-center justify-center shrink-0 rounded-full font-bold text-xs" style={{ background: 'var(--red-tint)', color: 'var(--red)', width: 22, height: 22 }}>{n}</span>
      <span className="text-sm pt-0.5" style={{ color: 'var(--dark)' }}>{text}</span>
    </div>
  )
}
