import 'server-only'
import { getDb, getEffectiveNow } from './testMode'
import { getWeekSundayDeadline } from './deadline'
import type { Game } from '@/types'

// Whether new signups are closed. The cutoff is Week 1's Sunday 12:00 PM CT
// pick deadline — not the season's first kickoff. Week 1 opens Thursday night,
// but a player who joins Friday or Saturday can still make a legitimate Week 1
// pick off the Sunday slate, so the door stays open until the same Sunday-noon
// cutoff that locks everyone else's pick. (Thursday's game is off the table for
// them, exactly as it is for anyone who hadn't picked it — getPickDeadline
// already locks each Wed/Thu/Fri/Sat game at its own kickoff.)
//
// Derived from the earliest kickoff across every synced game, so it flips
// exactly once per season regardless of which week is currently active.
// Respects the sandbox's simulated clock in test mode, same as every other
// deadline check in the app.
export async function haveSignupsClosed(): Promise<boolean> {
  try {
    const supabase = await getDb()
    const { data } = await supabase
      .from('games')
      .select('kickoff_central')
      .order('kickoff_central', { ascending: true })
      .limit(1)
      .single()
    if (!data) return false

    // The season's earliest game is a Week 1 game, so that game's week-level
    // Sunday-noon deadline is the season's signup cutoff.
    const cutoff = getWeekSundayDeadline([data as Game])
    if (!cutoff) return false

    const now = await getEffectiveNow()
    return now >= cutoff
  } catch {
    // No schedule synced yet — signups stay open.
    return false
  }
}
