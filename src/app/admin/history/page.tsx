import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { getDb } from '@/lib/testMode'
import { NFL_TEAM_NAMES } from '@/types'
import { formatCentralTime } from '@/lib/deadline'

interface WeekRow {
  id: string
  week_number: number
  season_year: number
  is_active: boolean
}

interface GameRow {
  id: string
  week_id: string
  home_team: string
  away_team: string
  result: string
  kickoff_central: string
}

export default async function AdminHistoryPage() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')
  const supabase = await getDb()

  const [{ data: weeks }, { data: games }, { data: picks }, { data: players }] = await Promise.all([
    supabase.from('weeks').select('id, week_number, season_year, is_active').order('week_number'),
    supabase.from('games').select('id, week_id, home_team, away_team, result, kickoff_central').order('kickoff_central'),
    supabase.from('picks').select('week_id, team, auto_assigned'),
    supabase.from('players').select('full_name, email, status, elimination_week, elimination_reason'),
  ])

  const weekRows: WeekRow[] = weeks || []
  const gamesByWeek = new Map<string, GameRow[]>()
  for (const g of games || []) {
    const list = gamesByWeek.get(g.week_id) || []
    list.push(g)
    gamesByWeek.set(g.week_id, list)
  }

  const pickStatsByWeek = new Map<string, { total: number; auto: number; byTeam: Record<string, number> }>()
  for (const p of picks || []) {
    const stats = pickStatsByWeek.get(p.week_id) || { total: 0, auto: 0, byTeam: {} }
    stats.total++
    if (p.auto_assigned) stats.auto++
    stats.byTeam[p.team] = (stats.byTeam[p.team] || 0) + 1
    pickStatsByWeek.set(p.week_id, stats)
  }

  const realPlayers = (players || []).filter((p) => !p.email?.endsWith('@nflsurvivor.internal'))
  const elimsByWeek = new Map<number, { full_name: string; elimination_reason: string | null }[]>()
  for (const p of realPlayers) {
    if (p.status === 'eliminated' && p.elimination_week != null) {
      const list = elimsByWeek.get(p.elimination_week) || []
      list.push({ full_name: p.full_name, elimination_reason: p.elimination_reason })
      elimsByWeek.set(p.elimination_week, list)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div>
        <h1 className="font-display text-5xl leading-none" style={{ color: 'var(--dark)' }}>SEASON HISTORY</h1>
        <p className="mt-2 eyebrow">Every week&apos;s games, results, picks, and eliminations</p>
      </div>

      {weekRows.length === 0 && (
        <div className="card p-6 text-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No weeks created yet.</p>
        </div>
      )}

      {weekRows.map((week) => {
        const weekGames = gamesByWeek.get(week.id) || []
        const stats = pickStatsByWeek.get(week.id)
        const elims = elimsByWeek.get(week.week_number) || []
        const topPicks = stats
          ? Object.entries(stats.byTeam).sort((a, b) => b[1] - a[1]).slice(0, 5)
          : []

        return (
          <div key={week.id} className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-lg" style={{ color: 'var(--dark)' }}>
                Week {week.week_number} · {week.season_year}
              </p>
              <div className="flex items-center gap-3">
                {week.is_active && (
                  <span className="pill pill-alive"><span className="pill-dot" />Active</span>
                )}
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {stats?.total ?? 0} picks{stats && stats.auto > 0 ? ` (${stats.auto} auto)` : ''}
                </span>
              </div>
            </div>

            {weekGames.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: 'var(--border)' }}>
                    <th className="py-1.5 eyebrow">Game</th>
                    <th className="py-1.5 eyebrow hidden sm:table-cell">Kickoff (CT)</th>
                    <th className="py-1.5 eyebrow text-right">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {weekGames.map((g) => (
                    <tr key={g.id} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-1.5 font-mono" style={{ color: 'var(--dark)' }}>
                        {g.away_team} @ {g.home_team}
                      </td>
                      <td className="py-1.5 hidden sm:table-cell" style={{ color: 'var(--muted)' }}>{formatCentralTime(g.kickoff_central)}</td>
                      <td className="py-1.5 text-right">
                        {g.result === 'pending' ? (
                          <span className="text-xs italic" style={{ color: 'var(--muted)' }}>pending</span>
                        ) : g.result === 'tie' ? (
                          <span className="text-xs font-semibold" style={{ color: 'var(--red)' }}>TIE</span>
                        ) : (
                          <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>
                            {g.result === 'home_win' ? g.home_team : g.away_team} won
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No games entered for this week.</p>
            )}

            {topPicks.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Most picked:{' '}
                {topPicks.map(([team, count], i) => (
                  <span key={team}>
                    {i > 0 && ' · '}
                    <span className="font-mono font-semibold" style={{ color: 'var(--dark)' }}>{team}</span> ×{count}
                  </span>
                ))}
              </p>
            )}

            {elims.length > 0 && (
              <div className="rounded-lg p-3" style={{ background: 'var(--red-tint)' }}>
                <p className="eyebrow mb-1.5" style={{ color: 'var(--red)' }}>
                  Eliminated in Week {week.week_number} ({elims.length})
                </p>
                <ul className="space-y-0.5 text-sm" style={{ color: 'var(--dark)' }}>
                  {elims.map((e) => (
                    <li key={e.full_name}>
                      {e.full_name}
                      {e.elimination_reason && <span style={{ color: 'var(--muted)' }}> — {e.elimination_reason}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}

      {/* Teams never yet picked across the season */}
      <NeverPicked picks={picks || []} />
    </div>
  )
}

function NeverPicked({ picks }: { picks: { team: string }[] }) {
  const pickedTeams = new Set(picks.map((p) => p.team))
  const never = Object.keys(NFL_TEAM_NAMES).filter((t) => !pickedTeams.has(t))
  if (never.length === 0) return null
  return (
    <div className="card p-5">
      <p className="eyebrow mb-2">Never Picked This Season ({never.length})</p>
      <p className="text-sm font-mono leading-relaxed" style={{ color: 'var(--dark)' }}>{never.join(', ')}</p>
    </div>
  )
}
