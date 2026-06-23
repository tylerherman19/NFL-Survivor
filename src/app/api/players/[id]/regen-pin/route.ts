import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAdminSession } from '@/lib/session'
import { generatePin, hashPin } from '@/lib/pin'
import { sendWelcomeEmail } from '@/lib/email'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await getAdminSession()
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: player } = await supabase
    .from('players')
    .select('id, full_name, email')
    .eq('id', id)
    .single()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const pin = generatePin()
  const pin_hash = await hashPin(pin)

  await supabase.from('players').update({ pin_hash }).eq('id', id)

  // Reuse welcome email template (it shows the PIN)
  await sendWelcomeEmail(player.email, player.full_name, pin)

  return NextResponse.json({ ok: true })
}
