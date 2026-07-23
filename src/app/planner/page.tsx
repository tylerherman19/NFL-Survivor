import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/testMode'
import { fetchEspnScoreboard, eventCompetitors } from '@/lib/espn'
import { getNflOdds, matchGameOdds, type KalshiNflEvent } from '@/lib/kalshi'
import { NFL_TEAM_NAMES } from '@/types'
import { teamColor } from '@/lib/teamColors'
import LogoutButton from '../components/LogoutButton'

// Per-player view (session gated) — cannot be CDN-cached like the public pages.
export const dynamic = 'force-dynamic'

const TOTAL_WEEKS = 18
const WEEKS_AHEAD = 6

interface PlannerTeam {
  team: string
  opponent: string
  isHome: boolean
  prob: number | null
  kickoff: string
}

interface PlannerWeek {
  weekNumber: number
  isActive: boolean
  available: PlannerTeam[]
  usedThisWeek: string[]
  myPick: string | null
}

function kickoffDay(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function oddsColor(prob: number): string {
  if (prob >= 0.6) return 'var(--green)'
  if (prob >= 0.4) return 'var(--dark)'
  return 'var(--red)'
}

async function buildWeek(
  season: number,
  weekNumber: number,
  isActive: boolean,
  usedTeams: Set<string>,
  myPick: string | null,
  kalshiEvents: KalshiNflEvent[]
): Promise<PlannerWeek | null> {
  const events = await fetchEspnScoreboard(season, weekNumber, 3600)
  if (!events || events.length === 0) return null

  const available: PlannerTeam[] = []
  const usedThisWeek: string[] = []

  for (const event of events) {
    const teams = eventCompetitors(event)
    if (!teams) continue
    const homeAbbr = teams.home.team.abbreviation
    const awayAbbr = teams.away.team.abbreviation
    const odds = matchGameOdds(homeAbbr, awayAbbr, event.date, kalshiEvents)

    for (const side of [
      { team: homeAbbr, opponent: awayAbbr, isHome: true, prob: odds?.homeProb ?? null },
      { team: awayAbbr, opponent: homeAbbr, isHome: false, prob: odds?.awayProb ?? null },
    ]) {
      if (usedTeams.has(side.team)) {
        usedThisWeek.push(side.team)
      } else {
        available.push({ ...side, kickoff: event.date })
      }
    }
  }

  // Favorites first — survivor players want the safest available team. Teams
  // without a Kalshi market (far-out weeks) fall to the bottom, then alpha.
  available.sort((a, b) => {
    if (a.prob === null && b.prob === null) return a.team.localeCompare(b.team)
    if (a.prob === null) return 1
    if (b.prob === null) return -1
    return b.prob - a.prob
  })

  return { weekNumber, isActive, available, usedThisWeek, myPick }
}

async function getPlannerData(playerId: string) {
  const supabase = await getDb()

  const [weekRes, picksRes] = await Promise.all([
    supabase.from('weeks').select('week_number, season_year').eq('is_active', true).single(),
    supabase.from('picks').select('team, week_id').eq('player_id', playerId),
  ])

  const activeWeek = weekRes.data
  if (!activeWeek) return { weeks: [] as PlannerWeek[], usedCount: 0, activeWeekNumber: null as number | null }

  const season = activeWeek.season_year
  const activeWeekNumber = activeWeek.week_number

  // Resolve the active week's id so we can tell "already burned in a prior
  // week" (locks the team out) from "this week's pick" (still in play).
  const { data: allWeeks } = await supabase.from('weeks').select('id, week_number')
  const activeWeekId = (allWeeks ?? []).find((w) => w.week_number === activeWeekNumber)?.id ?? null

  const picks = picksRes.data ?? []
  const usedTeams = new Set(
    picks.filter((p) => p.week_id !== activeWeekId).map((p) => p.team)
  )
  const myPick = picks.find((p) => p.week_id === activeWeekId)?.team ?? null

  const startWeek = activeWeekNumber
  const endWeek = Math.min(startWeek + WEEKS_AHEAD - 1, TOTAL_WEEKS)
  const weekNumbers: number[] = []
  for (let w = startWeek; w <= endWeek; w++) weekNumbers.push(w)

  const kalshiEvents = await getNflOdds()
  const built = await Promise.all(
    weekNumbers.map((w) =>
      buildWeek(season, w, w === activeWeekNumber, usedTeams, w === activeWeekNumber ? myPick : null, kalshiEvents)
    )
  )

  return {
    weeks: built.filter((w): w is PlannerWeek => w !== null),
    usedCount: usedTeams.size,
    activeWeekNumber,
  }
}

export const metadata = { title: 'Season Planner — NFL Survivor Pool' }

export default async function PlannerPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  let weeks: PlannerWeek[] = []
  let usedCount = 0
  try {
    const data = await getPlannerData(session.player_id)
    weeks = data.weeks
    usedCount = data.usedCount
  } catch {
    /* degrade to empty state */
  }

  const teamsLeft = 32 - usedCount

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>
      <header style={{ background: 'var(--dark)' }}>
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-white text-lg tracking-wider">NFL SURVIVOR POOL</Link>
          <div className="flex items-center gap-4">
            <Link href="/pick" className="text-xs tracking-widest uppercase" style={{ color: '#888' }}>Make Pick</Link>
            <Link href="/history" className="text-xs tracking-widest uppercase" style={{ color: '#888' }}>My Picks</Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-10">
        <div className="pb-2">
          <h1 className="font-display text-5xl sm:text-6xl leading-none" style={{ color: 'var(--dark)' }}>
            SEASON PLANNER
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="pill pill-alive">{teamsLeft} of 32 teams left</span>
            <span className="text-sm" style={{ color: 'var(--muted)' }}>
              Map your unused teams against the weeks ahead — each team can only be picked once.
            </span>
          </div>
        </div>

        {weeks.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-display text-4xl" style={{ color: 'var(--dark)' }}>SCHEDULE NOT AVAILABLE YET</p>
            <p className="text-sm mt-3" style={{ color: 'var(--muted)' }}>
              Upcoming matchups appear here once the league releases them. Check back soon.
            </p>
          </div>
        ) : (
          <div className="space-y-9 mt-8">
            {weeks.map((wk) => {
              const best = wk.available.find((t) => t.prob !== null) ?? null
              return (
                <section key={wk.weekNumber}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="eyebrow">
                      Week {wk.weekNumber}
                      {wk.isActive && <span style={{ color: 'var(--red)' }}> · This week</span>}
                    </p>
                    {wk.myPick && (
                      <span className="text-xs tracking-widest uppercase" style={{ color: 'var(--green)' }}>
                        ✓ Picked {wk.myPick}
                      </span>
                    )}
                  </div>

                  {wk.available.length === 0 ? (
                    <div className="card p-5">
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>
                        You&apos;ve used every team playing this week. No survivable option left here.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {wk.available.map((t) => {
                        const c = teamColor(t.team).primary
                        const isBest = best !== null && t.team === best.team
                        return (
                          <div
                            key={t.team}
                            className="card relative overflow-hidden"
                            style={{ padding: '12px 12px 12px 16px', borderColor: isBest ? c : 'var(--border)' }}
                          >
                            <span className="absolute left-0 top-0 h-full" style={{ width: 4, background: c }} />
                            <div className="flex items-center gap-2">
                              <span className="team-chip-swatch" style={{ background: c }}>{t.team.slice(0, 3)}</span>
                              <span className="font-bold text-sm" style={{ color: 'var(--dark)' }}>{t.team}</span>
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                {t.isHome ? 'vs' : '@'} {t.opponent}
                              </span>
                              {isBest && (
                                <span
                                  className="ml-auto text-xs tracking-wider uppercase font-bold"
                                  style={{ color: c }}
                                >
                                  ★ Best
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                                {NFL_TEAM_NAMES[t.team] ?? t.team}
                              </p>
                              {t.prob !== null && (
                                <p className="text-xs font-semibold tnum" style={{ color: oddsColor(t.prob) }}>
                                  {Math.round(t.prob * 100)}% · {kickoffDay(t.kickoff)}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {wk.usedThisWeek.length > 0 && (
                    <p className="text-xs mt-2.5" style={{ color: 'var(--muted)' }}>
                      Already used, can&apos;t repick: {Array.from(new Set(wk.usedThisWeek)).sort().join(', ')}
                    </p>
                  )}
                </section>
              )
            })}
          </div>
        )}

        <p className="text-xs mt-10" style={{ color: 'var(--muted)' }}>
          Win odds are market midpoints from Kalshi and shift constantly — not guarantees. Far-out weeks may
          not have a market yet. This planner is just a strategy aid; your actual pick locks in on the{' '}
          <Link href="/pick" className="underline" style={{ color: 'var(--dark)' }}>pick page</Link>.
        </p>
      </main>
    </div>
  )
}
