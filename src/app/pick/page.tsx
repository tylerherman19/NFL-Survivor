import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { NFL_TEAM_NAMES } from '@/types'
import type { Game } from '@/types'
import PickForm from './PickForm'
import LogoutButton from '../components/LogoutButton'
import { getPickDeadline } from '@/lib/deadline'

export default async function PickPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  try {
    const { data: week } = await supabase
      .from('weeks')
      .select('*')
      .eq('is_active', true)
      .single()

    if (!week) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="text-center text-slate-400">
            <p className="text-4xl mb-4">🏈</p>
            <p className="text-xl text-white">No active week</p>
            <p className="mt-2">The pool hasn&apos;t started yet — check back soon.</p>
          </div>
        </div>
      )
    }

    // Get player info
    const { data: player } = await supabase
      .from('players')
      .select('id, full_name, status, paid')
      .eq('id', session.player_id)
      .single()

    if (!player) redirect('/login')

    // Get all previously used teams
    const { data: pastPicks } = await supabase
      .from('picks')
      .select('team, week_id')
      .eq('player_id', session.player_id)

    const usedTeams = (pastPicks || []).map((p: { team: string }) => p.team)

    // Get current week's pick if any
    const { data: currentPick } = await supabase
      .from('picks')
      .select('*')
      .eq('player_id', session.player_id)
      .eq('week_id', week.id)
      .single()

    // Get games for this week
    const { data: games } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', week.id)
      .order('kickoff_central')

    const gamesData: Game[] = games || []

    // Build available teams with deadline info
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
        const locked = deadline ? now >= deadline : false
        return { team, deadline: deadline?.toISOString() || null, locked }
      })
      .sort((a, b) => a.team.localeCompare(b.team))

    return (
      <div className="min-h-screen bg-slate-900">
        <header className="border-b border-slate-700 bg-slate-800">
          <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">Week {week.week_number} Pick</h1>
              <p className="text-slate-400 text-sm">{session.full_name}</p>
            </div>
            <LogoutButton />
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 py-8">
          {player.status === 'eliminated' ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
              <p className="text-4xl mb-3">❌</p>
              <p className="text-xl font-bold text-white">You&apos;ve been eliminated</p>
              <p className="text-slate-400 mt-2">
                {player.full_name}, you can still follow along on the{' '}
                <a href="/" className="text-green-400 underline">
                  standings page
                </a>
                .
              </p>
            </div>
          ) : currentPick ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6 text-center">
                <p className="text-green-400 font-medium mb-2">✅ Week {week.week_number} pick locked in</p>
                <p className="text-4xl font-bold text-white">{NFL_TEAM_NAMES[currentPick.team] || currentPick.team}</p>
                <p className="text-slate-400 text-sm mt-1 font-mono">{currentPick.team}</p>
                {currentPick.auto_assigned && (
                  <p className="text-amber-400 text-sm mt-2">Auto-assigned (missed deadline)</p>
                )}
              </div>
              <div className="text-center">
                <p className="text-slate-500 text-sm">
                  Used teams so far: {usedTeams.join(', ') || 'None yet'}
                </p>
              </div>
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
        </main>
      </div>
    )
  } catch {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Failed to load pick page. Try refreshing.</p>
      </div>
    )
  }
}
