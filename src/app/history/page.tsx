import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/testMode'
import { NFL_TEAM_NAMES, NFL_TEAMS } from '@/types'
import type { Week, Game } from '@/types'
import Link from 'next/link'
import LogoutButton from '../components/LogoutButton'

export default async function HistoryPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const supabase = await getDb()

  const [picksRes, weeksRes, gamesRes, playersRes, allPicksRes] = await Promise.all([
    supabase.from('picks').select('team, auto_assigned, week_id').eq('player_id', session.player_id),
    supabase.from('weeks').select('id, week_number, season_year'),
    supabase.from('games').select('week_id, home_team, away_team, result'),
    supabase.from('players').select('id, status, email'),
    supabase.from('picks').select('player_id, week_id'),
  ])

  const picksData = picksRes.data ?? []
  const weeksData = weeksRes.data ?? []
  const gamesData = gamesRes.data ?? []
  const allPlayers = (playersRes.data ?? []).filter(
    (p: { email: string }) => !p.email?.endsWith('@nflsurvivor.internal')
  )
  const allPicks = allPicksRes.data ?? []

  const weekMap: Record<string, Week> = {}
  for (const w of weeksData) weekMap[w.id] = w as Week

  const gamesByWeek: Record<string, Game[]> = {}
  for (const g of gamesData) {
    if (!gamesByWeek[g.week_id]) gamesByWeek[g.week_id] = []
    gamesByWeek[g.week_id].push(g as Game)
  }

  type Outcome = 'won' | 'lost' | 'pending'

  const picks = picksData.map((pick) => {
    const week = weekMap[pick.week_id]
    const games = gamesByWeek[pick.week_id] ?? []
    const game = games.find((g) => g.home_team === pick.team || g.away_team === pick.team)

    let outcome: Outcome = 'pending'
    if (game && game.result !== 'pending') {
      if (game.result === 'home_win') outcome = pick.team === game.home_team ? 'won' : 'lost'
      else if (game.result === 'away_win') outcome = pick.team === game.away_team ? 'won' : 'lost'
      else outcome = 'lost' // tie
    }

    return { ...pick, week, outcome }
  })

  picks.sort((a, b) => (a.week?.week_number ?? 0) - (b.week?.week_number ?? 0))

  // Season summary stats for this player
  const wins = picks.filter((p) => p.outcome === 'won').length
  const losses = picks.filter((p) => p.outcome === 'lost').length
  const myStatus = allPlayers.find((p: { id: string }) => p.id === session.player_id)?.status ?? 'alive'

  const usedTeams = new Set(picksData.map((p: { team: string }) => p.team))
  const teamsRemaining = NFL_TEAMS.filter((t) => !usedTeams.has(t))

  // Percentile: how many other players this player has outlasted (weeks survived = picks made)
  const survivedByPlayer: Record<string, number> = {}
  for (const pick of allPicks) {
    survivedByPlayer[pick.player_id] = (survivedByPlayer[pick.player_id] || 0) + 1
  }
  const mySurvived = picksData.length
  const others = allPlayers.filter((p: { id: string }) => p.id !== session.player_id)
  const outlasted = others.filter((p: { id: string; status: string }) => {
    const theirSurvived = survivedByPlayer[p.id] || 0
    // An alive player is never "outlasted"; an eliminated one is if they made fewer picks
    // (or the same number while this player is still alive)
    if (p.status === 'alive') return false
    return theirSurvived < mySurvived || (theirSurvived === mySurvived && myStatus === 'alive')
  }).length

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>
      <header style={{ background: 'var(--dark)' }}>
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <div>
            <Link href="/" className="font-display text-white text-lg tracking-wider">NFL SURVIVOR POOL</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/pick" className="text-xs tracking-widest uppercase" style={{ color: '#888' }}>Make Pick</Link>
            <span className="text-xs tracking-widest uppercase" style={{ color: '#888' }}>{session.full_name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-10">
        <p className="font-display text-5xl mb-8" style={{ color: 'var(--dark)' }}>MY PICK HISTORY</p>

        {/* Season summary */}
        <div className="grid grid-cols-3 border mb-8" style={{ borderColor: 'var(--border)', background: 'white' }}>
          <div className="py-4 px-4 text-center">
            <p
              className="font-display text-3xl leading-none"
              style={{ color: myStatus === 'alive' ? 'var(--green)' : 'var(--red)' }}
            >
              {myStatus === 'alive' ? 'ALIVE' : 'OUT'}
            </p>
            <p className="text-xs tracking-widest uppercase mt-1" style={{ color: 'var(--muted)' }}>Status</p>
          </div>
          <div className="py-4 px-4 text-center" style={{ borderLeft: '1px solid var(--border)' }}>
            <p className="font-display text-3xl leading-none" style={{ color: 'var(--dark)' }}>
              {wins}–{losses}
            </p>
            <p className="text-xs tracking-widest uppercase mt-1" style={{ color: 'var(--muted)' }}>Record</p>
          </div>
          <div className="py-4 px-4 text-center" style={{ borderLeft: '1px solid var(--border)' }}>
            <p className="font-display text-3xl leading-none" style={{ color: 'var(--dark)' }}>
              {outlasted}/{others.length}
            </p>
            <p className="text-xs tracking-widest uppercase mt-1" style={{ color: 'var(--muted)' }}>Outlasted</p>
          </div>
        </div>

        {picks.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No picks yet this season.</p>
        ) : (
          <div>
            {picks.map((pick) => (
              <div
                key={pick.week_id}
                className="flex items-center justify-between gap-4 py-3 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <div style={{ minWidth: 56 }}>
                  <p className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                    Wk {pick.week?.week_number ?? '?'}
                  </p>
                </div>
                <div className="flex-1">
                  <p
                    className="font-bold font-mono text-base"
                    style={{
                      color: pick.outcome === 'won' ? 'var(--green)' : pick.outcome === 'lost' ? 'var(--red)' : 'var(--dark)',
                    }}
                  >
                    {pick.team}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[pick.team] || pick.team}</p>
                </div>
                <div className="text-right">
                  <span
                    className="text-xs font-bold tracking-wider"
                    style={{
                      color: pick.outcome === 'won' ? 'var(--green)' : pick.outcome === 'lost' ? 'var(--red)' : 'var(--muted)',
                    }}
                  >
                    {pick.outcome === 'won' ? '✓ SURVIVED' : pick.outcome === 'lost' ? '✗ ELIMINATED' : 'PENDING'}
                    {pick.auto_assigned ? ' (auto)' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Teams remaining */}
        <div className="mt-10">
          <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>
            Teams Remaining ({teamsRemaining.length} of 32)
          </p>
          {teamsRemaining.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>You&apos;ve used every team.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {teamsRemaining.map((t) => (
                <span
                  key={t}
                  className="border px-2 py-1 font-mono text-xs font-bold"
                  style={{ borderColor: 'var(--border)', color: 'var(--dark)', background: 'white' }}
                  title={NFL_TEAM_NAMES[t]}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
