import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDb, isTestMode } from '@/lib/testMode'
import { teamColor } from '@/lib/teamColors'
import { getNflOdds, matchGameOdds, type KalshiNflEvent } from '@/lib/kalshi'

export const revalidate = 3600

const TOTAL_WEEKS = 18
const WEEKS_AHEAD = 4

interface ScheduleGame {
  homeAbbr: string
  awayAbbr: string
  kickoff: string // ISO UTC
  homeProb: number | null
  awayProb: number | null
}

interface ScheduleWeek {
  weekNumber: number
  games: ScheduleGame[]
}

// Read the slate straight out of our own `weeks`/`games` tables. This is the
// only source that exists in the sandbox — its matchups are fabricated, so
// ESPN has nothing to say about them — and it is also the fallback when ESPN
// can't serve a week in production.
async function fetchWeekGamesFromDb(
  supabase: SupabaseClient,
  season: number,
  weekNumbers: number[],
  kalshiEvents: KalshiNflEvent[]
): Promise<Record<number, ScheduleGame[]>> {
  const byWeek: Record<number, ScheduleGame[]> = {}
  try {
    const { data: weekRows } = await supabase
      .from('weeks')
      .select('id, week_number')
      .eq('season_year', season)
      .in('week_number', weekNumbers)
    if (!weekRows || weekRows.length === 0) return byWeek

    const weekNumberById: Record<string, number> = {}
    for (const w of weekRows) weekNumberById[w.id] = w.week_number

    const { data: games } = await supabase
      .from('games')
      .select('week_id, home_team, away_team, kickoff_central')
      .in('week_id', weekRows.map((w: { id: string }) => w.id))

    for (const g of games ?? []) {
      const weekNumber = weekNumberById[g.week_id]
      if (weekNumber === undefined) continue
      const odds = matchGameOdds(g.home_team, g.away_team, g.kickoff_central, kalshiEvents)
      ;(byWeek[weekNumber] ??= []).push({
        homeAbbr: g.home_team,
        awayAbbr: g.away_team,
        kickoff: g.kickoff_central,
        homeProb: odds?.homeProb ?? null,
        awayProb: odds?.awayProb ?? null,
      })
    }
    for (const weekGames of Object.values(byWeek)) {
      weekGames.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    }
  } catch {
    // fall through to whatever ESPN gave us
  }
  return byWeek
}

async function fetchWeekGames(season: number, week: number, kalshiEvents: KalshiNflEvent[]): Promise<ScheduleGame[]> {
  try {
    // ESPN's scoreboard uses `dates=` for the season year (`season=` is ignored)
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    const events: Array<{
      date: string
      competitions?: Array<{ competitors?: Array<{ homeAway: string; team: { abbreviation: string } }> }>
    }> = data.events ?? []

    const games: ScheduleGame[] = []
    for (const event of events) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      const home = comp.competitors?.find((c) => c.homeAway === 'home')
      const away = comp.competitors?.find((c) => c.homeAway === 'away')
      if (!home || !away) continue

      const odds = matchGameOdds(home.team.abbreviation, away.team.abbreviation, event.date, kalshiEvents)
      games.push({
        homeAbbr: home.team.abbreviation,
        awayAbbr: away.team.abbreviation,
        kickoff: event.date,
        homeProb: odds?.homeProb ?? null,
        awayProb: odds?.awayProb ?? null,
      })
    }
    games.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    return games
  } catch {
    return []
  }
}

async function getScheduleData(): Promise<{
  weeks: ScheduleWeek[]
  season: number
  activeWeek: number | null
  fromPoolSchedule: boolean
}> {
  let activeWeek: number | null = null
  let season = 2026
  let supabase: SupabaseClient | null = null
  const testMode = await isTestMode()
  try {
    supabase = await getDb()
    const { data: week } = await supabase
      .from('weeks')
      .select('week_number, season_year')
      .eq('is_active', true)
      .single()
    if (week) {
      activeWeek = week.week_number
      season = week.season_year
    }
  } catch { /* pool not started yet */ }

  // Normally this page looks strictly ahead — the current week is already on
  // the pick page. When the slate comes from our own tables we start at the
  // active week instead, because a sandbox is usually only a week or two deep
  // and skipping past it would leave the page empty.
  const dbSourced = testMode
  const startWeek = dbSourced
    ? (activeWeek ?? 1)
    : activeWeek
      ? Math.min(activeWeek + 1, TOTAL_WEEKS)
      : 1
  const endWeek = Math.min(startWeek + WEEKS_AHEAD - 1, TOTAL_WEEKS)

  const kalshiEvents = await getNflOdds()
  const weekNumbers: number[] = []
  for (let w = startWeek; w <= endWeek; w++) weekNumbers.push(w)

  // Sandbox matchups exist nowhere but our own tables, so skip ESPN entirely.
  const results = testMode
    ? weekNumbers.map(() => [] as ScheduleGame[])
    : await Promise.all(weekNumbers.map((w) => fetchWeekGames(season, w, kalshiEvents)))

  let weeks: ScheduleWeek[] = weekNumbers.map((weekNumber, i) => ({ weekNumber, games: results[i] }))

  // Fill in from our own schedule for any week ESPN had nothing for — every
  // week in the sandbox, and in production a week ESPN can't serve yet.
  let usedPoolSchedule = false
  if (supabase && weeks.some((w) => w.games.length === 0)) {
    const missing = weeks.filter((w) => w.games.length === 0).map((w) => w.weekNumber)
    const dbWeeks = await fetchWeekGamesFromDb(supabase, season, missing, kalshiEvents)
    weeks = weeks.map((w) => {
      const fallback = dbWeeks[w.weekNumber]
      if (w.games.length > 0 || !fallback?.length) return w
      usedPoolSchedule = true
      return { weekNumber: w.weekNumber, games: fallback }
    })
  }

  return { weeks, season, activeWeek, fromPoolSchedule: usedPoolSchedule }
}

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function OddsCell({ prob }: { prob: number | null }) {
  if (prob === null) return <span className="text-xs" style={{ color: 'var(--muted)' }}>—</span>
  const color = prob >= 0.6 ? 'var(--green)' : prob >= 0.4 ? 'var(--dark)' : 'var(--red)'
  return <span className="font-mono text-sm font-semibold" style={{ color }}>{Math.round(prob * 100)}%</span>
}

