import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateResetToken } from '@/lib/pin'
import { sendPinResetEmail } from '@/lib/email'
import { checkRateLimit, getIP } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  try {
    const ip = await getIP()
    const { allowed } = await checkRateLimit(`forgot-pin:${ip}`, 5, 60 * 60)
    if (!allowed) {
      // Still return ok to avoid revealing which attempts are blocked
      return NextResponse.json({ ok: true })
    }

    const { email } = await req.json()
    if (!email) return NextResponse.json({ ok: true }) // silent fail

    const { data: player } = await supabase
      .from('players')
      .select('id, full_name, email')
      .ilike('email', email)
      .single()

    if (player) {
      const token = generateResetToken()
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

      await supabase
        .from('players')
        .update({ pin_reset_token: token, pin_reset_expires: expires })
        .eq('id', player.id)

      await sendPinResetEmail(player.email, player.full_name, token)
    }

    // Always return success to avoid email enumeration
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('forgot-pin error', err)
    return NextResponse.json({ ok: true }) // still silent
  }
}
