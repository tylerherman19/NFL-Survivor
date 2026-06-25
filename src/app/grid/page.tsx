import { supabase } from '@/lib/supabase'
import { getWeekSundayDeadline } from '@/lib/deadline'
import type { Game } from '@/types'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function GridPage() {
  const [weeksRes, playersRes, picksRes, gamesRes, activeWeekRes] = await Promise.all([
    supabase.from('weeks').select('id, week_number, season_year').order('week_number'),
    supabase.from('players').select('id, full_name, status, elimination_week').not('email', 'like', '%@nflsurvivor.internal').order('full_name'),
    supabase.from('picks').select('player_id, week_id, team'),
    supabase.from('games').select('week_id, home_team, away_team, result'),
    supabase.from('weeks').select('id').eq('is_active', true).single(),
  ])

  const weeks = weeksRes.data ?? []
  const players = playersRes.data ?? []
  const allPicks = picksRes.data ?? []
  const allGames = gamesRes.data ?? []
  const activeWeekId: string | null = activeWeekRes.data?.id ?? null

  // Build game lookup: weekId -> Game[]
  const gamesByWeek: Record<string, Game[]> = {}
  for (const g of allGames) {
    if (!gamesByWeek[g.week_id]) gamesByWeek[g.week_id] = []
    gamesByWeek[g.week_id].push(g as Game)
  }

  // Check if active week picks are revealed (deadline passed)
  const activeWeekGames = activeWeekId ? (gamesByWeek[activeWeekId] ?? []) : []
  const activeDeadline = getWeekSundayDeadline(activeWeekGames)
  const activePicksRevealed = activeDeadline ? activeDeadline <= new Date() : false

  // Build pick map: playerId -> weekId -> team
  const pickMap: Record<string, Record<string, string>> = {}
  for (const pick of allPicks) {
    if (!pickMap[pick.player_id]) pickMap[pick.player_id] = {}
    pickMap[pick.player_id][pick.week_id] = pick.team
  }

  // Build result map: playerId -> weekId -> outcome
  type Outcome = 'won' | 'lost' | 'pending'
  const resultMap: Record<string, Record<string, Outcome>> = {}
  for (const pick of allPicks) {
    const games = gamesByWeek[pick.week_id] ?? []
    const game = games.find((g) => g.home_team === pick.team || g.away_team === pick.team)
    let outcome: Outcome = 'pending'
    if (game && game.result !== 'pending') {
      if (game.result === 'home_win') outcome = pick.team === game.home_team ? 'won' : 'lost'
      else if (game.result === 'away_win') outcome = pick.team === game.away_team ? 'won' : 'lost'
      else outcome = 'lost'
    }
    if (!resultMap[pick.player_id]) resultMap[pick.player_id] = {}
    resultMap[pick.player_id][pick.week_id] = outcome
  }

  // Sort players: alive first (by weeks survived desc, then name), then eliminated (by elimination_week desc, then name)
  const withStats = players.map((p) => ({
    ...p,
    weeksSurvived: Object.keys(pickMap[p.id] ?? {}).length,
  }))
  withStats.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'alive' ? -1 : 1
    if (a.status === 'alive') {
      if (b.weeksSurvived !== a.weeksSurvived) return b.weeksSurvived - a.weeksSurvived
      return a.full_name.localeCompare(b.full_name)
    }
    // both eliminated
    const aElim = a.elimination_week ?? 0
    const bElim = b.elimination_week ?? 0
    if (bElim !== aElim) return bElim - aElim
    return a.full_name.localeCompare(b.full_name)
  })

  return (
    <div style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <header style={{ background: 'var(--dark)' }}>
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-white text-lg tracking-wider">NFL SURVIVOR POOL</Link>
          <Link href="/" className="text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors">← Standings</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="font-display text-5xl mb-6" style={{ color: 'var(--dark)' }}>PICK GRID</p>

        {weeks.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No weeks scheduled yet.</p>
        ) : (
          <div className="overflow-x-auto" style={{ borderRadius: 4 }}>
            <table className="text-sm" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th
                    className="text-left py-2 pr-4"
                    style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', minWidth: 140, position: 'sticky', left: 0, background: 'var(--cream)', zIndex: 1 }}
                  >
                    Player
                  </th>
                  {weeks.map((w) => (
                    <th
                      key={w.id}
                      className="py-2 px-1 text-center"
                      style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', minWidth: 44 }}
                    >
                      Wk{w.week_number}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withStats.map((player) => (
                  <tr key={player.id} style={{ borderBottom: '1px solid var(--border)', opacity: player.status === 'eliminated' ? 0.7 : 1 }}>
                    <td
                      className="py-2 pr-4"
                      style={{ position: 'sticky', left: 0, background: 'var(--cream)', zIndex: 1 }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: player.status === 'alive' ? 'var(--green)' : 'var(--red)' }}
                        />
                        <span className="font-medium" style={{ color: 'var(--dark)', whiteSpace: 'nowrap' }}>{player.full_name}</span>
                      </div>
                    </td>
                    {weeks.map((w) => {
                      const team = pickMap[player.id]?.[w.id]
                      const isActiveWeek = w.id === activeWeekId
                      const hidden = isActiveWeek && !activePicksRevealed

                      if (!team) {
                        return (
                          <td key={w.id} className="py-2 px-1 text-center" style={{ fontSize: 11, color: 'var(--muted)' }}>
                            —
                          </td>
                        )
                      }

                      if (hidden) {
                        return (
                          <td key={w.id} className="py-2 px-1 text-center" style={{ fontSize: 11, color: 'var(--muted)' }}>
                            ?
                          </td>
                        )
                      }

                      const outcome = resultMap[player.id]?.[w.id] ?? 'pending'
                      const cellStyle =
                        outcome === 'won'
                          ? { background: 'rgba(30,82,24,0.15)', color: 'var(--green)' }
                          : outcome === 'lost'
                          ? { background: 'rgba(180,30,30,0.15)', color: 'var(--red)' }
                          : { background: 'rgba(100,100,100,0.1)', color: 'var(--muted)' }

                      return (
                        <td
                          key={w.id}
                          className="py-2 px-1 text-center font-mono font-bold"
                          style={{ fontSize: 11, borderRadius: 2, ...cellStyle }}
                        >
                          {team}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