export default async function SchedulePage() {
  const { weeks, season, activeWeek, fromPoolSchedule } = await getScheduleData()
  const hasAnyGames = weeks.some((w) => w.games.length > 0)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>
      <header style={{ background: 'var(--dark)' }}>
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-white text-lg tracking-wider">NFL SURVIVOR POOL</Link>
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors">Standings</Link>
            <Link href="/login" className="text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors">Log In</Link>
            <Link
              href="/pick"
              className="btn-primary font-display text-sm tracking-wider px-4 py-2"
            >
              SUBMIT PICK
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-10">
        <div className="pb-2">
          <h1 className="font-display text-6xl sm:text-7xl leading-none" style={{ color: 'var(--dark)' }}>
            UPCOMING SCHEDULE
          </h1>
          <p className="mt-2 eyebrow">
            {season} Season{activeWeek ? ` · Currently Week ${activeWeek}` : ''}
          </p>
          <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
            Odds via Kalshi markets. Plan ahead — you can only use each team once.
          </p>
          {fromPoolSchedule && (
            <p className="mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>
              Showing this pool&apos;s own schedule — odds only appear where a Kalshi market matches the matchup.
            </p>
          )}
        </div>

        {!hasAnyGames ? (
          <div className="py-20 text-center">
            <p className="font-display text-4xl" style={{ color: 'var(--dark)' }}>SCHEDULE NOT AVAILABLE YET</p>
            <p className="text-sm mt-3" style={{ color: 'var(--muted)' }}>Check back once the league releases upcoming weeks.</p>
          </div>
        ) : (
          weeks.map(({ weekNumber, games }) =>
            games.length === 0 ? null : (
              <section key={weekNumber} className="pt-9">
                <p className="eyebrow mb-3">Week {weekNumber}</p>
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'var(--surface-sunken)' }}>
                        <th className="py-2.5 pl-4 text-left eyebrow">Matchup</th>
                        <th className="py-2.5 text-right eyebrow">Away</th>
                        <th className="py-2.5 text-right eyebrow">Home</th>
                        <th className="py-2.5 pr-4 text-right eyebrow hidden sm:table-cell">Kickoff (CT)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {games.map((g) => (
                        <tr key={`${g.awayAbbr}@${g.homeAbbr}`} className="row-hover border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-3 pl-4">
                            <div className="flex items-center gap-2">
                              <span className="team-chip-swatch" style={{ background: teamColor(g.awayAbbr).primary }}>{g.awayAbbr.slice(0, 3)}</span>
                              <span className="font-bold" style={{ color: 'var(--dark)' }}>{g.awayAbbr}</span>
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>@</span>
                              <span className="team-chip-swatch" style={{ background: teamColor(g.homeAbbr).primary }}>{g.homeAbbr.slice(0, 3)}</span>
                              <span className="font-bold" style={{ color: 'var(--dark)' }}>{g.homeAbbr}</span>
                            </div>
                            <span className="block sm:hidden text-xs mt-1" style={{ color: 'var(--muted)' }}>{formatKickoff(g.kickoff)}</span>
                          </td>
                          <td className="py-3 text-right"><OddsCell prob={g.awayProb} /></td>
                          <td className="py-3 text-right"><OddsCell prob={g.homeProb} /></td>
                          <td className="py-3 pr-4 text-right text-xs hidden sm:table-cell tnum" style={{ color: 'var(--muted)' }}>{formatKickoff(g.kickoff)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          )
        )}
      </main>

      <footer style={{ background: 'var(--dark)' }} className="mt-8">
        <div className="mx-auto max-w-5xl px-4 py-5">
          <span className="text-xs tracking-widest uppercase text-gray-500">Odds are market midpoints from Kalshi and shift constantly — not guarantees.</span>
        </div>
      </footer>
    </div>
  )
}
