import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireAdmin, isUuid } from '@/lib/api'
import { generatePin, hashPin } from '@/lib/pin'
import { sendWelcomeEmail } from '@/lib/email'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const supabase = await getDb()

  const { data: player } = await supabase
    .from('players')
    .select('id, full_name, email')
    .eq('id', id)
    .single()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const pin = generatePin()
  const pin_hash = await hashPin(pin)

  // Only email the new PIN once it's actually saved
  const { error } = await supabase.from('players').update({ pin_hash }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to update PIN' }, { status: 500 })

  // Reuse welcome email template (it shows the PIN)
  await sendWelcomeEmail(player.email, player.full_name, pin)

  return NextResponse.json({ ok: true })
}
