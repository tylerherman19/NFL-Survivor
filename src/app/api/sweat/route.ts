import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getWeekSundayDeadline } from '@/lib/deadline'
import type { Game } from '@/types'

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
  season: null,
  hasLiveGames: false,
  allRevealed: false,
  games: [],
  players: [],
  summary: { safe: 0, winning: 0, losing: 0, out: 0, notStarted: 0, hidden: 0, pending: 0, noPick: 0 },
}

export async function GET() {
  try {
    const { data: week } = await supabase
      .from('weeks')
      .select('id, week_number, season_year')
      .eq('is_active', true)
      .single()

    if (!week) {
      return NextResponse.json(EMPTY, { headers: { 'Cache-Control': 'public, max-age=300' } })
    }

    const [playersRes, picksRes, dbGamesRes, espnRes] = await Promise.all([
      supabase
        .from('players')
        .select('id, full_name, email, status, elimination_week')
        .order('full_name'),
      supabase.from('picks').select('player_id, team').eq('week_id', week.id),
      supabase.from('games').select('*').eq('week_id', week.id),
      fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&dates=${week.season_year}&week=${week.week_number}`,
        { next: { revalidate: 30 } }
      ),
    ])

    // Alive players sweat; players eliminated this week stay on the board as OUT.
    const players = (playersRes.data ?? []).filter(
      (p: { email: string; status: string; elimination_week: number | null }) =>
        !p.email?.endsWith('@nflsurvivor.internal') &&
        (p.status === 'alive' || p.elimination_week === week.week_number)
    )
    const pickByPlayer: Record<string, string> = {}
    for (const p of picksRes.data ?? []) pickByPlayer[p.player_id] = p.team

    const dbGames = (dbGamesRes.data ?? []) as Game[]
    const sundayDeadline = getWeekSundayDeadline(dbGames)
    const deadlinePassed = sundayDeadline ? sundayDeadline <= new Date() : false

    // ESPN falls back to the previous season when the requested one has no
    // data yet — validate before trusting any game data.
    let espnGames: SweatGame[] = []
    if (espnRes.ok) {
      const espnData = await espnRes.json()
      const espnSeasonYear: number | null = espnData.season?.year ?? null
      if (espnSeasonYear === null || espnSeasonYear === week.season_year) {
        const events: ESPNEvent[] = espnData.events || []
        espnGames = events.map((event) => {
          const comp = event.competitions[0]
          const home = comp.competitors.find((c) => c.homeAway === 'home')!
          const away = comp.competitors.find((c) => c.homeAway === 'away')!
          return {
            id: event.id,
            homeTeam: home.team.abbreviation,
            awayTeam: away.team.abbreviation,
            homeScore: parseInt(home.score) || 0,
            awayScore: parseInt(away.score) || 0,
            state: comp.status.type.state as 'pre' | 'in' | 'post',
            statusText: comp.status.type.shortDetail,
            kickoff: event.date,
            homePlayers: [],
            awayPlayers: [],
          }
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
        // A pick is revealed once its game has kicked off (the team is locked
        // for everyone at that point) or once the Sunday deadline passes.
        const revealed = deadlinePassed || (game !== undefined && game.state !== 'pre')
        if (!revealed) {
          summary.hidden++
          return { name: p.full_name, team: null, status: 'pick_in' as const }
        }

        if (!game || game.state === 'pre') {
          summary.notStarted++
          return { name: p.full_name, team, status: 'pre' as const }
        }

        const isHome = game.homeTeam === team
        if (isHome) game.homePlayers.push(p.full_name)
        else game.awayPlayers.push(p.full_name)

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
        season: week.season_year,
        hasLiveGames,
        allRevealed: deadlinePassed,
        games: espnGames,
        players: sweatPlayers,
        summary,
      } satisfies SweatResponse,
      {
        headers: {
          'Cache-Control': hasLiveGames
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
