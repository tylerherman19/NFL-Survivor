import { NextResponse } from 'next/server'
import { getDb, isTestMode, getEffectiveNow } from '@/lib/testMode'
import { getWeekSundayDeadline, isPickRevealed } from '@/lib/deadline'
import { isDeliverable } from '@/lib/email'
import { fetchEspnScoreboard, eventCompetitors } from '@/lib/espn'
import type { Game } from '@/types'

export type SweatStatus =
  | 'won' // final, team won
  | 'winning' // live, ahead
  | 'tied' // live, tied
  | 'losing' // live, behind
  | 'lost' // final, team lost or tied (tie = elimination)
  | 'pre' // pick revealed, game not started
  | 'pick_in' // pick made but not yet revealed
  | 'pending' // no pick, deadline not passed
  | 'no_pick' // no pick, deadline passed (auto-assign / elimination territory)

export interface SweatPlayer {
  name: string
  team: string | null // null while hidden or no pick
  status: SweatStatus
}

export interface SweatGame {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  state: 'pre' | 'in' | 'post'
  statusText: string
  kickoff: string
  homePlayers: string[] // revealed picks only
  awayPlayers: string[]
}

export interface SweatResponse {
  weekNumber: number | null
  seasonType: 'preseason' | 'regular' | null
  season: number | null
  hasLiveGames: boolean
  allRevealed: boolean
  games: SweatGame[]
  players: SweatPlayer[]
  summary: {
    safe: number // won
    winning: number
    losing: number // losing or tied (a tie eliminates)
    out: number // lost
    notStarted: number // revealed pick, game pre
    hidden: number // pick in, not revealed
    pending: number // no pick, deadline open
    noPick: number // no pick, deadline passed
  }
}

const EMPTY: SweatResponse = {
  weekNumber: null,
  seasonType: null,
  season: null,
  hasLiveGames: false,
  allRevealed: false,
  games: [],
  players: [],
  summary: { safe: 0, winning: 0, losing: 0, out: 0, notStarted: 0, hidden: 0, pending: 0, noPick: 0 },
}

