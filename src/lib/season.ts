import 'server-only'
import { getDb, getEffectiveNow } from './testMode'

// Whether the season's first game has kicked off yet — the cutoff for new
// signups. Compares against the earliest kickoff across every synced game,
// not just the active week, so this flips exactly once per season regardless
// of which week is currently active. Respects the sandbox's simulated clock
// in test mode, same as every other deadline check in the app.
export async function hasSeasonStarted(): Promise<boolean> {
  try {
    const supabase = await getDb()
    const { data } = await supabase
      .from('games')
      .select('kickoff_central')
      .order('kickoff_central', { ascending: true })
      .limit(1)
      .single()
    if (!data) return false

    const now = await getEffectiveNow()
    return now >= new Date(data.kickoff_central)
  } catch {
    // No schedule synced yet — signups stay open.
    return false
  }
}
