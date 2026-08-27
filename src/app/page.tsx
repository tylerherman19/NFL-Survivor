import Link from 'next/link'
import type { StandingRow, TeamStat, Week } from '@/types'
import { computeInsights, type PoolInsights } from '@/lib/insights'
import Countdown from './components/Countdown'
import LiveTicker from './components/LiveTicker'
import SiteHeader from './components/SiteHeader'
import TeamChip from './components/TeamChip'
import {
  BurnMap,
  ChalkFigure,
  ExposureFigure,
  LeverageTable,
  OverlapFigure,
  Story,
  TrajectoryFigure,
} from './components/insights'

// Cache the server render for 60 seconds — serves ~1k concurrent users from CDN
// without hitting Supabase 1k times simultaneously. Pick deadline countdown
// updates client-side via the Countdown component regardless.
export const revalidate = 60

const TOTAL_WEEKS = 18

async function getDashboardData() {
  try {
    const { getWeekSundayDeadline, isPickRevealed } = await import('@/lib/deadline')

    /* eslint-disable @typescript-eslint/no-explicit-any */
    let allWeeks: any[] | null = null
    let allPlayers: any[] | null = null
    let allPicks: any[] | null = null
    let allGames: any[] | null = null
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Local UI work only: a synthetic mid-season pool so every module renders
    // without DB access, which local dev has no credentials for (the Supabase
    // keys are Sensitive in Vercel and pull back empty). The NODE_ENV check is
    // the load-bearing half — it makes it impossible for a stray UI_DEMO in a
    // deployed environment to put fabricated standings in front of real
    // players, whatever the env vars say.
    const demoMode = process.env.NODE_ENV !== 'production' ? process.env.UI_DEMO : undefined
    if (demoMode === '1' || demoMode === '2') {
      const { buildDemoData } = await import('@/lib/demoData')
      const demo = buildDemoData(demoMode)
      allWeeks = demo.weeks
      allPlayers = demo.players
      allPicks = demo.picks
      allGames = demo.games
    } else {
      const { getDb } = await import('@/lib/testMode')
      const supabase = await getDb()

      // Single Promise.all with 4 queries: all weeks, all players, all picks with team, all games
      const [weeksRes, playersRes, picksRes, gamesRes] = await Promise.all([
        supabase.from('weeks').select('*').order('week_number'),
        supabase.from('players').select('id, full_name, email, status, elimination_week, elimination_reason, paid').order('full_name'),
        supabase.from('picks').select('player_id, week_id, team'),
        supabase.from('games').select('*')
      ])
      allWeeks = weeksRes.data
      allPlayers = playersRes.data
      allPicks = picksRes.data
      allGames = gamesRes.data
    }

    if (!allPlayers) return null
    const players = allPlayers.filter((p: { email: string }) => !p.email?.endsWith('@nflsurvivor.internal'))
    const realPlayerIds = new Set(players.map((p: { id: string }) => p.id))

    const totalPaid = players.filter((p: { paid: boolean }) => p.paid).length
    const potSize = totalPaid * 25
    const alive = players.filter((p: { status: string }) => p.status === 'alive')
    const payoutPerSurvivor = alive.length > 0 ? Math.floor(potSize / alive.length) : 0

    // Find active week from allWeeks
    const week = (allWeeks || []).find((w: { is_active: boolean }) => w.is_active) || null

    // Everything derived below is scoped to the season currently being played
    // (season_year), read off the active week like getSignupCutoff does — a
    // future season synced early, or last season's leftovers, must not get
    // folded into this season's carnage cards, survival curve, or team stats.
    // With no active week there is nothing being played, so fall back to the
    // newest season_year present.
    const seasonAnchor =
      week ||
      (allWeeks || [])
        .slice()
        .sort((a: { season_year: number }, b: { season_year: number }) => b.season_year - a.season_year)[0] ||
      null

    const seasonWeeks = (allWeeks || []).filter(
      (w: { season_year: number }) => !seasonAnchor || w.season_year === seasonAnchor.season_year
    )
    const seasonWeekIds = new Set<string>(seasonWeeks.map((w: { id: string }) => w.id))
    const seasonPicks = (allPicks || []).filter(
      (p: { week_id: string; player_id: string }) => seasonWeekIds.has(p.week_id) && realPlayerIds.has(p.player_id)
    )

    let currentPicks: Record<string, string> = {}
    // Subset of currentPicks whose team has already locked, so it can be shown
    // publicly. Fills in through the week: Thursday picks first, the rest at
    // Sunday noon.
    const revealedPicks: Record<string, string> = {}
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
        const { getEffectiveNow } = await import('@/lib/testMode')
        const now = await getEffectiveNow()
        const sundayDeadline = getWeekSundayDeadline(gamesData)
        if (sundayDeadline && sundayDeadline > now) {
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
        picksRevealed = sundayDeadline ? sundayDeadline <= now : false

        const revealedTeams = new Map<string, boolean>()
        for (const [playerId, team] of Object.entries(currentPicks)) {
          if (!revealedTeams.has(team)) {
            revealedTeams.set(team, isPickRevealed(team, gamesData, now))
          }
          if (revealedTeams.get(team)) revealedPicks[playerId] = team
        }
      }
    }

    // Count weeks survived per player from this season's picks (including current week)
    const weeksSurvivedByPlayer: Record<string, number> = {}
    for (const pick of seasonPicks) {
      weeksSurvivedByPlayer[pick.player_id] = (weeksSurvivedByPlayer[pick.player_id] || 0) + 1
    }

    const standings: StandingRow[] = players.map(
      (p: { id: string; full_name: string; status: string; elimination_reason: string | null; elimination_week: number | null }) => ({
        player_id: p.id,
        full_name: p.full_name,
        status: p.status as 'alive' | 'eliminated',
        weeks_survived: weeksSurvivedByPlayer[p.id] || 0,
        current_pick: currentPicks[p.id] || null,
        pick_locked: !!currentPicks[p.id],
        pick_revealed: !!revealedPicks[p.id],
        elimination_reason: p.elimination_reason,
        elimination_week: p.elimination_week,
      })
    )

    standings.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'alive' ? -1 : 1
      return b.weeks_survived - a.weeks_survived
    })

    // Filter picks to exclude current week for team stats
    const allPicksWithTeam = seasonPicks.filter((p: { week_id: string }) => !week || p.week_id !== week.id)

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

    const picksMade = alive.filter((p: { id: string }) => currentPicks[p.id]).length
    const picksPending = alive.length - picksMade

    // Everything the editorial modules need is already in hand — the insight
    // layer is a pure function over it, and only ever sees revealed picks for
    // the current week.
    const insights = computeInsights({
      players,
      weeks: seasonWeeks
        .slice()
        .sort((a: { week_number: number }, b: { week_number: number }) => a.week_number - b.week_number),
      picks: seasonPicks,
      games: allGames || [],
      currentWeek: week,
      revealedCurrentPicks: revealedPicks,
      picksMade,
      potSize,
      totalWeeks: TOTAL_WEEKS,
    })

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
      picksMade,
      picksPending,
      insights,
    }
  } catch {
    return null
  }
}

