import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { getAdminSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession()
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { week_id } = await req.json()
    if (!week_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(week_id)) {
      return NextResponse.json({ error: 'Invalid week_id' }, { status: 400 })
    }

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
