import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, escapeIlike } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { sendWelcomeEmail } from '@/lib/email'
import { generatePin, hashPin } from '@/lib/pin'
import { getDb } from '@/lib/testMode'

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()
    const name = typeof body.full_name === 'string' ? body.full_name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (name.length > 80) {
      return NextResponse.json({ error: 'Name too long (max 80 characters)' }, { status: 400 })
    }
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const supabase = await getDb()
    const { data: existing, error: lookupError } = await supabase
      .from('players')
      .select('id')
      .ilike('email', escapeIlike(email))
      .limit(1)
      .maybeSingle()

    if (lookupError) {
      console.error('admin player lookup error', lookupError)
      return NextResponse.json({ error: 'Failed to check email address' }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 })
    }

    const pin = generatePin()
    const pinHash = await hashPin(pin)
    const { data: player, error: insertError } = await supabase
      .from('players')
      .insert({
        full_name: name,
        email,
        phone: null,
        venmo_handle: null,
        pin_hash: pinHash,
        paid: false,
        status: 'alive',
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 })
      }
      console.error('admin player insert error', insertError)
      return NextResponse.json({ error: 'Failed to add player' }, { status: 500 })
    }

    await logAudit(supabase, {
      event_type: 'player-signed-up',
      actor: 'admin',
      player_id: player.id,
      player_name: name,
      message: `Admin added ${name}`,
      details: { email },
    })

    const emailResult = await sendWelcomeEmail(email, name, pin)
    if (!emailResult.ok) {
      await logAudit(supabase, {
        event_type: 'welcome-email-failed',
        actor: 'system',
        player_id: player.id,
        player_name: name,
        message: `Welcome email failed to send to ${email}`,
        details: { error: emailResult.error },
      })
      revalidatePath('/')
      revalidatePath('/admin/players')
      return NextResponse.json(
        {
          error: 'Player was added, but the welcome email failed. Use Regen PIN to send a new login email.',
          playerAdded: true,
        },
        { status: 502 }
      )
    }

    revalidatePath('/')
    revalidatePath('/admin/players')
    return NextResponse.json({ ok: true, playerId: player.id })
  } catch (err) {
    console.error('admin add player error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