/** The one sentence worth putting at the top of the page. */
function topLine(insights: PoolInsights, aliveCount: number): string | null {
  return (
    insights.exposure?.headline ??
    insights.trajectory?.headline ??
    insights.chalk?.headline ??
    (aliveCount > 0 ? null : null)
  )
}

export default async function DashboardPage() {
  const { haveSignupsClosed } = await import('@/lib/season')
  const [data, signupsClosed] = await Promise.all([getDashboardData(), haveSignupsClosed()])

  const aliveRows = data?.standings.filter((r) => r.status === 'alive') ?? []
  const elimRows = data?.standings.filter((r) => r.status === 'eliminated') ?? []
  const insights = data?.insights
  const lede = data && insights ? topLine(insights, data.aliveCount) : null

  return (
    <div style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      {/* Header */}
      <SiteHeader signupsClosed={signupsClosed} />

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
          {/* Masthead: the week, the deadline, and the finding that leads the page */}
          <div className="pt-9 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
              <div className="min-w-0">
                <h1 className="font-display text-6xl sm:text-7xl leading-[0.88]" style={{ color: 'var(--dark)' }}>
                  {data.week?.season_year ?? '2026'} SEASON
                </h1>
                <div className="mt-3 flex items-center gap-3">
                  <span className="eyebrow">Week {data.week?.week_number ?? '—'} of {TOTAL_WEEKS}</span>
                  <span className="hidden sm:block h-1.5 w-40 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }}>
                    <span className="block h-full rounded-full" style={{ background: 'var(--dark)', width: `${((data.week?.week_number ?? 0) / TOTAL_WEEKS) * 100}%` }} />
                  </span>
                </div>
              </div>
              {data.nextDeadline && (
                <div className="card px-5 py-4 sm:min-w-[240px] shrink-0" style={{ borderColor: 'var(--border-strong)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="pill-dot" style={{ background: 'var(--red)' }} />
                    <p className="eyebrow" style={{ color: 'var(--red)' }}>Pick Deadline</p>
                  </div>
                  <p className="font-bold text-[15px]" style={{ color: 'var(--dark)' }}>{data.nextDeadlineFormatted}</p>
                  <Countdown deadline={data.nextDeadline} />
                </div>
              )}
            </div>

            {lede && (
              <p className="lede mt-6" style={{ maxWidth: '52ch' }}>{lede}</p>
            )}
          </div>

          {/* Scoreboard: the four numbers, set as a ruled strip rather than four boxes */}
          <div className="card grid grid-cols-2 sm:grid-cols-4 overflow-hidden">
            <Figure value={data.aliveCount} label="Still Alive" accent="var(--green)" />
            <Figure value={data.eliminatedCount} label="Eliminated" accent="var(--red)" />
            <Figure value={`$${data.potSize}`} label="Pot Size" accent="var(--ink)" />
            <Figure
              value={data.aliveCount > 0 && data.aliveCount < 20 ? `$${data.payoutPerSurvivor}` : `${data.picksMade}/${data.aliveCount}`}
              label={
                data.aliveCount > 0 && data.aliveCount < 20
                  ? data.aliveCount === 1 ? 'Winner Takes' : 'Split Estimate'
                  : 'Picks In'
              }
              accent="var(--ink)"
            />
          </div>

          {/* ---- This week ---- */}
          {insights?.exposure && (
            <Story
              kicker={`Week ${data.week?.week_number} · Exposure`}
              lede={insights.exposure.headline === lede ? undefined : insights.exposure.headline}
              deck={insights.exposure.deck}
              method="Built only from picks that are already public — a pick goes public the moment its game kicks off, and the rest at Sunday 12 PM CT. Survivor counts assume every other public pick holds."
            >
              <ExposureFigure data={insights.exposure} />
            </Story>
          )}

          {insights?.leverage && (
            <Story
              kicker="Leverage"
              lede={insights.leverage.headline}
              deck={insights.leverage.deck}
              method="Best case is the field that would remain if this pick wins and every other public pick loses. Dollar figures split the current pot across that field."
            >
              <LeverageTable data={insights.leverage} />
            </Story>
          )}

          {/* ---- Standings ---- */}
          <Section id="standings" title="Standings" className="pt-10">
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--surface-sunken)' }}>
                    <th className="py-2.5 pl-4 text-left eyebrow w-full">Player</th>
                    <th className="py-2.5 px-4 text-left eyebrow hidden sm:table-cell whitespace-nowrap">Status</th>
                    <th className="py-2.5 pl-4 pr-4 text-left eyebrow whitespace-nowrap">{data.week ? `Wk ${data.week.week_number} Pick` : 'Pick'}</th>
                  </tr>
                </thead>
                <tbody>
                  {aliveRows.length > 0 && (
                    <tr>
                      <td colSpan={3} className="pt-4 pb-1.5 pl-4">
                        <span className="pill pill-alive"><span className="pill-dot" />{aliveRows.length} Still Alive</span>
                      </td>
                    </tr>
                  )}
                  {aliveRows.map((row) => (
                    <tr key={row.player_id} className="row-hover border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-3 pl-4 font-bold" style={{ color: 'var(--dark)' }}>{row.full_name}</td>
                      <td className="py-3 px-4 hidden sm:table-cell">
                        <span className="pill pill-alive"><span className="pill-dot" />Alive</span>
                      </td>
                      <td className="py-3 pl-4 pr-4">
                        {row.current_pick ? (
                          row.pick_revealed ? (
                            <TeamChip team={row.current_pick} size={18} />
                          ) : (
                            <span className="pill pill-alive">✓ Pick In</span>
                          )
                        ) : (
                          <span className="text-xs italic" style={{ color: 'var(--red)' }}>no pick yet</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {elimRows.length > 0 && (
                    <tr>
                      <td colSpan={3} className="pt-6 pb-1.5 pl-4">
                        <span className="pill pill-out">♦ {elimRows.length} Eliminated</span>
                      </td>
                    </tr>
                  )}
                  {elimRows.map((row) => {
                    const ew = (row as StandingRow & { elimination_week?: number | null }).elimination_week
                    return (
                      <tr key={row.player_id} className="border-t" style={{ borderColor: 'var(--border)', opacity: 0.65 }}>
                        <td className="py-2.5 pl-4 text-sm" style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>{row.full_name}</td>
                        <td className="py-2.5 px-4 hidden sm:table-cell">
                          <span className="pill pill-out">Out{ew ? ` · Wk ${ew}` : ''}</span>
                        </td>
                        <td className="py-2.5 pl-4 pr-4 text-xs" style={{ color: 'var(--muted)' }}>
                          {row.elimination_reason ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ---- The season so far ---- */}
          {(insights?.trajectory || insights?.chalk || insights?.scarcity || insights?.overlap) && (
            <div className="pt-12">
              <hr className="story-rule" />
              <p className="eyebrow mt-4">The season so far</p>
            </div>
          )}

          {insights?.trajectory && (
            <Story
              kicker="Attrition"
              lede={insights.trajectory.headline === lede ? undefined : insights.trajectory.headline}
              deck={insights.trajectory.deck}
              method="The dashed projection compounds the season's average weekly survival rate forward. It is an extrapolation of this pool's own results, not a forecast of any game."
            >
              <TrajectoryFigure data={insights.trajectory} />
            </Story>
          )}

          {insights?.chalk && (
            <Story
              kicker="The crowd"
              lede={insights.chalk.headline}
              deck={insights.chalk.deck}
              method="The crowd pick is the most-selected team in a completed week, across every entry that was still alive to make one."
            >
              <ChalkFigure data={insights.chalk} />
            </Story>
          )}

          {insights?.scarcity && (
            <Story
              kicker="What's left on the board"
              lede={insights.scarcity.headline}
              deck={insights.scarcity.deck}
              method="Counts cover surviving entries only. A team is spent for a player the moment their pick on it locks — you can't pick the same team twice all season."
            >
              <BurnMap data={insights.scarcity} />
            </Story>
          )}

          {insights?.overlap && (
            <Story
              kicker="Divergence"
              lede={insights.overlap.headline}
              deck={insights.overlap.deck}
              method="Overlap is the share of two survivors' unused teams that is common to both. Boards that overlap heavily tend to live and die together in later weeks."
            >
              <OverlapFigure data={insights.overlap} />
            </Story>
          )}

          {/* Team ledger — how each team has actually treated the people who picked it */}
          {data.teamStats.length > 0 && (
            <Section title="Team ledger">
              <div className="card overflow-hidden">
                {/* Every cell carries its own horizontal padding: .eyebrow's 0.18em
                    tracking makes these headers wide enough that with no gap they
                    ran together into one "TEAM TIMES PICKED WIN RATE ELIMINATIONS"
                    string on a phone. Short labels keep four tracked columns inside
                    a 390px viewport, and the numeric columns are right-aligned so
                    the figures sit under their own header instead of hugging the
                    column to their left. */}
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)' }}>
                      <th className="py-2.5 pl-4 pr-3 text-left eyebrow">Team</th>
                      <th className="py-2.5 px-3 text-right eyebrow whitespace-nowrap">Picks</th>
                      <th className="py-2.5 px-3 text-right eyebrow whitespace-nowrap">Win Rate</th>
                      <th className="py-2.5 pl-3 pr-4 text-right eyebrow whitespace-nowrap">Outs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teamStats.map((stat) => (
                      <tr key={stat.team} className="row-hover border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-2.5 pl-4 pr-3"><TeamChip team={stat.team} showName size={18} /></td>
                        <td className="py-2.5 px-3 text-right tnum" style={{ color: 'var(--dark)' }}>{stat.times_picked}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 rounded-full overflow-hidden hidden sm:block" style={{ background: 'var(--surface-sunken)', height: 6 }}>
                              <div className="h-full rounded-full" style={{ width: `${stat.win_rate * 100}%`, background: stat.win_rate >= 0.6 ? 'var(--green)' : stat.win_rate >= 0.4 ? 'var(--dark)' : 'var(--red)' }} />
                            </div>
                            <span className="font-semibold tnum" style={{ color: stat.win_rate >= 0.6 ? 'var(--green)' : stat.win_rate >= 0.4 ? 'var(--dark)' : 'var(--red)' }}>
                              {(stat.win_rate * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pl-3 pr-4 text-right tnum" style={{ color: 'var(--dark)' }}>{stat.eliminations_caused}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="method">Completed weeks only. Win rate is how often a team delivered for the people who picked it; Outs is how many entries it ended.</p>
            </Section>
          )}

          {/* Rules */}
          <Section id="rules" title="How It Works">
            <div className="card p-5 sm:p-6 grid sm:grid-cols-2 gap-x-10 gap-y-4">
              <Rule n="1" text="Pay $25 entry via Venmo to @griffinsell." />
              <Rule n="2" text="Each week, pick one NFL team to win their game." />
              <Rule n="3" text="You can't pick the same team twice all season." />
              <Rule n="4" text="Your team wins, you survive. Loses or ties, you're out." />
              <Rule n="5" text="Wed/Thu/Fri/Sat games lock at kickoff. All other picks lock Sunday 12 PM CT." />
              <Rule n="6" text="Miss the deadline and you'll be auto-assigned the SNF away team, but if already picked, then the MNF away team. If both have already been picked, you're eliminated." />
            </div>
          </Section>
        </main>
      )}

      {/* Footer */}
      <footer style={{ background: 'var(--dark)' }} className="mt-10">
        <div className="mx-auto max-w-5xl px-4 py-6 flex items-center justify-between">
          <span className="text-xs tracking-widest uppercase text-gray-500">$25 Entry · Venmo @griffinsell</span>
          <div className="flex items-center gap-6">
            {!signupsClosed && (
              <Link href="/signup" className="text-xs tracking-widest uppercase text-gray-500 hover:text-white transition-colors">Sign Up</Link>
            )}
            <Link href="/admin/login" className="text-xs tracking-widest uppercase text-gray-500 hover:text-white transition-colors">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Section({ id, title, children, className }: { id?: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`pt-10 ${className ?? ''}`}>
      <p className="eyebrow mb-3">{title}</p>
      {children}
    </section>
  )
}

function Figure({ value, label, accent }: { value: string | number; label: string; accent: string }) {
  return (
    <div className="px-4 py-4 sm:px-5 border-t sm:border-t-0 sm:border-l first:border-t-0 sm:first:border-l-0 [&:nth-child(2)]:border-t-0 sm:[&:nth-child(2)]:border-l" style={{ borderColor: 'var(--border)' }}>
      <p className="figure-num text-4xl sm:text-5xl" style={{ color: accent }}>{value}</p>
      <p className="mt-2 eyebrow">{label}</p>
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
