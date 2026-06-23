import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyPin } from '@/lib/pin'
import { createSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  try {
    const { full_name, pin } = await req.json()

    if (!full_name || !pin) {
      return NextResponse.json({ error: 'Name and PIN are required' }, { status: 400 })
    }

    // Case-insensitive name lookup
    const { data: players, error } = await supabase
      .from('players')
      .select('id, full_name, pin_hash, status')
      .ilike('full_name', full_name.trim())

    if (error || !players || players.length === 0) {
      return NextResponse.json(
        { error: 'Name not found. Check spelling and try again.' },
        { status: 401 }
      )
    }

    const player = players[0]

    const valid = await verifyPin(pin, player.pin_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 })
    }

    await createSession({
      player_id: player.id,
      full_name: player.full_name,
      is_admin: false,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })

    return NextResponse.json({ ok: true, full_name: player.full_name })
  } catch (err) {
    console.error('login error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
