import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
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

    const supabase = await getDb()
    // Email is unique in production (single match at most); the sandbox lets
    // test users share one inbox, so send a reset per matching account.
    const { data: players } = await supabase
      .from('players')
      .select('id, full_name, email')
      .ilike('email', email)

    for (const player of players || []) {
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
