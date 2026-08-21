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
      // Still return ok to avoid revealing which attempts are blocked
      return NextResponse.json({ ok: true })
    }

    const { email } = await req.json()
    if (!email || typeof email !== 'string') return NextResponse.json({ ok: true }) // silent fail

    const supabase = await getDb()
    const { data: player } = await supabase
      .from('players')
      .select('id, full_name, email')
      .ilike('email', escapeIlike(email.trim()))
      .single()

    if (player) {
      const pin = generatePin()
      const pin_hash = await hashPin(pin)

      await supabase.from('players').update({ pin_hash }).eq('id', player.id)

      await sendPinRegeneratedEmail(player.email, player.full_name, pin)
    }

    // Always return success to avoid email enumeration
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('forgot-pin error', err)
    return NextResponse.json({ ok: true }) // still silent
  }
}
