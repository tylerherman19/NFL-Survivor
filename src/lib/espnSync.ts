import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchEspnScoreboard, eventCompetitors } from './espn'

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

export interface SyncResult {
  ok: boolean
  error?: string
  weekId?: string
  gamesSynced?: number
}

// Sync one week's schedule from ESPN into `supabase` (the caller passes
// getDb()'s result so this routes to prod or the test sandbox correctly).
// Only activates the week if nothing else is active yet — building or
// syncing a future week must not switch the active week out from under the
// current one. Explicit switches go through /api/admin/set-active-week.
export async function syncWeekFromEspn(
  supabase: SupabaseClient,
  weekNumber: number,
  seasonYear: number
): Promise<SyncResult> {
  const events = await fetchEspnScoreboard(seasonYear, weekNumber, 0)
  if (events === null) {
    return { ok: false, error: 'ESPN unavailable, or it has no data for that season yet' }
  }
  if (events.length === 0) {
    return { ok: false, error: `No games found for Week ${weekNumber} ${seasonYear}. Season may not be scheduled yet.` }
  }

  const { data: existingWeek } = await supabase
    .from('weeks')
    .select('id')
    .eq('week_number', weekNumber)
    .eq('season_year', seasonYear)
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
    const { data: newWeek, error } = await supabase
      .from('weeks')
      .insert({ week_number: weekNumber, season_year: seasonYear, is_active: !currentActive })
      .select('id')
      .single()
    if (error || !newWeek) {
      return { ok: false, error: 'Failed to create week' }
    }
    weekId = newWeek.id
  }

  if (!currentActive || currentActive.id === weekId) {
    await supabase.from('weeks').update({ is_active: true }).eq('id', weekId)
  }

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
    })
  }

  // Upsert on (week_id, home_team, away_team) — same pattern as the manual
  // schedule form. `result` is intentionally omitted: it takes the table
  // default ('pending') on insert and is left untouched on conflict, so
  // re-syncing an already-graded week can never wipe its results.
  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from('games')
      .upsert(rows, { onConflict: 'week_id,home_team,away_team' })
    if (insertError) {
      return { ok: false, error: `Failed to save games: ${insertError.message}` }
    }
  }

  // Remove games ESPN no longer lists for this week (e.g. a matchup that was
  // moved to another week) — scoped to this week_id only.
  const { data: existingGames } = await supabase
    .from('games')
    .select('id, home_team, away_team')
    .eq('week_id', weekId)
  const currentMatchups = new Set(rows.map((r) => `${r.home_team}|${r.away_team}`))
  const staleIds = (existingGames || [])
    .filter((g) => !currentMatchups.has(`${g.home_team}|${g.away_team}`))
    .map((g) => g.id)
  if (staleIds.length > 0) {
    await supabase.from('games').delete().in('id', staleIds)
  }

  return { ok: true, weekId, gamesSynced: rows.length }
}
