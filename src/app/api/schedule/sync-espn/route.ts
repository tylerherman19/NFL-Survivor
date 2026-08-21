import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireAdmin } from '@/lib/api'
import { syncWeekFromEspn } from '@/lib/espnSync'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { week_number, season_year } = await req.json()
    if (!week_number || !season_year) {
      return NextResponse.json({ error: 'Missing week_number or season_year' }, { status: 400 })
    }

    const supabase = await getDb()
    const result = await syncWeekFromEspn(supabase, week_number, season_year)

    if (!result.ok) {
      const status =
        result.error === 'ESPN unavailable, or it has no data for that season yet'
          ? 502
          : result.error?.startsWith('No games found')
            ? 404
            : 500
      return NextResponse.json({ error: result.error }, { status })
    }

    await logAudit(supabase, {
      event_type: 'schedule-synced',
      actor: 'admin',
      message: `Admin synced Week ${week_number} schedule from ESPN (${result.gamesSynced} games)`,
      details: { week_number, season_year, games_synced: result.gamesSynced },
    })

    return NextResponse.json({ ok: true, week_id: result.weekId, games_synced: result.gamesSynced })
  } catch (err) {
    console.error('sync-espn error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