export async function GET() {
  try {
    const supabase = await getDb()
    const testMode = await isTestMode()
    const { data: week } = await supabase
      .from('weeks')
      .select('id, week_number, season_year, season_type')
      .eq('is_active', true)
      .single()

    if (!week) {
      return NextResponse.json(EMPTY, { headers: { 'Cache-Control': testMode ? 'private, no-store' : 'public, max-age=300' } })
    }

    const [playersRes, picksRes, dbGamesRes, events] = await Promise.all([
      supabase
        .from('players')
        .select('id, full_name, email, status, elimination_week')
        .order('full_name'),
      supabase.from('picks').select('player_id, team').eq('week_id', week.id),
      supabase.from('games').select('*').eq('week_id', week.id),
      // Sandbox matchups are fabricated, so there's nothing to look up on the
      // real scoreboard — skip the network call and read sandbox.games (with
      // its admin-entered scores) instead, below.
      testMode
        ? Promise.resolve(null)
        // Null when ESPN is down or served last season's data — treated below
        // as "no ESPN games", so every revealed pick just shows as not started.
        : fetchEspnScoreboard(week.season_year, week.week_number, 30, week.season_type ?? 'regular').catch(() => null),
    ])

    // Alive players sweat; players eliminated this week stay on the board as OUT.
    const players = (playersRes.data ?? []).filter(
      (p: { email: string; status: string; elimination_week: number | null }) =>
        p.email && isDeliverable(p.email) &&
        (p.status === 'alive' || p.elimination_week === week.week_number)
    )
    const pickByPlayer: Record<string, string> = {}
    for (const p of picksRes.data ?? []) pickByPlayer[p.player_id] = p.team

    const dbGames = (dbGamesRes.data ?? []) as Game[]
    const now = await getEffectiveNow()
    const sundayDeadline = getWeekSundayDeadline(dbGames)
    const deadlinePassed = sundayDeadline ? sundayDeadline <= now : false

    const espnGames: SweatGame[] = []
    if (testMode) {
      // Sandbox: derive game state from the simulated clock vs. each game's
      // kickoff, plus whatever scores/result an admin has entered by hand on
      // /admin/testing — a game only becomes "post" once explicitly finalized.
      for (const g of dbGames) {
        const state: 'pre' | 'in' | 'post' =
          g.result !== 'pending' ? 'post' : now >= new Date(g.kickoff_central) ? 'in' : 'pre'
        espnGames.push({
          id: g.id,
          homeTeam: g.home_team,
          awayTeam: g.away_team,
          homeScore: g.home_score ?? 0,
          awayScore: g.away_score ?? 0,
          state,
          statusText: state === 'post' ? 'Final (sandbox)' : state === 'in' ? 'In progress (sandbox)' : 'Not started',
          kickoff: g.kickoff_central,
          homePlayers: [],
          awayPlayers: [],
        })
      }
    } else {
      for (const event of events ?? []) {
        const teams = eventCompetitors(event)
        if (!teams) continue
        const status = event.competitions[0].status
        espnGames.push({
          id: event.id,
          homeTeam: teams.home.team.abbreviation,
          awayTeam: teams.away.team.abbreviation,
          homeScore: parseInt(teams.home.score) || 0,
          awayScore: parseInt(teams.away.score) || 0,
          state: status.type.state as 'pre' | 'in' | 'post',
          statusText: status.type.shortDetail,
          kickoff: event.date,
          homePlayers: [],
          awayPlayers: [],
        })
      }
    }

    const gameByTeam: Record<string, SweatGame> = {}
    for (const g of espnGames) {
      gameByTeam[g.homeTeam] = g
      gameByTeam[g.awayTeam] = g
    }

    const summary = { safe: 0, winning: 0, losing: 0, out: 0, notStarted: 0, hidden: 0, pending: 0, noPick: 0 }
    const sweatPlayers: SweatPlayer[] = players.map(
      (p: { id: string; full_name: string }) => {
        const team = pickByPlayer[p.id]
        if (!team) {
          if (deadlinePassed) {
            summary.noPick++
            return { name: p.full_name, team: null, status: 'no_pick' as const }
          }
          summary.pending++
          return { name: p.full_name, team: null, status: 'pending' as const }
        }

        const game = gameByTeam[team]
        // A pick is revealed the moment it locks — our own schedule decides
        // that (own kickoff for Thu/Fri/Sat, Sunday noon for the rest). ESPN
        // reporting the game as started counts too, in case a flexed kickoff
        // moved ahead of what we have stored.
        const revealed =
          isPickRevealed(team, dbGames, now) || (game !== undefined && game.state !== 'pre')
        if (!revealed) {
          summary.hidden++
          return { name: p.full_name, team: null, status: 'pick_in' as const }
        }

        if (!game) {
          summary.notStarted++
          return { name: p.full_name, team, status: 'pre' as const }
        }

        const isHome = game.homeTeam === team
        if (isHome) game.homePlayers.push(p.full_name)
        else game.awayPlayers.push(p.full_name)

        if (game.state === 'pre') {
          summary.notStarted++
          return { name: p.full_name, team, status: 'pre' as const }
        }

        const my = isHome ? game.homeScore : game.awayScore
        const their = isHome ? game.awayScore : game.homeScore
        let status: SweatStatus
        if (game.state === 'post') {
          status = my > their ? 'won' : 'lost' // tie eliminates
          if (status === 'won') summary.safe++
          else summary.out++
        } else {
          status = my > their ? 'winning' : my < their ? 'losing' : 'tied'
          if (status === 'winning') summary.winning++
          else summary.losing++ // tied counts as danger — a tie eliminates
        }
        return { name: p.full_name, team, status }
      }
    )

    const hasLiveGames = espnGames.some((g) => g.state === 'in')

    return NextResponse.json(
      {
        weekNumber: week.week_number,
        seasonType: week.season_type ?? 'regular',
        season: week.season_year,
        hasLiveGames,
        allRevealed: deadlinePassed,
        games: espnGames,
        players: sweatPlayers,
        summary,
      } satisfies SweatResponse,
      {
        headers: {
          // Sandbox responses must never land in the shared CDN cache
          'Cache-Control': testMode
            ? 'private, no-store'
            : hasLiveGames
            ? 'public, max-age=30, stale-while-revalidate=10'
            : 'public, max-age=300, stale-while-revalidate=60',
        },
      }
    )
  } catch (err) {
    console.error('sweat error', err)
    return NextResponse.json(EMPTY, { status: 500 })
  }
}
