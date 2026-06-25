import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { NFL_TEAM_NAMES } from '@/types'
import type { Week, Game } from '@/types'
import Link from 'next/link'
import LogoutButton from '../components/LogoutButton'

export default async function HistoryPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [picksRes, weeksRes, gamesRes] = await Promise.all([
    supabase.from('picks').select('team, auto_assigned, week_id').eq('player_id', session.player_id),
    supabase.from('weeks').select('id, week_number, season_year'),
    supabase.from('games').select('week_id, home_team, away_team, result'),
  ])

  const picksData = picksRes.data ?? []
  const weeksData = weeksRes.data ?? []
  const gamesData = gamesRes.data ?? []

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
      </main>
    </div>
  )
}
