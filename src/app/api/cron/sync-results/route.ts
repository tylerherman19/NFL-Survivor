import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireCronOrAdmin } from '@/lib/api'
import { fetchEspnScoreboard, eventCompetitors } from '@/lib/espn'
import { gradeWeekPicks } from '@/lib/grading'
import type { Game } from '@/types'

// Vercel Cron — auto-syncs ESPN game results + grades picks, no admin needed.
// Runs daily at 6am UTC (midnight CST / 1am CDT) to catch TNF, Sunday, and MNF completions.
export async function GET(req: NextRequest) {
  const unauthorized = await requireCronOrAdmin(req)
  if (unauthorized) return unauthorized

  try {
    const supabase = await getDb()
    const { data: week } = await supabase
      .from('weeks')
      .select('id, week_number, season_year')
      .eq('is_active', true)
      .single()

    if (!week) return NextResponse.json({ ok: true, message: 'No active week' })

    // Null when ESPN is down or served a different season (its silent
    // fallback to last season must never grade this season's picks).
    const events = await fetchEspnScoreboard(week.season_year, week.week_number)
    if (events === null) {
      return NextResponse.json({ error: 'ESPN unavailable or wrong season' }, { status: 502 })
    }

    // Get our DB games for this week
    const { data: dbGames } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', week.id)

    if (!dbGames || dbGames.length === 0) {
      return NextResponse.json({ ok: true, message: 'No games in DB for active week — sync schedule first' })
    }

    const updatedGames: string[] = []

    // Match completed ESPN events to our DB games by team abbreviation
    for (const event of events) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      if (comp.status?.type?.state !== 'post' || !comp.status?.type?.completed) continue

      const teams = eventCompetitors(event)
      if (!teams) continue

      const homeAbbr = teams.home.team.abbreviation
      const awayAbbr = teams.away.team.abbreviation
      const homeScore = parseInt(teams.home.score ?? '0', 10)
      const awayScore = parseInt(teams.away.score ?? '0', 10)

      let result: Game['result']
      if (homeScore > awayScore) result = 'home_win'
      else if (awayScore > homeScore) result = 'away_win'
      else result = 'tie'

      const dbGame = dbGames.find(
        (g) => g.home_team === homeAbbr && g.away_team === awayAbbr
      )
      if (!dbGame || dbGame.result === result) continue

      await supabase.from('games').update({ result }).eq('id', dbGame.id)
      dbGame.result = result
      updatedGames.push(`${awayAbbr}@${homeAbbr}: ${result}`)
    }

    // Grade everything completed so far — gradeWeekPicks is idempotent, so
    // re-grading games finished on an earlier run is a no-op.
    const completedGames = (dbGames as Game[]).filter((g) => g.result !== 'pending')
    if (completedGames.length === 0) {
      return NextResponse.json({ ok: true, message: 'No completed games to grade', updated_results: [] })
    }

    const grading = await gradeWeekPicks(supabase, week.id, week.week_number, completedGames)

    return NextResponse.json({ ok: true, updated_results: updatedGames, grading })
  } catch (err) {
    console.error('sync-results error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
