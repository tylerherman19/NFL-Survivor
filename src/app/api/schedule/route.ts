import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAdminSession } from '@/lib/session'
import { fromZonedTime } from 'date-fns-tz'

const CHICAGO_TZ = 'America/Chicago'

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession()
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { week_number, season_year, games } = await req.json()

    // Upsert the week — create it if it doesn't exist, set it as active
    let weekId: string

    const { data: existingWeek } = await supabase
      .from('weeks')
      .select('id')
      .eq('week_number', week_number)
      .eq('season_year', season_year)
      .single()

    if (existingWeek) {
      weekId = existingWeek.id
    } else {
      // Deactivate all other weeks first
      await supabase.from('weeks').update({ is_active: false }).gt('week_number', 0)

      const { data: newWeek, error } = await supabase
        .from('weeks')
        .insert({ week_number, season_year, is_active: true })
        .select('id')
        .single()

      if (error || !newWeek) {
        return NextResponse.json({ error: 'Failed to create week' }, { status: 500 })
      }
      weekId = newWeek.id
    }

    // Activate this week
    await supabase.from('weeks').update({ is_active: false }).neq('id', weekId)
    await supabase.from('weeks').update({ is_active: true }).eq('id', weekId)

    // Insert games
    for (const g of games) {
      // Convert Central time to UTC for storage
      const kickoffUtc = fromZonedTime(new Date(g.kickoff_central), CHICAGO_TZ)

      await supabase.from('games').insert({
        week_id: weekId,
        home_team: g.home_team,
        away_team: g.away_team,
        game_day: g.game_day,
        kickoff_central: kickoffUtc.toISOString(),
        is_snf: g.is_snf || false,
        is_mnf: g.is_mnf || false,
        result: 'pending',
      })
    }

    return NextResponse.json({ ok: true, week_id: weekId })
  } catch (err) {
    console.error('schedule error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const isAdmin = await getAdminSession()
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await supabase.from('games').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
