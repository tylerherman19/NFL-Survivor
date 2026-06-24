import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generatePin, hashPin } from '@/lib/pin'
import { sendWelcomeEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { full_name, email, phone, venmo } = await req.json()

    if (!full_name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    const name = full_name.trim()
    const emailLower = email.trim().toLowerCase()

    // Check for duplicate email
    const { data: byEmail } = await supabase
      .from('players')
      .select('id')
      .ilike('email', emailLower)
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
      .ilike('full_name', name)
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

    await sendWelcomeEmail(emailLower, name, pin)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('signup error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
