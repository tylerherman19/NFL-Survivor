import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { generatePin, hashPin } from '@/lib/pin'
import { sendWelcomeEmail } from '@/lib/email'
import { checkRateLimit, getIP } from '@/lib/rateLimit'
import { escapeIlike } from '@/lib/api'

export async function POST(req: NextRequest) {
  try {
    const ip = await getIP()
    const { allowed } = await checkRateLimit(`signup:${ip}`, 5, 60 * 60)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many signups from this device. Try again in an hour.' },
        { status: 429 }
      )
    }

    const { full_name, email, phone, venmo } = await req.json()

    if (!full_name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    const name = full_name.trim()
    const emailLower = email.trim().toLowerCase()

    if (name.length > 80) {
      return NextResponse.json({ error: 'Name too long (max 80 characters)' }, { status: 400 })
    }
    if (emailLower.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (phone && phone.length > 20) {
      return NextResponse.json({ error: 'Phone number too long' }, { status: 400 })
    }
    if (venmo && venmo.length > 50) {
      return NextResponse.json({ error: 'Venmo handle too long' }, { status: 400 })
    }

    const supabase = await getDb()

    // Check for duplicate email
    const { data: byEmail } = await supabase
      .from('players')
      .select('id')
      .ilike('email', escapeIlike(emailLower))
      .single()

    if (byEmail) {
      return NextResponse.json(
        { error: 'An account with that email already exists. Check your inbox for your PIN, or use "Forgot PIN" on the login page.' },
        { status: 409 }
      )
    }

    // Check for duplicate name (login key)
    const { data: byName } = await supabase
      .from('players')
      .select('id')
      .ilike('full_name', escapeIlike(name))
      .single()

    if (byName) {
      return NextResponse.json(
        { error: 'Someone with that name is already signed up. If this is you, use "Forgot PIN" on the login page.' },
        { status: 409 }
      )
    }

    const pin = generatePin()
    const pinHash = await hashPin(pin)

    const { error: insertError } = await supabase.from('players').insert({
      full_name: name,
      email: emailLower,
      phone: phone?.trim() || null,
      venmo_handle: venmo?.trim() || null,
      pin_hash: pinHash,
      paid: false,
      status: 'alive',
    })

    if (insertError) {
      console.error('signup insert error', insertError)
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    }

    try {
      await sendWelcomeEmail(emailLower, name, pin)
    } catch (emailErr) {
      // The account exists but the PIN never arrived — tell the player how to
      // recover instead of failing the whole signup with a 500.
      console.error('welcome email failed', emailErr)
      return NextResponse.json({
        ok: true,
        warning: 'Account created, but the welcome email failed to send. Use "Forgot PIN" on the login page to get your PIN.',
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('signup error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
