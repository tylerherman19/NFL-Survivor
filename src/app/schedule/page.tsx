import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { NFL_TEAM_NAMES } from '@/types'
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

async function getScheduleData(): Promise<{ weeks: ScheduleWeek[]; season: number; activeWeek: number | null }> {
  let activeWeek: number | null = null
  let season = 2026
  try {
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

  const startWeek = activeWeek ? Math.min(activeWeek + 1, TOTAL_WEEKS) : 1
  const endWeek = Math.min(startWeek + WEEKS_AHEAD - 1, TOTAL_WEEKS)

  const kalshiEvents = await getNflOdds()
  const weekNumbers: number[] = []
  for (let w = startWeek; w <= endWeek; w++) weekNumbers.push(w)

  const results = await Promise.all(weekNumbers.map((w) => fetchWeekGames(season, w, kalshiEvents)))
  const weeks: ScheduleWeek[] = weekNumbers.map((weekNumber, i) => ({ weekNumber, games: results[i] }))
  return { weeks, season, activeWeek }
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
  const { weeks, season, activeWeek } = await getScheduleData()
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
              className="font-display text-sm tracking-wider px-4 py-2 text-white"
              style={{ background: 'var(--red)' }}
            >
              SUBMIT PICK →
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-10">
        <div className="border-b pb-6" style={{ borderColor: 'var(--border)' }}>
          <h1 className="font-display text-6xl sm:text-7xl leading-none" style={{ color: 'var(--dark)' }}>
            UPCOMING SCHEDULE
          </h1>
          <p className="mt-2 text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            {season} Season{activeWeek ? ` · Currently Week ${activeWeek}` : ''}
          </p>
          <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
            Odds via Kalshi markets. Plan ahead — you can only use each team once.
          </p>
        </div>

        {!hasAnyGames ? (
          <div className="py-20 text-center">
            <p className="font-display text-4xl" style={{ color: 'var(--dark)' }}>SCHEDULE NOT AVAILABLE YET</p>
            <p className="text-sm mt-3" style={{ color: 'var(--muted)' }}>Check back once the league releases upcoming weeks.</p>
          </div>
        ) : (
          weeks.map(({ weekNumber, games }) =>
            games.length === 0 ? null : (
              <section key={weekNumber} className="py-8 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="font-display text-3xl mb-4" style={{ color: 'var(--dark)' }}>WEEK {weekNumber}</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <th className="py-2 text-left text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Matchup</th>
                      <th className="py-2 text-right text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Away Win</th>
                      <th className="py-2 text-right text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Home Win</th>
                      <th className="py-2 text-right text-xs tracking-widest uppercase hidden sm:table-cell" style={{ color: 'var(--muted)' }}>Kickoff (CT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g) => (
                      <tr key={`${g.awayAbbr}@${g.homeAbbr}`} className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-3">
                          <span className="font-bold font-mono" style={{ color: 'var(--dark)' }}>{g.awayAbbr}</span>
                          <span className="mx-1 text-xs" style={{ color: 'var(--muted)' }}>@</span>
                          <span className="font-bold font-mono" style={{ color: 'var(--dark)' }}>{g.homeAbbr}</span>
                          <span className="block sm:inline sm:ml-2 text-xs" style={{ color: 'var(--muted)' }}>
                            {NFL_TEAM_NAMES[g.awayAbbr] ?? g.awayAbbr} at {NFL_TEAM_NAMES[g.homeAbbr] ?? g.homeAbbr}
                          </span>
                          <span className="block sm:hidden text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{formatKickoff(g.kickoff)}</span>
                        </td>
                        <td className="py-3 text-right"><OddsCell prob={g.awayProb} /></td>
                        <td className="py-3 text-right"><OddsCell prob={g.homeProb} /></td>
                        <td className="py-3 text-right text-xs hidden sm:table-cell" style={{ color: 'var(--muted)' }}>{formatKickoff(g.kickoff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
