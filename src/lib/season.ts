import 'server-only'
import { getDb, getEffectiveNow } from './testMode'
import { getWeekSundayDeadline } from './deadline'
import type { Game, SeasonType } from '@/types'

// Whether new signups are closed. The cutoff is the Sunday 12:00 PM CT pick
// deadline of the pool's *first week* — not the season's first kickoff. Week 1
// opens Thursday night, but a player who joins Friday or Saturday can still
// make a legitimate Week 1 pick off the Sunday slate, since getPickDeadline
// already locks each Wed/Thu/Fri/Sat game at its own kickoff. Thursday's game
// is simply off the table for them, exactly as it is for anyone who hadn't
// picked it.
//
// "First week" is scoped to the season the pool is actually running, read off
// the active week. A preseason trial and the real regular season are separate
// pools with separate cutoffs: during a preseason trial the cutoff is Preseason
// Week 1's Sunday noon, and the manual preseason -> regular handoff moves it to
// regular-season Week 1's Sunday noon. Deriving it from the earliest kickoff
// across the whole games table instead would let any extra synced week — a
// future week synced early, a leftover trial week — silently drag the cutoff
// somewhere it doesn't belong.
//
// Respects the sandbox's simulated clock in test mode, same as every other
// deadline check in the app.
export async function haveSignupsClosed(): Promise<boolean> {
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
    if (!activeWeek) return false

    const seasonType: SeasonType = activeWeek.season_type ?? 'regular'

    const { data: weeks } = await supabase.from('weeks').select('*')
    if (!weeks?.length) return false

    // Week 1 of the season currently being played. Filtered in JS for the same
    // sandbox-compatibility reason as above.
    const firstWeek = weeks
      .filter(
        (w: { season_type?: SeasonType; season_year: number }) =>
          (w.season_type ?? 'regular') === seasonType && w.season_year === activeWeek.season_year
      )
      .sort((a: { week_number: number }, b: { week_number: number }) => a.week_number - b.week_number)[0]
    if (!firstWeek) return false

    // That week's earliest kickoff anchors it to the right calendar week;
    // getWeekSundayDeadline turns it into the shared Sunday-noon cutoff.
    const { data: games } = await supabase
      .from('games')
      .select('kickoff_central')
      .eq('week_id', firstWeek.id)
      .order('kickoff_central', { ascending: true })
      .limit(1)

    const cutoff = getWeekSundayDeadline((games ?? []) as Game[])
    if (!cutoff) return false

    const now = await getEffectiveNow()
    return now >= cutoff
  } catch {
    // No schedule synced yet — signups stay open.
    return false
  }
}
