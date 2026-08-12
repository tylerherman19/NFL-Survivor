import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireAdmin } from '@/lib/api'
import { syncWeekFromEspn } from '@/lib/espnSync'
import { logAudit } from '@/lib/audit'

// 18 regular-season weeks + up to 4 playoff weeks, synced serially — comfortably
// fits Vercel's default timeout, but a few seconds of headroom per week is cheap.
export const maxDuration = 120

const MIN_WEEK = 1
const MAX_WEEK = 22

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { season_year, start_week, end_week, season_type } = await req.json()
    if (!Number.isInteger(season_year)) {
      return NextResponse.json({ error: 'Missing season_year' }, { status: 400 })
    }
    if (season_type && season_type !== 'preseason' && season_type !== 'regular') {
      return NextResponse.json({ error: 'Invalid season_type' }, { status: 400 })
    }
    const startWeek = Number.isInteger(start_week) ? start_week : MIN_WEEK
    const endWeek = Number.isInteger(end_week) ? end_week : 18
    if (startWeek < MIN_WEEK || endWeek > MAX_WEEK || startWeek > endWeek) {
      return NextResponse.json({ error: 'Invalid week range' }, { status: 400 })
    }

    const supabase = await getDb()
    const synced: { week: number; games: number }[] = []
    const failures: { week: number; error?: string }[] = []

    for (let week = startWeek; week <= endWeek; week++) {
      const result = await syncWeekFromEspn(supabase, week, season_year, season_type || 'regular')
      if (result.ok) {
        synced.push({ week, games: result.gamesSynced ?? 0 })
        continue
      }
      // "No games found" just means the season hasn't reached that week yet —
      // stop the batch there instead of reporting it as a failure. Any other
      // error (ESPN down, DB error) is reported and the loop keeps going so
      // one bad week doesn't block the rest.
      if (result.error?.startsWith('No games found')) break
      failures.push({ week, error: result.error })
    }

    const totalGames = synced.reduce((sum, s) => sum + s.games, 0)
    await logAudit(supabase, {
      event_type: 'schedule-synced',
      actor: 'admin',
      message: `Admin bulk-synced ${synced.length} week${synced.length === 1 ? '' : 's'} from ESPN (${totalGames} games)${failures.length > 0 ? `, ${failures.length} failed` : ''}`,
      details: { season_year, weeks_synced: synced.map((s) => s.week), total_games: totalGames, failures },
    })

    return NextResponse.json({
      ok: failures.length === 0,
      weeks_synced: synced.map((s) => s.week),
      total_games: synced.reduce((sum, s) => sum + s.games, 0),
      failures: failures.length > 0 ? failures : undefined,
    })
  } catch (err) {
    console.error('sync-espn-all error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
