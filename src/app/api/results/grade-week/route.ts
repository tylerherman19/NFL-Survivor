import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAdminSession } from '@/lib/session'
import { sendEliminationEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession()
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { week_id } = await req.json()
    if (!week_id) return NextResponse.json({ error: 'Missing week_id' }, { status: 400 })

    const { data: week } = await supabase
      .from('weeks')
      .select('week_number')
      .eq('id', week_id)
      .single()

    // Get all games with results for this week
    const { data: games } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', week_id)
      .neq('result', 'pending')

    if (!games || games.length === 0) {
      return NextResponse.json({ error: 'No completed games found for this week' }, { status: 400 })
    }

    // Build winner and loser sets
    const winners = new Set<string>()
    const losers = new Set<string>() // includes ties

    for (const g of games) {
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

    // Get all picks for this week from alive players
    const { data: picks } = await supabase
      .from('picks')
      .select('id, player_id, team, players(id, full_name, email, status)')
      .eq('week_id', week_id)

    if (!picks) return NextResponse.json({ grading: { eliminated: [], advanced: [] } })

    const eliminated: string[] = []
    const advanced: string[] = []

    for (const pick of picks) {
      const player = pick.players as unknown as { id: string; full_name: string; email: string; status: string } | null
      if (!player || player.status !== 'alive') continue

      const pickedTeam = pick.team

      // Only grade picks where the game is done
      const gameForTeam = games.find(
        (g) => g.home_team === pickedTeam || g.away_team === pickedTeam
      )
      if (!gameForTeam) continue // game not done yet, skip

      if (losers.has(pickedTeam)) {
        // Eliminate the player
        const reason = `Week ${week?.week_number}: picked ${pickedTeam} — ${
          gameForTeam.result === 'tie' ? 'game ended in a tie' : 'lost'
        }`
        await supabase
          .from('players')
          .update({
            status: 'eliminated',
            elimination_week: week?.week_number,
            elimination_reason: reason,
          })
          .eq('id', player.id)

        eliminated.push(player.full_name)

        // Send elimination email (non-blocking)
        if (player.email) {
          sendEliminationEmail(player.email, player.full_name, reason, week?.week_number || 0).catch(
            console.error
          )
        }
      } else if (winners.has(pickedTeam)) {
        advanced.push(player.full_name)
      }
    }

    return NextResponse.json({ ok: true, grading: { eliminated, advanced } })
  } catch (err) {
    console.error('grade-week error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
