import { NextResponse } from 'next/server'
import { getDb, isTestMode, getEffectiveNow } from '@/lib/testMode'
import { isDeliverable } from '@/lib/email'
import { fetchEspnScoreboard, eventCompetitors } from '@/lib/espn'
import { isPickRevealed } from '@/lib/deadline'
import type { Game } from '@/types'

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
  // False when the game's outcome is known but the numbers aren't — a
  // production schedule row carries `result` but has no score columns.
  scoresKnown?: boolean
}

export interface LiveScoresResponse {
  weekNumber: number | null
  games: LiveGame[]
  picksVisible: boolean
  hasLiveGames: boolean
  season: number | null
  // Where the games came from: the live ESPN scoreboard, or this pool's own
  // schedule table (the sandbox, or a week ESPN can't serve yet).
  source: 'espn' | 'schedule' | 'none'
}

const EMPTY: LiveScoresResponse = {
  weekNumber: null, games: [], picksVisible: false, hasLiveGames: false, season: null, source: 'none',
}

// Turn a row from our own `games` table into a ticker card. Sandbox rows carry
// admin-entered scores; production rows don't have score columns at all, so
// those show as a schedule card until ESPN takes over.
function gameFromSchedule(g: Game, now: Date): LiveGame {
  const kickoff = new Date(g.kickoff_central)
  const started = !isNaN(kickoff.getTime()) && now >= kickoff
  const state: 'pre' | 'in' | 'post' =
    g.result !== 'pending' ? 'post' : started ? 'in' : 'pre'
  const scoresKnown = g.home_score != null && g.away_score != null

  let statusText: string
  if (state === 'post') {
    const winner =
      g.result === 'home_win' ? g.home_team : g.result === 'away_win' ? g.away_team : null
    statusText = scoresKnown ? 'Final' : winner ? `Final · ${winner}` : 'Final · tie'
  } else {
    statusText = state === 'in' ? 'In progress' : 'Scheduled'
  }

  return {
    id: g.id,
    homeTeam: g.home_team,
    awayTeam: g.away_team,
    homeScore: g.home_score ?? 0,
    awayScore: g.away_score ?? 0,
    state,
    statusText,
    kickoff: g.kickoff_central,
    scoresKnown,
  }
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
      return NextResponse.json(EMPTY, { headers: { 'Cache-Control': cacheHeader(60) } })
    }

    const [dbGamesRes, events, now] = await Promise.all([
      supabase.from('games').select('*').eq('week_id', week.id),
      // Sandbox matchups are fabricated, so there is nothing to look up on the
      // real scoreboard — skip the network call entirely and read the sandbox
      // schedule (with its admin-entered scores) below.
      //
      // In production this is null when ESPN is down or served last season's
      // data (its silent fallback before the requested season starts), which
      // also falls through to the schedule.
      testMode
        ? Promise.resolve(null)
        : fetchEspnScoreboard(week.season_year, week.week_number, 30).catch(() => null),
      getEffectiveNow(),
    ])

    const dbGames = (dbGamesRes.data ?? []) as Game[]

    let games: LiveGame[] = []
    let source: LiveScoresResponse['source'] = 'none'

    for (const event of events ?? []) {
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

    if (games.length > 0) {
      source = 'espn'
    } else if (dbGames.length > 0) {
      // No ESPN coverage (sandbox, or a week it can't serve): show this pool's
      // own slate so the ticker still carries the schedule and any result the
      // admin has entered, instead of disappearing entirely.
      games = dbGames.map((g) => gameFromSchedule(g, now))
      source = 'schedule'
    }

    games.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())

    const hasLiveGames = games.some((g) => g.state === 'in')

    // Pick counts go public per game, on the same rule as everywhere else: a
    // pick is shown once it locks, which is its own kickoff for Thu/Fri/Sat and
    // the Sunday 12 PM CT cutoff for the rest. Both are covered by
    // isPickRevealed against our schedule table.
    const revealedTeams = new Set<string>()
    for (const g of dbGames) {
      for (const team of [g.home_team, g.away_team]) {
        if (isPickRevealed(team, dbGames, now)) revealedTeams.add(team)
      }
    }
    // A started ESPN game is revealed too, even if our schedule row is missing
    // or its kickoff drifted (flex scheduling).
    for (const g of games) {
      if (g.state !== 'pre') {
        revealedTeams.add(g.homeTeam)
        revealedTeams.add(g.awayTeam)
      }
    }

    if (revealedTeams.size > 0) {
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

      for (const game of games) {
        if (revealedTeams.has(game.homeTeam)) game.homePicks = pickCounts[game.homeTeam] ?? 0
        if (revealedTeams.has(game.awayTeam)) game.awayPicks = pickCounts[game.awayTeam] ?? 0
      }
    }

    return NextResponse.json({
      weekNumber: week.week_number,
      season: week.season_year,
      games,
      picksVisible: revealedTeams.size > 0,
      hasLiveGames,
      source,
    } satisfies LiveScoresResponse, {
      headers: {
        // Cache 30s during live games, 5min otherwise
        'Cache-Control': hasLiveGames ? cacheHeader(30, 10) : cacheHeader(300, 60),
      },
    })
  } catch (err) {
    console.error('live-scores error', err)
    return NextResponse.json(EMPTY, { status: 500 })
  }
}
