import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getDb, getEffectiveNow } from '@/lib/testMode'
import { requireCronOrAdmin, isCronRequest } from '@/lib/api'
import { syncWeekFromEspn } from '@/lib/espnSync'
import { logAudit } from '@/lib/audit'
import type { Game } from '@/types'

const LAST_REGULAR_SEASON_WEEK = 18

// Vercel Cron (vercel.json) — fires Tuesday noon Central (17:00/18:00 UTC).
// That timing alone assumes the active week's games already happened, which
// only holds if the active week was set close to its own kickoff. The admin
// can (and does, ahead of the season) sync a week active days or weeks
// before it's actually played, so this also checks that the active week's
// last kickoff has actually passed before advancing.
//
// Week N -> N+1 auto-advances all the way through Week 18; past that
// (playoffs) it stops and requires a manual push.
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
      .select('id, week_number, season_year')
      .eq('is_active', true)
      .single()

    if (!week) return NextResponse.json({ ok: true, message: 'No active week' })

    if (week.week_number >= LAST_REGULAR_SEASON_WEEK) {
      return NextResponse.json({ ok: true, message: `Already at Week ${week.week_number} — post-Week ${LAST_REGULAR_SEASON_WEEK} advancement is manual` })
    }

    const { data: currentGames } = await supabase.from('games').select('kickoff_central').eq('week_id', week.id)
    const lastKickoff = ((currentGames || []) as Pick<Game, 'kickoff_central'>[])
      .map((g) => new Date(g.kickoff_central).getTime())
      .sort((a, b) => b - a)[0]
    const now = await getEffectiveNow()
    if (lastKickoff && now.getTime() < lastKickoff) {
      return NextResponse.json({ ok: true, message: `Week ${week.week_number}'s games haven't all kicked off yet — nothing to advance` })
    }

    const nextWeekNumber = week.week_number + 1

    const result = await syncWeekFromEspn(supabase, nextWeekNumber, week.season_year)
    if (!result.ok || !result.weekId) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
    }

    await supabase.from('weeks').update({ is_active: false }).gt('week_number', 0)
    const { error: activateErr } = await supabase.from('weeks').update({ is_active: true }).eq('id', result.weekId)
    if (activateErr) return NextResponse.json({ ok: false, error: activateErr.message }, { status: 500 })

    const label = `Week ${nextWeekNumber}`
    await logAudit(supabase, {
      event_type: 'week-advanced',
      actor: isCronRequest(req) ? 'system' : 'admin',
      message: `Pool advanced from Week ${week.week_number} to ${label} (${result.gamesSynced} games synced)`,
      details: { from_week: week.week_number, to_week: nextWeekNumber, games_synced: result.gamesSynced },
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
