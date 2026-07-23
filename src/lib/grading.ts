import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Game } from '@/types'
import { sendEliminationEmail } from './email'

export interface GradeResult {
  eliminated: string[]
  advanced: string[]
}

// Grade every pick for a week against its completed games: a loss or a tie
// eliminates, a win advances, an unfinished game is skipped. Idempotent —
// already-eliminated players are ignored, so re-running after each new final
// (or after a manual result correction) is safe. Shared by the admin
// grade-week endpoint and the sync-results cron.
export async function gradeWeekPicks(
  db: SupabaseClient,
  weekId: string,
  weekNumber: number,
  completedGames: Game[]
): Promise<GradeResult> {
  const winners = new Set<string>()
  const losers = new Set<string>() // includes both teams of a tie

  for (const g of completedGames) {
    if (g.result === 'home_win') {
      winners.add(g.home_team)
      losers.add(g.away_team)
    } else if (g.result === 'away_win') {
      winners.add(g.away_team)
      losers.add(g.home_team)
    } else if (g.result === 'tie') {
      losers.add(g.home_team)
      losers.add(g.away_team)
    }
  }

  const { data: picks } = await db
    .from('picks')
    .select('id, player_id, team, players(id, full_name, email, status)')
    .eq('week_id', weekId)

  const eliminated: string[] = []
  const advanced: string[] = []

  for (const pick of picks ?? []) {
    const player = pick.players as unknown as {
      id: string
      full_name: string
      email: string
      status: string
    } | null
    if (!player || player.status !== 'alive') continue

    const game = completedGames.find(
      (g) => g.home_team === pick.team || g.away_team === pick.team
    )
    if (!game) continue // game not final yet — graded on a later run

    if (losers.has(pick.team)) {
      const reason = `Week ${weekNumber}: picked ${pick.team} — ${
        game.result === 'tie' ? 'game ended in a tie' : 'lost'
      }`
      await db
        .from('players')
        .update({ status: 'eliminated', elimination_week: weekNumber, elimination_reason: reason })
        .eq('id', player.id)

      eliminated.push(player.full_name)
      if (player.email) {
        sendEliminationEmail(player.email, player.full_name, reason, weekNumber).catch(console.error)
      }
    } else if (winners.has(pick.team)) {
      advanced.push(player.full_name)
    }
  }

  return { eliminated, advanced }
}
