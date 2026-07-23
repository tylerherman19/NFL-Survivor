import { NextResponse } from 'next/server'
import { getDb, isTestMode } from '@/lib/testMode'
import { isDeliverable } from '@/lib/email'
import { fetchEspnScoreboard, eventCompetitors } from '@/lib/espn'

export interface LiveGame {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  state: 'pre' | 'in' | 'post'
  statusText: string  // e.g. "Q3 4:22", "Final", "7:30 PM ET"
  kickoff: string
  homePicks?: number
  awayPicks?: number
}

export interface LiveScoresResponse {
  weekNumber: number | null
  games: LiveGame[]
  picksVisible: boolean
  hasLiveGames: boolean
  season: number | null
}

export async function GET() {
  try {
    const supabase = await getDb()
    const testMode = await isTestMode()

    // Sandbox responses must never land in the shared CDN cache
    const cacheHeader = (maxAge: number, swr = 0) =>
      testMode
        ? 'private, no-store'
        : `public, max-age=${maxAge}${swr > 0 ? `, stale-while-revalidate=${swr}` : ''}`

    // Get active week from our DB
    const { data: week } = await supabase
      .from('weeks')
      .select('id, week_number, season_year')
      .eq('is_active', true)
      .single()

    if (!week) {
      return NextResponse.json({
        weekNumber: null, games: [], picksVisible: false, hasLiveGames: false, season: null,
      }, { headers: { 'Cache-Control': cacheHeader(60) } })
    }

    // Null when ESPN is down or served last season's data (its silent
    // fallback when the requested season hasn't started yet).
    const events = await fetchEspnScoreboard(week.season_year, week.week_number, 30)
    if (events === null) {
      return NextResponse.json({
        weekNumber: week.week_number, season: week.season_year,
        games: [], picksVisible: false, hasLiveGames: false,
      }, { headers: { 'Cache-Control': cacheHeader(300) } })
    }

    // Build game list from ESPN
    const games: LiveGame[] = []
    for (const event of events) {
      const teams = eventCompetitors(event)
      if (!teams) continue
      const status = event.competitions[0].status
      games.push({
        id: event.id,
        homeTeam: teams.home.team.abbreviation,
        awayTeam: teams.away.team.abbreviation,
        homeScore: parseInt(teams.home.score) || 0,
        awayScore: parseInt(teams.away.score) || 0,
        state: status.type.state as 'pre' | 'in' | 'post',
        statusText: status.type.shortDetail,
        kickoff: event.date,
      })
    }

    // Determine if picks are visible:
    // Show pick counts only after a team's game has started (state !== 'pre')
    // so picks can't be inferred before kickoff.
    const hasAnyStarted = games.some((g) => g.state !== 'pre')
    const hasLiveGames = games.some((g) => g.state === 'in')

    if (hasAnyStarted) {
      // Fetch pick counts from DB, excluding test accounts
      const { data: allPlayers } = await supabase
        .from('players')
        .select('id, email')

      const realPlayerIds = new Set(
        (allPlayers || [])
          .filter((p: { email: string }) => p.email && isDeliverable(p.email))
          .map((p: { id: string }) => p.id)
      )

      const { data: picks } = await supabase
        .from('picks')
        .select('player_id, team')
        .eq('week_id', week.id)

      const pickCounts: Record<string, number> = {}
      for (const pick of picks || []) {
        if (realPlayerIds.has(pick.player_id)) {
          pickCounts[pick.team] = (pickCounts[pick.team] || 0) + 1
        }
      }

      // Attach pick counts to games that have started
      for (const game of games) {
        if (game.state !== 'pre') {
          game.homePicks = pickCounts[game.homeTeam] ?? 0
          game.awayPicks = pickCounts[game.awayTeam] ?? 0
        }
      }
    }

    return NextResponse.json({
      weekNumber: week.week_number,
      season: week.season_year,
      games,
      picksVisible: hasAnyStarted,
      hasLiveGames,
    }, {
      headers: {
        // Cache 30s during live games, 5min otherwise
        'Cache-Control': hasLiveGames ? cacheHeader(30, 10) : cacheHeader(300, 60),
      },
    })
  } catch (err) {
    console.error('live-scores error', err)
    return NextResponse.json(
      { weekNumber: null, games: [], picksVisible: false, hasLiveGames: false, season: null },
      { status: 500 }
    )
  }
}
