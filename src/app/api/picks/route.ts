import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession, getAdminSession } from '@/lib/session'
import { getTeamDeadline } from '@/lib/deadline'
import { sendPickConfirmationEmail } from '@/lib/email'
import { NFL_TEAMS } from '@/types'
import type { Game } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { week_id, team, player_id_override, submitted_by_admin } = body

    // Allow admin to submit on behalf of a player
    const isAdmin = submitted_by_admin ? await getAdminSession() : false
    let playerId: string

    if (isAdmin && player_id_override) {
      playerId = player_id_override
    } else {
      const session = await getSession()
      if (!session) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
      playerId = session.player_id
    }

    if (!week_id || !team) {
      return NextResponse.json({ error: 'Missing week_id or team' }, { status: 400 })
    }

    // Validate team is a known NFL team
    if (!(NFL_TEAMS as readonly string[]).includes(team)) {
      return NextResponse.json({ error: 'Invalid team' }, { status: 400 })
    }

    // Basic UUID format check
    if (!/^[0-9a-f-]{36}$/i.test(week_id)) {
      return NextResponse.json({ error: 'Invalid week_id' }, { status: 400 })
    }

    // Check player is alive
    const { data: player } = await supabase
      .from('players')
      .select('id, email, full_name, status')
      .eq('id', playerId)
      .single()

    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    if (player.status === 'eliminated') {
      return NextResponse.json({ error: 'You are eliminated' }, { status: 403 })
    }

    // Check week is active
    const { data: week } = await supabase
      .from('weeks')
      .select('id, week_number, is_active')
      .eq('id', week_id)
      .single()

    if (!week?.is_active) {
      return NextResponse.json({ error: 'This week is not active' }, { status: 400 })
    }

    // Check player hasn't already picked this week
    const { data: existingPick } = await supabase
      .from('picks')
      .select('id')
      .eq('player_id', playerId)
      .eq('week_id', week_id)
      .single()

    if (existingPick && !isAdmin) {
      return NextResponse.json({ error: 'You already have a pick for this week' }, { status: 409 })
    }

    // Check team hasn't been used by this player in other weeks
    // When admin is reassigning, exclude the current week so the replaced team doesn't block
    let pastPicksQuery = supabase.from('picks').select('team').eq('player_id', playerId)
    if (isAdmin && existingPick) pastPicksQuery = pastPicksQuery.neq('week_id', week_id)
    const { data: pastPicks } = await pastPicksQuery

    const usedTeams = (pastPicks || []).map((p: { team: string }) => p.team)
    if (usedTeams.includes(team)) {
      return NextResponse.json({ error: `${player.full_name} already used ${team} in a previous week` }, { status: 400 })
    }

    // Check deadline
    const { data: games } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', week_id)

    const gamesData: Game[] = games || []
    const teamGame = gamesData.find((g) => g.home_team === team || g.away_team === team)

    if (!teamGame) {
      return NextResponse.json({ error: `${team} is not playing this week` }, { status: 400 })
    }

    // Admins can bypass deadline for manual submissions
    const teamDeadline = getTeamDeadline(team, gamesData)
    if (!isAdmin) {
      if (teamDeadline && new Date() >= teamDeadline) {
        return NextResponse.json(
          { error: `The deadline for picking ${team} has passed` },
          { status: 400 }
        )
      }
    }

    // Admin reassignment: delete the existing pick before inserting the new one
    if (isAdmin && existingPick) {
      await supabase.from('picks').delete().eq('id', existingPick.id)
    }

    // Insert the pick
    const { error: insertError } = await supabase.from('picks').insert({
      player_id: playerId,
      week_id,
      team,
      auto_assigned: false,
      submitted_by_admin: submitted_by_admin || false,
    })

    if (insertError) {
      console.error('insert error', insertError)
      return NextResponse.json({ error: 'Failed to save pick' }, { status: 500 })
    }

    // Send confirmation email (non-blocking)
    if (player.email) {
      sendPickConfirmationEmail(
        player.email,
        player.full_name,
        team,
        week.week_number,
        teamDeadline?.toISOString() || ''
      ).catch(console.error)
    }

    return NextResponse.json({ ok: true, team })
  } catch (err) {
    console.error('picks error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
