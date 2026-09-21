import { NextRequest, NextResponse } from 'next/server'
import { isUuid } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { supabase } from '@/lib/supabase'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'

export async function POST(req: NextRequest) {
  let token: FormDataEntryValue | string | null = req.nextUrl.searchParams.get('token')
  if (!token) {
    const formData = await req.formData()
    token = formData.get('token')
  }

  if (typeof token !== 'string') {
    return NextResponse.redirect(new URL('/unsubscribe', req.url), 303)
  }

  const playerId = await verifyUnsubscribeToken(token)
  if (!playerId || !isUuid(playerId)) {
    return NextResponse.redirect(new URL('/unsubscribe', req.url), 303)
  }

  const { data: player, error } = await supabase
    .from('players')
    .update({ email_opted_out: true })
    .eq('id', playerId)
    .select('full_name')
    .single()

  if (error) {
    console.error('unsubscribe error', error)
    return NextResponse.json({ error: 'Unable to update email preference' }, { status: 500 })
  }

  await logAudit(supabase, {
    event_type: 'email-unsubscribed',
    actor: 'player',
    player_id: playerId,
    player_name: player.full_name,
    message: `${player.full_name} unsubscribed from pool emails`,
  })

  if (req.nextUrl.searchParams.has('token')) {
    return NextResponse.json({ ok: true })
  }

  return NextResponse.redirect(new URL(`/unsubscribe?token=${encodeURIComponent(token)}&done=1`, req.url), 303)
}
