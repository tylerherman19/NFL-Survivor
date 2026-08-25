import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { generatePin, hashPin } from '@/lib/pin'
import { sendPinRegeneratedEmail } from '@/lib/email'
import { checkRateLimit, getIP } from '@/lib/rateLimit'
import { escapeIlike } from '@/lib/api'

export async function POST(req: NextRequest) {
  try {
    const ip = await getIP()
    const { allowed } = await checkRateLimit(`forgot-pin:${ip}`, 5, 60 * 60)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests from this device. Try again in an hour.' },
        { status: 429 }
      )
    }

    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const supabase = await getDb()
    // .limit(1) + maybeSingle() instead of .single(): a case-variant duplicate
    // (e.g. from CSV import) would make .single() error and report "no email
    // found" for an email that actually exists.
    const { data: player } = await supabase
      .from('players')
      .select('id, full_name, email')
      .ilike('email', escapeIlike(email.trim()))
      .limit(1)
      .maybeSingle()

    // Reversed the old "always return success" anti-enumeration behavior at
    // the pool organizer's request — this is a $25 friends pool, not a
    // target, and the rate limit above still bounds abuse.
    if (!player) {
      return NextResponse.json({ error: 'No account found for that email.' }, { status: 404 })
    }

    const pin = generatePin()
    const pin_hash = await hashPin(pin)

    await supabase.from('players').update({ pin_hash }).eq('id', player.id)

    const emailResult = await sendPinRegeneratedEmail(player.email, player.full_name, pin)
    if (!emailResult.ok) {
      return NextResponse.json(
        { error: 'PIN was reset, but the email failed to send. Try again in a bit.' },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('forgot-pin error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
