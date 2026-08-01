import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { verifyPin } from '@/lib/pin'
import { createSession } from '@/lib/session'
import { checkRateLimit, getIP } from '@/lib/rateLimit'
import { escapeIlike } from '@/lib/api'

export async function POST(req: NextRequest) {
  try {
    const ip = await getIP()
    const { allowed } = await checkRateLimit(`login:${ip}`, 10, 15 * 60)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again in 15 minutes.' },
        { status: 429 }
      )
    }

    const { full_name, pin } = await req.json()

    if (!full_name || !pin) {
      return NextResponse.json({ error: 'Name and PIN are required' }, { status: 400 })
    }

    if (typeof full_name !== 'string' || full_name.length > 80) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    }
    if (typeof pin !== 'string' || pin.length > 20) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 })
    }

    // Case-insensitive name lookup
    const supabase = await getDb()
    const { data: players, error } = await supabase
      .from('players')
      .select('id, full_name, pin_hash, status')
      .ilike('full_name', escapeIlike(full_name.trim()))

    if (error || !players || players.length === 0) {
      return NextResponse.json(
        { error: 'Invalid name or PIN. Check spelling and try again.' },
        { status: 401 }
      )
    }

    // Names aren't guaranteed unique (the CSV importer only dedupes on email),
    // so try every candidate's PIN rather than assuming players[0] is the right
    // one — otherwise a same-named player can be locked out at random.
    let player: (typeof players)[number] | null = null
    for (const candidate of players) {
      if (await verifyPin(pin, candidate.pin_hash)) {
        player = candidate
        break
      }
    }

    if (!player) {
      return NextResponse.json({ error: 'Invalid name or PIN. Check spelling and try again.' }, { status: 401 })
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
