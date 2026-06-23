import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPin } from '@/lib/pin'

export async function POST(req: NextRequest) {
  try {
    const { token, pin } = await req.json()

    if (!token || !pin || !/^\d{6}$/.test(pin)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { data: player } = await supabase
      .from('players')
      .select('id, pin_reset_token, pin_reset_expires')
      .eq('pin_reset_token', token)
      .single()

    if (!player) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
    }

    if (!player.pin_reset_expires || new Date() > new Date(player.pin_reset_expires)) {
      return NextResponse.json({ error: 'Reset link has expired. Request a new one.' }, { status: 400 })
    }

    const pin_hash = await hashPin(pin)

    await supabase
      .from('players')
      .update({ pin_hash, pin_reset_token: null, pin_reset_expires: null })
      .eq('id', player.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('reset-pin error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
