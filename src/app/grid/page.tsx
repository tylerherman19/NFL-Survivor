import { getDb } from '@/lib/testMode'
import { getWeekSundayDeadline } from '@/lib/deadline'
import type { Game } from '@/types'
import Link from 'next/link'

// Cache the render for 60s (like the homepage) so 1k concurrent viewers are
// served from the CDN instead of each triggering the full query set. Current-week
// picks stay hidden behind the reveal deadline regardless of cache freshness.
export const revalidate = 60

export default async function GridPage() {
  // Guard the fetch so a DB outage (or a build without env) degrades to the
  // empty state instead of failing the render / prerender.
  let weeks: { id: string; week_number: number; season_year: number }[] = []
  let players: { id: string; full_name: string; status: string; elimination_week: number | null }[] = []
  let allPicks: { player_id: string; week_id: string; team: string }[] = []
  let allGames: { week_id: string; home_team: string; away_team: string; result: string }[] = []
  let activeWeekId: string | null = null
  try {
    const supabase = await getDb()
    const [weeksRes, playersRes, picksRes, gamesRes, activeWeekRes] = await Promise.all([
      supabase.from('weeks').select('id, week_number, season_year').order('week_number'),
      supabase.from('players').select('id, full_name, status, elimination_week').not('email', 'like', '%@nflsurvivor.internal').order('full_name'),
      supabase.from('picks').select('player_id, week_id, team'),
      supabase.from('games').select('week_id, home_team, away_team, result'),
      supabase.from('weeks').select('id').eq('is_active', true).single(),
    ])
    weeks = weeksRes.data ?? []
    players = playersRes.data ?? []
    allPicks = picksRes.data ?? []
    allGames = gamesRes.data ?? []
    activeWeekId = activeWeekRes.data?.id ?? null
  } catch {
    // fall through to empty state
  }

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

  // Most-picked team per week, only for weeks whose Sunday deadline has passed
  const realPlayerIds = new Set(players.map((p) => p.id))
  const now = new Date()
  const topPickByWeek: Record<string, { team: string; count: number } | null> = {}
  for (const w of weeks) {
    const weekGames = gamesByWeek[w.id] ?? []
    const deadline = getWeekSundayDeadline(weekGames)
    const revealed = deadline ? deadline <= now : false
    if (!revealed) {
      topPickByWeek[w.id] = null
      continue
    }
    const counts: Record<string, number> = {}
    for (const pick of allPicks) {
      if (pick.week_id !== w.id || !realPlayerIds.has(pick.player_id)) continue
      counts[pick.team] = (counts[pick.team] || 0) + 1
    }
    let top: { team: string; count: number } | null = null
    for (const [team, count] of Object.entries(counts)) {
      if (!top || count > top.count) top = { team, count }
    }
    topPickByWeek[w.id] = top
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
        <h1 className="font-display text-6xl leading-none" style={{ color: 'var(--dark)' }}>PICK GRID</h1>
        <p className="mt-2 mb-6 eyebrow">Full-season pick history · green won · red lost</p>

        {weeks.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No weeks scheduled yet.</p>
        ) : (
          <div className="card overflow-x-auto p-1">
            <table className="text-sm" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th
                    className="text-left py-2 pr-4"
                    style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', minWidth: 140, position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}
                  >
                    Player
                  </th>
                  <th
                    className="py-2 px-2 text-center"
                    style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', minWidth: 44 }}
                  >
                    Left
                  </th>
                  {weeks.map((w) => (
                    <th
                      key={w.id}
                      className="py-2 px-1 text-center"
                      style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', minWidth: 44 }}
                    >
                      <span className="block">Wk{w.week_number}</span>
                      {topPickByWeek[w.id] && (
                        <span className="block font-mono" style={{ fontSize: 9, fontWeight: 400, color: 'var(--muted)' }}>
                          {topPickByWeek[w.id]!.team} ×{topPickByWeek[w.id]!.count}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withStats.map((player) => (
                  <tr key={player.id} style={{ borderBottom: '1px solid var(--border)', opacity: player.status === 'eliminated' ? 0.7 : 1 }}>
                    <td
                      className="py-2 pr-4"
                      style={{ position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: player.status === 'alive' ? 'var(--green)' : 'var(--red)' }}
                        />
                        <span className="font-medium" style={{ color: 'var(--dark)', whiteSpace: 'nowrap' }}>{player.full_name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center font-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {32 - player.weeksSurvived}
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
