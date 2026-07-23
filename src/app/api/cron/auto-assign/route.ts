import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireCronOrAdmin } from '@/lib/api'
import { getSNFGame, getMNFGame, getWeekSundayDeadline } from '@/lib/deadline'
import { sendEliminationEmail, sendPickConfirmationEmail } from '@/lib/email'
import type { Game } from '@/types'

// Vercel Cron (vercel.json) — after the Sunday noon deadline, players without
// a pick get the SNF away team, then the MNF away team, or are eliminated if
// they've already used both.
export async function GET(req: NextRequest) {
  const unauthorized = await requireCronOrAdmin(req)
  if (unauthorized) return unauthorized

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

    // Only act once the week's Sunday 12:00 PM Central deadline has passed.
    const sundayDeadline = getWeekSundayDeadline(gamesData)
    if (!sundayDeadline || new Date() < sundayDeadline) {
      return NextResponse.json({ ok: true, message: 'Not past deadline yet' })
    }

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

    const results = []

    for (const player of playersWithoutPick) {
      // Get this player's used teams
      const { data: pastPicks } = await supabase
        .from('picks')
        .select('team')
        .eq('player_id', player.id)

      const usedTeams = new Set((pastPicks || []).map((p: { team: string }) => p.team))

      let autoTeam: string | null = null

      if (snfGame && !usedTeams.has(snfGame.away_team)) {
        autoTeam = snfGame.away_team
      } else if (mnfGame && !usedTeams.has(mnfGame.away_team)) {
        autoTeam = mnfGame.away_team
      }

      if (autoTeam) {
        const { error: insertError } = await supabase.from('picks').insert({
          player_id: player.id,
          week_id: week.id,
          team: autoTeam,
          auto_assigned: true,
          submitted_by_admin: false,
        })
        if (insertError) {
          // e.g. the player submitted a pick between our read and this write
          results.push({ player: player.full_name, action: `skipped: ${insertError.message}` })
          continue
        }

        if (player.email) {
          sendPickConfirmationEmail(player.email, player.full_name, autoTeam, week.week_number).catch(
            console.error
          )
        }

        results.push({ player: player.full_name, action: `auto-assigned ${autoTeam}` })
      } else {
        const reason = 'Missed deadline — both auto-assign options already used'
        await supabase
          .from('players')
          .update({
            status: 'eliminated',
            elimination_week: week.week_number,
            elimination_reason: reason,
          })
          .eq('id', player.id)

        if (player.email) {
          sendEliminationEmail(player.email, player.full_name, reason, week.week_number).catch(
            console.error
          )
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
