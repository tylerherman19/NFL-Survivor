import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireAdmin } from '@/lib/api'

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { game_id, result } = await req.json()
    if (!game_id || !result) {
      return NextResponse.json({ error: 'Missing game_id or result' }, { status: 400 })
    }

    const VALID_RESULTS = ['home_win', 'away_win', 'tie', 'pending']
    if (!VALID_RESULTS.includes(result)) {
      return NextResponse.json({ error: 'Invalid result value' }, { status: 400 })
    }

    const supabase = await getDb()
    // Update the game result
    const { data: game, error } = await supabase
      .from('games')
      .update({ result })
      .eq('id', game_id)
      .select('*')
      .single()

    if (error || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, game })
  } catch (err) {
    console.error('results error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
