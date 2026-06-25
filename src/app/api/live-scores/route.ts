import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

interface ESPNCompetitor {
  homeAway: 'home' | 'away'
  score: string
  team: { abbreviation: string }
}

interface ESPNEvent {
  id: string
  date: string
  competitions: Array<{
    status: {
      type: { state: string; shortDetail: string; completed: boolean }
      displayClock: string
      period: number
    }
    competitors: ESPNCompetitor[]
  }>
}

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
    // Get active week from our DB
    const { data: week } = await supabase
      .from('weeks')
      .select('id, week_number, season_year')
      .eq('is_active', true)
      .single()

    if (!week) {
      return NextResponse.json({
        weekNumber: null, games: [], picksVisible: false, hasLiveGames: false, season: null,
      }, { headers: { 'Cache-Control': 'public, max-age=60' } })
    }

    // Fetch ESPN scoreboard for active week
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&season=${week.season_year}&week=${week.week_number}`
    const espnRes = await fetch(espnUrl, { next: { revalidate: 30 } })

    if (!espnRes.ok) {
      return NextResponse.json({
        weekNumber: week.week_number, games: [], picksVisible: false, hasLiveGames: false, season: week.season_year,
      })
    }

    const espnData = await espnRes.json()

    // ESPN silently falls back to the most recent completed season when the
    // requested season has no data yet (e.g. querying 2026 in June 2026 returns
    // 2025 data). Validate the season matches before using any game data.
    const espnSeasonYear: number | null = espnData.season?.year ?? null
    if (espnSeasonYear !== null && espnSeasonYear !== week.season_year) {
      return NextResponse.json({
        weekNumber: week.week_number, season: week.season_year,
        games: [], picksVisible: false, hasLiveGames: false,
      }, { headers: { 'Cache-Control': 'public, max-age=300' } })
    }

    const events: ESPNEvent[] = espnData.events || []

    // Build game list from ESPN
    const games: LiveGame[] = events.map((event) => {
      const comp = event.competitions[0]
      const home = comp.competitors.find((c) => c.homeAway === 'home')!
      const away = comp.competitors.find((c) => c.homeAway === 'away')!
      const status = comp.status

      return {
        id: event.id,
        homeTeam: home.team.abbreviation,
        awayTeam: away.team.abbreviation,
        homeScore: parseInt(home.score) || 0,
        awayScore: parseInt(away.score) || 0,
        state: status.type.state as 'pre' | 'in' | 'post',
        statusText: status.type.shortDetail,
        kickoff: event.date,
      }
    })

    // Determine if picks are visible:
    // Show pick counts only after a team's game has started (state !== 'pre')
    // so picks can't be inferred before kickoff.
    const hasAnyStarted = games.some((g) => g.state !== 'pre')
    const hasLiveGames = games.some((g) => g.state === 'in')

    let picksVisible = false
    let pickCounts: Record<string, number> = {}

    if (hasAnyStarted) {
      picksVisible = true

      // Fetch pick counts from DB, excluding test accounts
      const { data: allPlayers } = await supabase
        .from('players')
        .select('id, email')

      const realPlayerIds = new Set(
        (allPlayers || [])
          .filter((p: { email: string }) => !p.email?.endsWith('@nflsurvivor.internal'))
          .map((p: { id: string }) => p.id)
      )

      const { data: picks } = await supabase
        .from('picks')
        .select('player_id, team')
        .eq('week_id', week.id)

      for (const pick of picks || []) {
        if (realPlayerIds.has(pick.player_id)) {
          pickCounts[pick.team] = (pickCounts[pick.team] || 0) + 1
        }
      }

      // Attach pick counts to games
      for (const game of games) {
        // Only show counts for games that have started
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
      picksVisible,
      hasLiveGames,
    }, {
      headers: {
        // Cache 30s during live games, 5min otherwise
        'Cache-Control': hasLiveGames
          ? 'public, max-age=30, stale-while-revalidate=10'
          : 'public, max-age=300, stale-while-revalidate=60',
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
