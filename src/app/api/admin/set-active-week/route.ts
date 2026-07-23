import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/testMode'
import { requireAdmin, isUuid } from '@/lib/api'

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const { week_id } = await req.json()
    if (!isUuid(week_id)) {
      return NextResponse.json({ error: 'Invalid week_id' }, { status: 400 })
    }

    const supabase = await getDb()
    const { data: week, error: lookupErr } = await supabase
      .from('weeks')
      .select('id, week_number, season_year')
      .eq('id', week_id)
      .single()
    if (lookupErr || !week) {
      return NextResponse.json({ error: 'Week not found' }, { status: 404 })
    }

    await supabase.from('weeks').update({ is_active: false }).gt('week_number', 0)
    const { error } = await supabase.from('weeks').update({ is_active: true }).eq('id', week_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    revalidatePath('/')
    return NextResponse.json({ ok: true, week_number: week.week_number, season_year: week.season_year })
  } catch (err) {
    console.error('set-active-week error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
