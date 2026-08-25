import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/testMode'
import { requireAdmin, isUuid, escapeIlike } from '@/lib/api'
import { logAudit } from '@/lib/audit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const body = await req.json()
  const supabase = await getDb()

  const allowed = ['paid', 'status', 'elimination_reason', 'elimination_week', 'full_name', 'email']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }
  if ('status' in updates && updates.status !== 'alive' && updates.status !== 'eliminated') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // full_name doubles as the login key and email is where PINs get sent —
  // same validation as signup, plus a self-excluded dup check.
  if ('full_name' in updates) {
    const name = typeof updates.full_name === 'string' ? updates.full_name.trim() : ''
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (name.length > 80) return NextResponse.json({ error: 'Name too long (max 80 characters)' }, { status: 400 })
    const { data: byName } = await supabase
      .from('players')
      .select('id')
      .ilike('full_name', escapeIlike(name))
      .neq('id', id)
      .limit(1)
      .maybeSingle()
    if (byName) return NextResponse.json({ error: 'Someone with that name is already signed up' }, { status: 409 })
    updates.full_name = name
  }
  if ('email' in updates) {
    const email = typeof updates.email === 'string' ? updates.email.trim().toLowerCase() : ''
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    const { data: byEmail } = await supabase
      .from('players')
      .select('id')
      .ilike('email', escapeIlike(email))
      .neq('id', id)
      .limit(1)
      .maybeSingle()
    if (byEmail) return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 })
    updates.email = email
  }

  const { data: player, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', id)
    .select('full_name')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const changes = Object.entries(updates).map(([k, v]) => `${k}=${String(v)}`).join(', ')
  await logAudit(supabase, {
    event_type: 'player-updated',
    actor: 'admin',
    player_id: id,
    player_name: player?.full_name ?? null,
    message: `Admin updated ${player?.full_name ?? 'player'}: ${changes}`,
    details: updates,
  })

  revalidatePath('/')
  return NextResponse.json({ ok: true })
}

export async function DELETE(
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

  // Snapshot the name before the row disappears — the audit trail is the
  // only place a deleted player remains visible.
  const { data: player } = await supabase
    .from('players')
    .select('full_name, email, status')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(supabase, {
    event_type: 'player-deleted',
    actor: 'admin',
    player_id: id,
    player_name: player?.full_name ?? null,
    message: `Admin deleted player ${player?.full_name ?? id}`,
    details: player ? { email: player.email, status: player.status } : null,
  })

  revalidatePath('/')
  return NextResponse.json({ ok: true })
}
