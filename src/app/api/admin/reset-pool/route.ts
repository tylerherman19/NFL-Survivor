import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'

const CONFIRM_PHRASE = 'RESET POOL'

// Wipes every player, week, game, and pick from production (public schema)
// back to zero. Deliberately always targets `supabase` (prod) directly, never
// getDb() — this must never be reachable from the sandbox cookie path, and
// must always hit prod regardless of the admin's current test-mode state.
// Used to clear a preseason trial before real regular-season signups start.
export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { confirm } = await req.json()
    if (confirm !== CONFIRM_PHRASE) {
      return NextResponse.json({ error: `Must confirm with exact phrase "${CONFIRM_PHRASE}"` }, { status: 400 })
    }

    // Snapshot what's about to be destroyed — audit_log is deliberately not
    // cleared below, so this record outlives the reset.
    const [{ count: playerCount }, { count: pickCount }, { count: weekCount }] = await Promise.all([
      supabase.from('players').select('*', { count: 'exact', head: true }),
      supabase.from('picks').select('*', { count: 'exact', head: true }),
      supabase.from('weeks').select('*', { count: 'exact', head: true }),
    ])

    // Children first, though FKs cascade anyway — explicit is safer than
    // relying on cascade order for a destructive, irreversible operation.
    const { error: picksError } = await supabase.from('picks').delete().not('id', 'is', null)
    if (picksError) return NextResponse.json({ error: `Failed to clear picks: ${picksError.message}` }, { status: 500 })

    const { error: gamesError } = await supabase.from('games').delete().not('id', 'is', null)
    if (gamesError) return NextResponse.json({ error: `Failed to clear games: ${gamesError.message}` }, { status: 500 })

    const { error: weeksError } = await supabase.from('weeks').delete().not('id', 'is', null)
    if (weeksError) return NextResponse.json({ error: `Failed to clear weeks: ${weeksError.message}` }, { status: 500 })

    const { error: playersError } = await supabase.from('players').delete().not('id', 'is', null)
    if (playersError) return NextResponse.json({ error: `Failed to clear players: ${playersError.message}` }, { status: 500 })

    await logAudit(supabase, {
      event_type: 'pool-reset',
      actor: 'admin',
      message: `Admin reset the pool — wiped ${playerCount ?? 0} players, ${pickCount ?? 0} picks, ${weekCount ?? 0} weeks`,
      details: { players: playerCount, picks: pickCount, weeks: weekCount },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('reset-pool error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
