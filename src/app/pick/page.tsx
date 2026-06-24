import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { NFL_TEAM_NAMES } from '@/types'
import type { Game } from '@/types'
import PickForm from './PickForm'
import LogoutButton from '../components/LogoutButton'
import { getPickDeadline } from '@/lib/deadline'
import Link from 'next/link'

export default async function PickPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  try {
    const { data: week } = await supabase.from('weeks').select('*').eq('is_active', true).single()

    if (!week) return (
      <Shell session={session}>
        <div className="text-center py-20">
          <p className="font-display text-4xl" style={{ color: 'var(--dark)' }}>NO ACTIVE WEEK</p>
          <p className="text-sm mt-3" style={{ color: 'var(--muted)' }}>The pool hasn&apos;t started yet — check back soon.</p>
        </div>
      </Shell>
    )

    const { data: player } = await supabase.from('players').select('id, full_name, status, paid').eq('id', session.player_id).single()
    if (!player) redirect('/login')

    const { data: pastPicks } = await supabase.from('picks').select('team, week_id').eq('player_id', session.player_id)
    const usedTeams = (pastPicks || []).map((p: { team: string }) => p.team)

    const { data: currentPick } = await supabase.from('picks').select('*').eq('player_id', session.player_id).eq('week_id', week.id).single()

    const { data: games } = await supabase.from('games').select('*').eq('week_id', week.id).order('kickoff_central')
    const gamesData: Game[] = games || []

    const allTeamsThisWeek = new Set<string>()
    const gameByTeam: Record<string, Game> = {}
    for (const g of gamesData) {
      allTeamsThisWeek.add(g.home_team)
      allTeamsThisWeek.add(g.away_team)
      gameByTeam[g.home_team] = g
      gameByTeam[g.away_team] = g
    }

    const now = new Date()
    const availableTeams = Array.from(allTeamsThisWeek)
      .filter((t) => !usedTeams.includes(t))
      .map((team) => {
        const game = gameByTeam[team]
        const deadline = game ? getPickDeadline(game) : null
        return { team, deadline: deadline?.toISOString() || null, locked: deadline ? now >= deadline : false }
      })
      .sort((a, b) => a.team.localeCompare(b.team))

    return (
      <Shell session={session} weekNumber={week.week_number}>
        {player.status === 'eliminated' ? (
          <div className="border p-8 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="font-display text-4xl" style={{ color: 'var(--red)' }}>ELIMINATED</p>
            <p className="text-sm mt-3" style={{ color: 'var(--muted)' }}>
              You can still follow along on the{' '}
              <Link href="/" className="underline" style={{ color: 'var(--dark)' }}>standings page</Link>.
            </p>
          </div>
        ) : currentPick ? (
          <div className="space-y-6">
            <div className="border p-8 text-center" style={{ borderColor: 'var(--green)', borderWidth: 2 }}>
              <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--green)' }}>
                ✓ Week {week.week_number} Pick Locked In
              </p>
              <p className="font-display text-5xl" style={{ color: 'var(--dark)' }}>
                {NFL_TEAM_NAMES[currentPick.team] || currentPick.team}
              </p>
              <p className="font-mono text-sm mt-1" style={{ color: 'var(--muted)' }}>{currentPick.team}</p>
              {currentPick.auto_assigned && (
                <p className="text-xs mt-3" style={{ color: 'var(--red)' }}>Auto-assigned (missed deadline)</p>
              )}
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
              Teams used: {usedTeams.join(', ') || 'None yet'}
            </p>
          </div>
        ) : (
          <PickForm
            weekId={week.id}
            weekNumber={week.week_number}
            playerId={session.player_id}
            availableTeams={availableTeams}
            usedTeams={usedTeams}
          />
        )}
      </Shell>
    )
  } catch {
    return (
      <Shell session={session}>
        <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>Failed to load. Try refreshing.</p>
      </Shell>
    )
  }
}

function Shell({ children, session, weekNumber }: { children: React.ReactNode; session: { full_name: string }; weekNumber?: number }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>
      <header style={{ background: 'var(--dark)' }}>
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <div>
            <Link href="/" className="font-display text-white text-lg tracking-wider">NFL SURVIVOR POOL</Link>
            {weekNumber && <p className="text-xs tracking-widest uppercase mt-0.5" style={{ color: '#666' }}>Week {weekNumber}</p>}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs tracking-widest uppercase" style={{ color: '#888' }}>{session.full_name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-10">
        {children}
      </main>
    </div>
  )
}
