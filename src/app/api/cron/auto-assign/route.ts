import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { getAdminSession } from '@/lib/session'
import { getSNFGame, getMNFGame } from '@/lib/deadline'
import { sendEliminationEmail, sendPickConfirmationEmail } from '@/lib/email'
import type { Game } from '@/types'

// Vercel Cron calls this endpoint
// Authorization: checked via CRON_SECRET header
export async function GET(req: NextRequest) {
  // Vercel Cron (always runs against production — no cookies) or a logged-in
  // admin, which lets the Testing panel exercise this flow against the sandbox.
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = await getDb()
    const { data: week } = await supabase
      .from('weeks')
      .select('*')
      .eq('is_active', true)
      .single()

    if (!week) return NextResponse.json({ ok: true, message: 'No active week' })

    const { data: games } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', week.id)

    if (!games || games.length === 0) {
      return NextResponse.json({ ok: true, message: 'No games found' })
    }

    const gamesData: Game[] = games
    const snfGame = getSNFGame(gamesData)
    const mnfGame = getMNFGame(gamesData)

    const now = new Date()

    // Find alive players without a pick for this week
    const { data: alivePlayers } = await supabase
      .from('players')
      .select('id, full_name, email')
      .eq('status', 'alive')

    if (!alivePlayers || alivePlayers.length === 0) {
      return NextResponse.json({ ok: true, message: 'No alive players' })
    }

    const { data: existingPicks } = await supabase
      .from('picks')
      .select('player_id')
      .eq('week_id', week.id)

    const playersWithPicks = new Set(
      (existingPicks || []).map((p: { player_id: string }) => p.player_id)
    )

    const playersWithoutPick = alivePlayers.filter(
      (p: { id: string }) => !playersWithPicks.has(p.id)
    )

    // Only process players whose Sunday deadline has passed
    // (SNF kickoff serves as a proxy — if SNF has kicked off, it's deadline time)
    const sundayNoon = snfGame
      ? (() => {
          const kickoff = new Date(snfGame.kickoff_central)
          // Sunday 12:00 PM Central is the deadline; compare in UTC
          // We approximate: if current time is past SNF kickoff, definitely past noon Sunday
          return kickoff
        })()
      : null

    if (!sundayNoon || now < sundayNoon) {
      return NextResponse.json({ ok: true, message: 'Not past deadline yet' })
    }

    const results = []

    for (const player of playersWithoutPick) {
      // Get this player's used teams
      const { data: pastPicks } = await supabase
        .from('picks')
        .select('team')
        .eq('player_id', player.id)

      const usedTeams = new Set((pastPicks || []).map((p: { team: string }) => p.team))

      let autoTeam: string | null = null
      let eliminationReason: string | null = null

      if (snfGame && !usedTeams.has(snfGame.away_team)) {
        autoTeam = snfGame.away_team
      } else if (mnfGame && !usedTeams.has(mnfGame.away_team)) {
        autoTeam = mnfGame.away_team
      } else {
        eliminationReason = 'Missed deadline — both auto-assign options already used'
      }

      if (autoTeam) {
        await supabase.from('picks').insert({
          player_id: player.id,
          week_id: week.id,
          team: autoTeam,
          auto_assigned: true,
          submitted_by_admin: false,
        })

        if (player.email) {
          sendPickConfirmationEmail(
            player.email,
            player.full_name,
            autoTeam,
            week.week_number,
            'auto-assigned'
          ).catch(console.error)
        }

        results.push({ player: player.full_name, action: `auto-assigned ${autoTeam}` })
      } else {
        await supabase
          .from('players')
          .update({
            status: 'eliminated',
            elimination_week: week.week_number,
            elimination_reason: eliminationReason,
          })
          .eq('id', player.id)

        if (player.email) {
          sendEliminationEmail(
            player.email,
            player.full_name,
            eliminationReason!,
            week.week_number
          ).catch(console.error)
        }

        results.push({ player: player.full_name, action: 'eliminated (no auto-assign available)' })
      }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.error('auto-assign error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
