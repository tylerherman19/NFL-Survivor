import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireAdmin } from '@/lib/api'
import { gradeWeekPicks } from '@/lib/grading'
import { logAudit } from '@/lib/audit'
import type { Game } from '@/types'

// Grading awaits a paced elimination email per eliminated player.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { game_id, result } = await req.json()
    if (!game_id || !result) {
      return NextResponse.json({ error: 'Missing game_id or result' }, { status: 400 })
    }

    const VALID_RESULTS = ['home_win', 'away_win', 'tie', 'pending']
    if (!VALID_RESULTS.includes(result)) {
      return NextResponse.json({ error: 'Invalid result value' }, { status: 400 })
    }

    const supabase = await getDb()
    // Update the game result
    const { data: game, error } = await supabase
      .from('games')
      .update({ result })
      .eq('id', game_id)
      .select('*')
      .single()

    if (error || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    await logAudit(supabase, {
      event_type: 'result-set',
      actor: 'admin',
      message: `Admin set ${game.away_team}@${game.home_team} result to ${result}`,
      details: { game_id, home_team: game.home_team, away_team: game.away_team, result },
    })

    // Marking a game final should grade it immediately, not wait for the
    // nightly cron — mirrors what the sandbox's "Mark Final" already does.
    let grading = null
    if (result !== 'pending') {
      const { data: week } = await supabase
        .from('weeks')
        .select('week_number')
        .eq('id', game.week_id)
        .single()
      const { data: weekGames } = await supabase
        .from('games')
        .select('*')
        .eq('week_id', game.week_id)
      const completedGames = ((weekGames || []) as Game[]).filter((g) => g.result !== 'pending')
      if (week) {
        grading = await gradeWeekPicks(supabase, game.week_id, week.week_number, completedGames)
      }
    }

    return NextResponse.json({ ok: true, game, grading })
  } catch (err) {
    console.error('results error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
