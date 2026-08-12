import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/testMode'
import { requireCronOrAdmin, isCronRequest } from '@/lib/api'
import { syncWeekFromEspn } from '@/lib/espnSync'
import { logAudit } from '@/lib/audit'
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

  // The cron fires at both 17:00 and 18:00 UTC, but exactly one of those is
  // noon Central depending on DST. Unlike auto-assign (whose deadline check
  // makes the extra run a no-op), advancing is not idempotent — without this
  // guard the second run would advance a second time and the pool would skip
  // a week. Only real cron traffic is gated: an admin hitting this route
  // (Testing panel / manual push) is deliberate and always allowed.
  if (isCronRequest(req)) {
    const centralHour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date()),
      10
    )
    if (centralHour !== 12) {
      return NextResponse.json({ ok: true, message: `Skipped: ${centralHour}:00 CT is the redundant DST-coverage run — only the noon CT run advances` })
    }
  }

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

    const label = `${seasonType === 'preseason' ? 'Preseason ' : ''}Week ${nextWeekNumber}`
    await logAudit(supabase, {
      event_type: 'week-advanced',
      actor: isCronRequest(req) ? 'system' : 'admin',
      message: `Pool advanced from Week ${week.week_number} to ${label} (${result.gamesSynced} games synced)`,
      details: { from_week: week.week_number, to_week: nextWeekNumber, season_type: seasonType, games_synced: result.gamesSynced },
    })

    revalidatePath('/')
    return NextResponse.json({
      ok: true,
      advanced_to: label,
      games_synced: result.gamesSynced,
    })
  } catch (err) {
    console.error('auto-advance error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
