import 'server-only'

// ESPN NFL scoreboard — the one external source for schedules, live scores,
// and final results. All four consumers (live-scores, sweat, sync-espn,
// sync-results) go through fetchEspnScoreboard so the season-fallback guard
// below is applied everywhere.

export interface EspnCompetitor {
  homeAway: 'home' | 'away'
  score: string
  team: { abbreviation: string }
}

export interface EspnEvent {
  id: string
  date: string
  competitions: Array<{
    status: {
      type: { state: string; shortDetail: string; completed: boolean }
      displayClock: string
      period: number
    }
    competitors: EspnCompetitor[]
    broadcasts?: Array<{ names?: string[] }>
  }>
}

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'

// Fetch the scoreboard for a season+week. Returns null when ESPN is
// unavailable or served a different season: ESPN silently falls back to the
// most recent completed season when the requested one has no data yet (e.g.
// querying 2026 in June 2026 returns 2025 games), and acting on that data
// would sync or grade the wrong season's results.
export async function fetchEspnScoreboard(
  seasonYear: number,
  weekNumber: number,
  revalidateSeconds = 0
): Promise<EspnEvent[] | null> {
  const url = `${SCOREBOARD_URL}?seasontype=2&dates=${seasonYear}&week=${weekNumber}`
  const res = await fetch(url, revalidateSeconds > 0 ? { next: { revalidate: revalidateSeconds } } : undefined)
  if (!res.ok) return null
  const data = await res.json()
  const espnSeasonYear: number | null = data.season?.year ?? null
  if (espnSeasonYear !== null && espnSeasonYear !== seasonYear) return null
  return data.events ?? []
}

// Pull home/away competitors out of an event, or null if malformed.
export function eventCompetitors(event: EspnEvent): { home: EspnCompetitor; away: EspnCompetitor } | null {
  const comp = event.competitions?.[0]
  if (!comp) return null
  const home = comp.competitors?.find((c) => c.homeAway === 'home')
  const away = comp.competitors?.find((c) => c.homeAway === 'away')
  return home && away ? { home, away } : null
}
