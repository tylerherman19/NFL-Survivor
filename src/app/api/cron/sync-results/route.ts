import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendEliminationEmail } from '@/lib/email'

// Vercel Cron — auto-syncs ESPN game results + grades picks, no admin needed.
// Runs daily at 4am UTC (10pm CT) to catch TNF, Sunday, and MNF completions.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: week } = await supabase
      .from('weeks')
      .select('id, week_number, season_year')
      .eq('is_active', true)
      .single()

    if (!week) return NextResponse.json({ ok: true, message: 'No active week' })

    // Fetch ESPN scoreboard for active week
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&season=${week.season_year}&week=${week.week_number}`
    const espnRes = await fetch(url)
    if (!espnRes.ok) return NextResponse.json({ error: 'ESPN unavailable' }, { status: 502 })

    const espnData = await espnRes.json()
    const events = espnData.events ?? []

    // Get our DB games for this week
    const { data: dbGames } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', week.id)

    if (!dbGames || dbGames.length === 0) {
      return NextResponse.json({ ok: true, message: 'No games in DB for active week — sync schedule first' })
    }

    const updatedGames: string[] = []
    const newlyCompleted: string[] = [] // game IDs that just went from pending -> result

    // Match ESPN events to our DB games by team abbreviation
    for (const event of events) {
      const comp = event.competitions?.[0]
      if (!comp) continue

      const state: string = comp.status?.type?.state ?? 'pre'
      const completed: boolean = comp.status?.type?.completed ?? false
      if (state !== 'post' || !completed) continue // skip in-progress / pre-game

      const espnHome = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'home')
      const espnAway = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'away')
      if (!espnHome || !espnAway) continue

      const homeAbbr: string = espnHome.team.abbreviation
      const awayAbbr: string = espnAway.team.abbreviation
      const homeScore = parseInt(espnHome.score ?? '0', 10)
      const awayScore = parseInt(espnAway.score ?? '0', 10)

      let result: 'home_win' | 'away_win' | 'tie'
      if (homeScore > awayScore) result = 'home_win'
      else if (awayScore > homeScore) result = 'away_win'
      else result = 'tie'

      // Find matching game in DB
      const dbGame = dbGames.find(
        (g) => g.home_team === homeAbbr && g.away_team === awayAbbr
      )
      if (!dbGame) continue

      // Only update if result changed (avoid redundant writes)
      if (dbGame.result !== result) {
        await supabase.from('games').update({ result }).eq('id', dbGame.id)
        updatedGames.push(`${awayAbbr}@${homeAbbr}: ${result}`)
        newlyCompleted.push(dbGame.id)
      } else if (dbGame.result !== 'pending') {
        // Already graded previously — still add to list for grading idempotency
        newlyCompleted.push(dbGame.id)
      }
    }

    if (newlyCompleted.length === 0) {
      return NextResponse.json({ ok: true, message: 'No newly completed games', updated: [] })
    }

    // --- Grade picks for all completed games ---

    // Fetch completed games to build winner/loser sets
    const { data: completedGames } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', week.id)
      .neq('result', 'pending')

    if (!completedGames || completedGames.length === 0) {
      return NextResponse.json({ ok: true, message: 'No completed games to grade' })
    }

    const winners = new Set<string>()
    const losers = new Set<string>()
    for (const g of completedGames) {
      if (g.result === 'home_win') { winners.add(g.home_team); losers.add(g.away_team) }
      else if (g.result === 'away_win') { winners.add(g.away_team); losers.add(g.home_team) }
      else if (g.result === 'tie') { losers.add(g.home_team); losers.add(g.away_team) }
    }

    // Get all picks for this week joined with player data
    const { data: picks } = await supabase
      .from('picks')
      .select('id, player_id, team, players(id, full_name, email, status)')
      .eq('week_id', week.id)

    const eliminated: string[] = []
    const advanced: string[] = []

    for (const pick of picks ?? []) {
      const player = pick.players as unknown as {
        id: string; full_name: string; email: string; status: string
      } | null
      if (!player || player.status !== 'alive') continue

      const pickedTeam: string = pick.team
      const gameForTeam = completedGames.find(
        (g) => g.home_team === pickedTeam || g.away_team === pickedTeam
      )
      if (!gameForTeam) continue // game not done yet — skip, will grade next run

      if (losers.has(pickedTeam)) {
        const reason = `Week ${week.week_number}: picked ${pickedTeam} — ${
          gameForTeam.result === 'tie' ? 'game ended in a tie' : 'lost'
        }`
        await supabase
          .from('players')
          .update({ status: 'eliminated', elimination_week: week.week_number, elimination_reason: reason })
          .eq('id', player.id)

        eliminated.push(player.full_name)
        if (player.email) {
          sendEliminationEmail(player.email, player.full_name, reason, week.week_number).catch(console.error)
        }
      } else if (winners.has(pickedTeam)) {
        advanced.push(player.full_name)
      }
    }

    return NextResponse.json({
      ok: true,
      updated_results: updatedGames,
      grading: { eliminated, advanced },
    })
  } catch (err) {
    console.error('sync-results error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
