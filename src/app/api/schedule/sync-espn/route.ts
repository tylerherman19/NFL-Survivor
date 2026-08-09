import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireAdmin } from '@/lib/api'
import { syncWeekFromEspn } from '@/lib/espnSync'

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { week_number, season_year, season_type } = await req.json()
    if (!week_number || !season_year) {
      return NextResponse.json({ error: 'Missing week_number or season_year' }, { status: 400 })
    }
    if (season_type && season_type !== 'preseason' && season_type !== 'regular') {
      return NextResponse.json({ error: 'Invalid season_type' }, { status: 400 })
    }

    const supabase = await getDb()
    const result = await syncWeekFromEspn(supabase, week_number, season_year, season_type || 'regular')

    if (!result.ok) {
      const status =
        result.error === 'ESPN unavailable, or it has no data for that season yet'
          ? 502
          : result.error?.startsWith('No games found')
            ? 404
            : 500
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({ ok: true, week_id: result.weekId, games_synced: result.gamesSynced })
  } catch (err) {
    console.error('sync-espn error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
