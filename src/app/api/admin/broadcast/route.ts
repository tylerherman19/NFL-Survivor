import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireAdmin } from '@/lib/api'
import { getResend, esc, isDeliverable, FROM_EMAIL } from '@/lib/email'

// Sends are paced at ~1.6/sec for Resend rate limits, so allow up to 4 min of runtime
export const maxDuration = 300

const MAX_RECIPIENTS = 300
// Resend free tier allows ~2 requests/sec — pace sends to stay under it
const SEND_DELAY_MS = 600

const VALID_AUDIENCES = ['all', 'alive', 'unpicked'] as const
type Audience = (typeof VALID_AUDIENCES)[number]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { subject, message, audience } = await req.json()

    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return NextResponse.json({ error: 'Missing subject' }, { status: 400 })
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 })
    }
    if (!VALID_AUDIENCES.includes(audience as Audience)) {
      return NextResponse.json({ error: 'Invalid audience. Use all, alive, or unpicked' }, { status: 400 })
    }

    const supabase = await getDb()
    const { data: allPlayers, error } = await supabase
      .from('players')
      .select('id, full_name, email, status')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Internal test accounts have fake emails that would bounce
    let recipients = (allPlayers || []).filter((p) => p.email && isDeliverable(p.email))

    if (audience === 'alive') {
      recipients = recipients.filter((p) => p.status === 'alive')
    } else if (audience === 'unpicked') {
      const { data: week } = await supabase.from('weeks').select('id').eq('is_active', true).single()
      if (!week) return NextResponse.json({ error: 'No active week — cannot compute unpicked players' }, { status: 400 })
      const { data: picks } = await supabase.from('picks').select('player_id').eq('week_id', week.id)
      const pickedIds = new Set((picks || []).map((p) => p.player_id))
      recipients = recipients.filter((p) => p.status === 'alive' && !pickedIds.has(p.id))
    }

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No recipients match that audience' }, { status: 400 })
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Audience too large (${recipients.length} > ${MAX_RECIPIENTS})` }, { status: 400 })
    }

    const resend = getResend()
    const htmlBody = esc(message.trim()).replace(/\r?\n/g, '<br />')

    let sent = 0
    const failures: string[] = []
    for (const player of recipients) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: player.email,
          subject: subject.trim(),
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <p>Hey ${esc(player.full_name)},</p>
              <p>${htmlBody}</p>
              <p style="margin-top: 24px; color: #666; font-size: 14px;">— NFL Survivor Pool</p>
            </div>
          `,
        })
        sent++
      } catch {
        failures.push(player.full_name)
      }
      if (recipients.length > 2) await sleep(SEND_DELAY_MS)
    }

    return NextResponse.json({
      ok: true,
      sent,
      total: recipients.length,
      failures: failures.length > 0 ? failures : undefined,
    })
  } catch (err) {
    console.error('broadcast error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
