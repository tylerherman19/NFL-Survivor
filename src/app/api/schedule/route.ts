import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireAdmin } from '@/lib/api'
import { fromZonedTime } from 'date-fns-tz'

const CHICAGO_TZ = 'America/Chicago'

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { week_number, season_year, games } = await req.json()
    if (!Number.isInteger(week_number) || !Number.isInteger(season_year) || !Array.isArray(games)) {
      return NextResponse.json({ error: 'Missing week_number, season_year, or games' }, { status: 400 })
    }

    const supabase = await getDb()

    // Find or create the week
    const { data: existingWeek } = await supabase
      .from('weeks')
      .select('id')
      .eq('week_number', week_number)
      .eq('season_year', season_year)
      .single()

    const { data: currentActive } = await supabase
      .from('weeks')
      .select('id')
      .eq('is_active', true)
      .maybeSingle()

    let weekId: string
    if (existingWeek) {
      weekId = existingWeek.id
    } else {
      // Only activate on creation if nothing else is active yet (first-time
      // setup). Otherwise the new week starts inactive — building next week's
      // slate in advance must not switch the active week out from under the
      // current one. Explicit switches go through /api/admin/set-active-week.
      const { data: newWeek, error } = await supabase
        .from('weeks')
        .insert({ week_number, season_year, is_active: !currentActive })
        .select('id')
        .single()

      if (error || !newWeek) {
        return NextResponse.json({ error: 'Failed to create week' }, { status: 500 })
      }
      weekId = newWeek.id
    }

    if (!currentActive || currentActive.id === weekId) {
      await supabase.from('weeks').update({ is_active: true }).eq('id', weekId)
    }

    // The form sends naive wall-clock strings ("2026-09-13T12:00:00") meaning
    // Central time — passing the string straight to fromZonedTime converts it
    // without depending on the server's own time zone.
    const rows = games.map((g: {
      home_team: string
      away_team: string
      game_day: string
      kickoff_central: string
      is_snf?: boolean
      is_mnf?: boolean
    }) => ({
      week_id: weekId,
      home_team: g.home_team,
      away_team: g.away_team,
      game_day: g.game_day,
      kickoff_central: fromZonedTime(g.kickoff_central, CHICAGO_TZ).toISOString(),
      is_snf: g.is_snf || false,
      is_mnf: g.is_mnf || false,
    }))

    if (rows.length > 0) {
      // Upsert on (week_id, home_team, away_team) so resubmitting the form
      // updates the existing matchup instead of duplicating it. `result` is
      // intentionally omitted: it takes the table default on insert, and is
      // left untouched on conflict so this can't clobber an already-graded score.
      const { error: insertError } = await supabase
        .from('games')
        .upsert(rows, { onConflict: 'week_id,home_team,away_team' })
      if (insertError) {
        return NextResponse.json({ error: `Failed to save games: ${insertError.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, week_id: weekId })
  } catch (err) {
    console.error('schedule error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = await getDb()
  const { error } = await supabase.from('games').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
