import type { Week, Game, Pick, Player } from '@/types'
import { NFL_TEAM_NAMES } from '@/types'
import { formatCentralTime } from './deadline'

interface RecapInput {
  week: Week
  games: Game[]
  picks: (Pick & { player: Pick & { full_name: string } })[]
  players: Player[]
  potSize: number
  alivePlayers: Player[]
  eliminatedThisWeek: (Player & { elimination_reason: string | null })[]
  nextDeadline: string | null
}

export function generateRecap(input: RecapInput): string {
  const {
    week,
    games,
    players,
    alivePlayers,
    eliminatedThisWeek,
    potSize,
    nextDeadline,
  } = input

  const aliveCount = alivePlayers.length
  const totalPlayers = players.length
  const payoutPerSurvivor = aliveCount > 0 ? Math.floor(potSize / aliveCount) : 0

  const lines: string[] = []

  lines.push(`🏈 NFL SURVIVOR POOL — WEEK ${week.week_number} RECAP`)
  lines.push('─'.repeat(40))

  // Results
  const completedGames = games.filter(g => g.result !== 'pending')
  if (completedGames.length > 0) {
    lines.push('')
    lines.push('📊 RESULTS:')
    for (const game of completedGames) {
      const resultStr =
        game.result === 'home_win'
          ? `${game.home_team} wins`
          : game.result === 'away_win'
          ? `${game.away_team} wins`
          : 'TIE'
      lines.push(`  ${game.away_team} @ ${game.home_team} — ${resultStr}`)
    }
  }

  // Eliminations this week
  if (eliminatedThisWeek.length > 0) {
    lines.push('')
    lines.push('❌ ELIMINATED THIS WEEK:')
    for (const p of eliminatedThisWeek) {
      const reason = p.elimination_reason ? ` (${p.elimination_reason})` : ''
      lines.push(`  ${p.full_name}${reason}`)
    }
  }

  // Still alive
  lines.push('')
  lines.push(`✅ STILL ALIVE (${aliveCount}/${totalPlayers}):`)
  for (const p of alivePlayers) {
    lines.push(`  ${p.full_name}`)
  }

  // Pot info
  lines.push('')
  lines.push('💰 POT:')
  lines.push(`  Total: $${potSize}`)
  if (aliveCount > 1) {
    lines.push(
      `  If split now: $${payoutPerSurvivor} each (${aliveCount} survivors)`
    )
  } else if (aliveCount === 1) {
    lines.push(`  Winner takes all: $${potSize}`)
  }

  // Next deadline
  if (nextDeadline) {
    lines.push('')
    lines.push(`⏰ NEXT DEADLINE: ${formatCentralTime(nextDeadline)}`)
  }

  lines.push('')
  lines.push(
    `Full standings + pick history: ${process.env.NEXT_PUBLIC_APP_URL || 'nfl-survivor.vercel.app'}`
  )

  return lines.join('\n')
}
