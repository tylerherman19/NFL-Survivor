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

    let weekId: string
    if (existingWeek) {
      weekId = existingWeek.id
    } else {
      const { data: newWeek, error } = await supabase
        .from('weeks')
        .insert({ week_number, season_year, is_active: false })
        .select('id')
        .single()

      if (error || !newWeek) {
        return NextResponse.json({ error: 'Failed to create week' }, { status: 500 })
      }
      weekId = newWeek.id
    }

    // Make this the only active week
    await supabase.from('weeks').update({ is_active: false }).neq('id', weekId)
    await supabase.from('weeks').update({ is_active: true }).eq('id', weekId)

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
      result: 'pending',
    }))

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('games').insert(rows)
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
