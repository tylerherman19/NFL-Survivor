import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireAdmin } from '@/lib/api'
import { fetchEspnScoreboard, eventCompetitors } from '@/lib/espn'

type GameDay = 'thursday' | 'friday' | 'saturday' | 'sunday' | 'monday' | 'tuesday'

const DAY_MAP: Record<string, GameDay> = {
  Thursday: 'thursday',
  Friday: 'friday',
  Saturday: 'saturday',
  Sunday: 'sunday',
  Monday: 'monday',
  Tuesday: 'tuesday',
  Wednesday: 'thursday', // edge case: rare Wednesday games treated as thursday slot
}

function getCentralInfo(utcStr: string): { day: GameDay; hour: number } {
  const d = new Date(utcStr)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(d)
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sunday'
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '12', 10)
  return { day: DAY_MAP[weekday] ?? 'sunday', hour }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { week_number, season_year } = await req.json()
    if (!week_number || !season_year) {
      return NextResponse.json({ error: 'Missing week_number or season_year' }, { status: 400 })
    }

    // Null when ESPN is down or fell back to a different season — importing
    // that would silently build the schedule from last year's games.
    const events = await fetchEspnScoreboard(season_year, week_number)
    if (events === null) {
      return NextResponse.json({ error: 'ESPN unavailable, or it has no data for that season yet' }, { status: 502 })
    }

    if (events.length === 0) {
      return NextResponse.json({ error: `No games found for Week ${week_number} ${season_year}. Season may not be scheduled yet.` }, { status: 404 })
    }

    // Create/activate week in DB
    const supabase = await getDb()
    await supabase.from('weeks').update({ is_active: false }).gt('week_number', 0)

    const { data: existingWeek } = await supabase
      .from('weeks')
      .select('id')
      .eq('week_number', week_number)
      .eq('season_year', season_year)
      .single()

    let weekId: string
    if (existingWeek) {
      weekId = existingWeek.id
      await supabase.from('weeks').update({ is_active: true }).eq('id', weekId)
    } else {
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

    // Delete existing games for this week (clean slate)
    await supabase.from('games').delete().eq('week_id', weekId)

    // Build games from ESPN
    const rows = []
    for (const event of events) {
      const teams = eventCompetitors(event)
      if (!teams) continue

      const kickoffUtc = event.date // already UTC
      const { day, hour } = getCentralInfo(kickoffUtc)

      // SNF: Sunday night (NBC, typically 8:20pm ET = 7:20pm CT)
      // MNF: Monday night (ESPN/ABC, typically 8:15pm ET = 7:15pm CT)
      const broadcasts: string[] = (event.competitions[0].broadcasts ?? []).flatMap(
        (b: { names?: string[] }) => b.names ?? []
      )
      const isSnf = day === 'sunday' && (broadcasts.includes('NBC') || hour >= 19)
      const isMnf = day === 'monday' && (broadcasts.includes('ABC') || broadcasts.includes('ESPN') || hour >= 19)

      rows.push({
        week_id: weekId,
        home_team: teams.home.team.abbreviation,
        away_team: teams.away.team.abbreviation,
        game_day: day,
        kickoff_central: kickoffUtc,
        is_snf: isSnf,
        is_mnf: isMnf,
        result: 'pending',
      })
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('games').insert(rows)
      if (insertError) {
        return NextResponse.json({ error: `Failed to save games: ${insertError.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, week_id: weekId, games_synced: rows.length })
  } catch (err) {
    console.error('sync-espn error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
