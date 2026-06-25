import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAdminSession } from '@/lib/session'

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
  const isAdmin = await getAdminSession()
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { week_number, season_year } = await req.json()
    if (!week_number || !season_year) {
      return NextResponse.json({ error: 'Missing week_number or season_year' }, { status: 400 })
    }

    // Fetch from ESPN
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&season=${season_year}&week=${week_number}`
    const espnRes = await fetch(url)
    if (!espnRes.ok) {
      return NextResponse.json({ error: 'ESPN API unavailable' }, { status: 502 })
    }
    const espnData = await espnRes.json()
    const events = espnData.events ?? []

    if (events.length === 0) {
      return NextResponse.json({ error: `No games found for Week ${week_number} ${season_year}. Season may not be scheduled yet.` }, { status: 404 })
    }

    // Create/activate week in DB
    await supabase.from('weeks').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000')

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

    // Insert games from ESPN
    let count = 0
    for (const event of events) {
      const comp = event.competitions?.[0]
      if (!comp) continue

      const home = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'home')
      const away = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'away')
      if (!home || !away) continue

      const kickoffUtc = event.date // already UTC
      const { day, hour } = getCentralInfo(kickoffUtc)

      // SNF: Sunday night (NBC, typically 8:20pm ET = 7:20pm CT)
      // MNF: Monday night (ESPN/ABC, typically 8:15pm ET = 7:15pm CT)
      const broadcasts: string[] = (comp.broadcasts ?? []).flatMap((b: { names?: string[] }) => b.names ?? [])
      const isSnf = day === 'sunday' && (broadcasts.includes('NBC') || hour >= 19)
      const isMnf = day === 'monday' && (broadcasts.includes('ABC') || broadcasts.includes('ESPN') || hour >= 19)

      await supabase.from('games').insert({
        week_id: weekId,
        home_team: home.team.abbreviation,
        away_team: away.team.abbreviation,
        game_day: day,
        kickoff_central: kickoffUtc,
        is_snf: isSnf,
        is_mnf: isMnf,
        result: 'pending',
      })
      count++
    }

    return NextResponse.json({ ok: true, week_id: weekId, games_synced: count })
  } catch (err) {
    console.error('sync-espn error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
