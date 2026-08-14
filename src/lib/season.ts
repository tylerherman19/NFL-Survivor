import 'server-only'
import { getDb, getEffectiveNow } from './testMode'
import { getWeekSundayDeadline } from './deadline'
import type { Game, SeasonType } from '@/types'

export interface SignupCutoff {
  cutoff: Date
  seasonType: SeasonType
  seasonYear: number
  weekNumber: number
}

// The instant new signups close: the Sunday 12:00 PM CT pick deadline of the
// pool's *first week*, for whichever season is currently being played. Null
// means there is nothing to anchor to yet (no active week, or no games synced
// for week 1), in which case signups stay open.
//
// Week 1 opens Thursday night, but a player who joins Friday or Saturday can
// still make a legitimate Week 1 pick off the Sunday slate, since
// getPickDeadline already locks each Wed/Thu/Fri/Sat game at its own kickoff.
// Thursday's game is simply off the table for them, exactly as it is for
// anyone who hadn't picked it.
//
// "First week" is scoped per season — by season_type *and* season_year — and
// read off the active week. A preseason trial and the real regular season are
// separate pools with separate cutoffs: during a preseason trial the cutoff is
// Preseason Week 1's Sunday noon, and the manual preseason -> regular handoff
// moves it to regular-season Week 1's Sunday noon. Deriving it from the
// earliest kickoff across the whole games table instead would let any extra
// synced week — a future week synced early, a leftover trial week, last
// season's leftovers — silently drag the cutoff somewhere it doesn't belong.
export async function getSignupCutoff(): Promise<SignupCutoff | null> {
  try {
    const supabase = await getDb()

    // select('*') rather than naming season_type: sandbox.weeks predates that
    // column (migration 011 only altered public.weeks), and PostgREST errors on
    // a select/filter naming a column the table doesn't have. Reading it off
    // the row and defaulting keeps this working against either schema.
    const { data: activeWeek } = await supabase
      .from('weeks')
      .select('*')
      .eq('is_active', true)
      .maybeSingle()

    // Nothing active yet — the pool hasn't started, so signups stay open.
    if (!activeWeek) return null

    const seasonType: SeasonType = activeWeek.season_type ?? 'regular'
    const seasonYear: number = activeWeek.season_year

    const { data: weeks } = await supabase.from('weeks').select('*')
    if (!weeks?.length) return null

    // Week 1 of the season currently being played. Filtered in JS for the same
    // sandbox-compatibility reason as above.
    const firstWeek = weeks
      .filter(
        (w: { season_type?: SeasonType; season_year: number }) =>
          (w.season_type ?? 'regular') === seasonType && w.season_year === seasonYear
      )
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

    return { cutoff, seasonType, seasonYear, weekNumber: firstWeek.week_number }
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
