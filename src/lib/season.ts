import 'server-only'
import { getDb, getEffectiveNow } from './testMode'
import { getWeekSundayDeadline } from './deadline'
import type { Game } from '@/types'

export interface SignupCutoff {
  cutoff: Date
  seasonYear: number
  weekNumber: number
}

// The instant new signups close: the Sunday 12:00 PM CT pick deadline of the
// season's Week 1. Null means there is nothing to anchor to yet (no active
// week, or no games synced for week 1), in which case signups stay open.
//
// Week 1 opens Thursday night, but a player who joins Friday or Saturday can
// still make a legitimate Week 1 pick off the Sunday slate, since
// getPickDeadline already locks each Wed/Thu/Fri/Sat game at its own kickoff.
// Thursday's game is simply off the table for them, exactly as it is for
// anyone who hadn't picked it.
//
// "First week" is scoped by season_year and read off the active week.
// Deriving it from the earliest kickoff across the whole games table instead
// would let any extra synced week — a future week synced early, last season's
// leftovers — silently drag the cutoff somewhere it doesn't belong.
export async function getSignupCutoff(): Promise<SignupCutoff | null> {
  try {
    const supabase = await getDb()

    const { data: activeWeek } = await supabase
      .from('weeks')
      .select('*')
      .eq('is_active', true)
      .maybeSingle()

    // Nothing active yet — the pool hasn't started, so signups stay open.
    if (!activeWeek) return null

    const seasonYear: number = activeWeek.season_year

    const { data: weeks } = await supabase.from('weeks').select('*').eq('season_year', seasonYear)
    if (!weeks?.length) return null

    // Week 1 of the season currently being played.
    const firstWeek = weeks
      .slice()
      .sort((a: { week_number: number }, b: { week_number: number }) => a.week_number - b.week_number)[0]
    if (!firstWeek) return null

    // That week's earliest kickoff anchors it to the right calendar week;
    // getWeekSundayDeadline turns it into the shared Sunday-noon cutoff.
    const { data: games } = await supabase
      .from('games')
      .select('kickoff_central')
      .eq('week_id', firstWeek.id)
      .order('kickoff_central', { ascending: true })
      .limit(1)

    const cutoff = getWeekSundayDeadline((games ?? []) as Game[])
    if (!cutoff) return null

    return { cutoff, seasonYear, weekNumber: firstWeek.week_number }
  } catch {
    // No schedule synced yet — signups stay open.
    return null
  }
}

// Whether new signups are closed. Respects the sandbox's simulated clock in
// test mode, same as every other deadline check in the app.
export async function haveSignupsClosed(): Promise<boolean> {
  const anchor = await getSignupCutoff()
  if (!anchor) return false

  const now = await getEffectiveNow()
  return now >= anchor.cutoff
}
