import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireAdmin, isUuid } from '@/lib/api'
import { gradeWeekPicks } from '@/lib/grading'
import type { Game } from '@/types'

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { week_id } = await req.json()
    if (!isUuid(week_id)) return NextResponse.json({ error: 'Invalid week_id' }, { status: 400 })

    const supabase = await getDb()

    const { data: week } = await supabase
      .from('weeks')
      .select('id, week_number')
      .eq('id', week_id)
      .single()
    if (!week) return NextResponse.json({ error: 'Week not found' }, { status: 404 })

    const { data: games } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', week_id)
      .neq('result', 'pending')

    if (!games || games.length === 0) {
      return NextResponse.json({ error: 'No completed games found for this week' }, { status: 400 })
    }

    const grading = await gradeWeekPicks(supabase, week.id, week.week_number, games as Game[])

    return NextResponse.json({ ok: true, grading })
  } catch (err) {
    console.error('grade-week error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
