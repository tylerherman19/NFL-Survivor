import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/testMode'
import { requireCronOrAdmin } from '@/lib/api'
import { syncWeekFromEspn } from '@/lib/espnSync'
import type { SeasonType } from '@/lib/espn'

const LAST_REGULAR_SEASON_WEEK = 18

// Vercel Cron (vercel.json) — fires Tuesday noon Central (17:00/18:00 UTC,
// covering both DST states like the auto-assign cron does), well after every
// week's games (including MNF) have finished.
//
// Preseason Week 1 -> Week 2 auto-advances. Preseason Week 2 -> regular
// season Week 1 does NOT — that handoff stays a manual admin action by
// design, so this only acts when the active preseason week is exactly 1.
// Regular season Week N -> N+1 auto-advances all the way through Week 18;
// past that (playoffs) it stops and requires a manual push.
export async function GET(req: NextRequest) {
  const unauthorized = await requireCronOrAdmin(req)
  if (unauthorized) return unauthorized

  try {
    const supabase = await getDb()
    const { data: week } = await supabase
      .from('weeks')
      .select('id, week_number, season_year, season_type')
      .eq('is_active', true)
      .single()

    if (!week) return NextResponse.json({ ok: true, message: 'No active week' })

    const seasonType: SeasonType = week.season_type ?? 'regular'
    let nextWeekNumber: number

    if (seasonType === 'preseason') {
      if (week.week_number !== 1) {
        return NextResponse.json({ ok: true, message: 'Preseason Week 2 -> regular season handoff is manual — nothing to do' })
      }
      nextWeekNumber = 2
    } else {
      if (week.week_number >= LAST_REGULAR_SEASON_WEEK) {
        return NextResponse.json({ ok: true, message: `Already at Week ${week.week_number} — post-Week ${LAST_REGULAR_SEASON_WEEK} advancement is manual` })
      }
      nextWeekNumber = week.week_number + 1
    }

    const result = await syncWeekFromEspn(supabase, nextWeekNumber, week.season_year, seasonType)
    if (!result.ok || !result.weekId) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
    }

    await supabase.from('weeks').update({ is_active: false }).gt('week_number', 0)
    const { error: activateErr } = await supabase.from('weeks').update({ is_active: true }).eq('id', result.weekId)
    if (activateErr) return NextResponse.json({ ok: false, error: activateErr.message }, { status: 500 })

    revalidatePath('/')
    return NextResponse.json({
      ok: true,
      advanced_to: `${seasonType === 'preseason' ? 'Preseason ' : ''}Week ${nextWeekNumber}`,
      games_synced: result.gamesSynced,
    })
  } catch (err) {
    console.error('auto-advance error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
