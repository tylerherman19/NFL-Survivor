import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { getAdminSession } from '@/lib/session'
import { formatCentralTime, getWeekSundayDeadline } from '@/lib/deadline'
import { sendReminderEmail } from '@/lib/email'
import type { Game } from '@/types'

export async function GET(req: NextRequest) {
  // Vercel Cron (always runs against production — no cookies) or a logged-in
  // admin, which lets the Testing panel exercise this flow against the sandbox.
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !(await getAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = await getDb()
    const { data: week } = await supabase
      .from('weeks')
      .select('*')
      .eq('is_active', true)
      .single()

    if (!week) return NextResponse.json({ ok: true, message: 'No active week' })

    const { data: games } = await supabase
      .from('games')
      .select('*')
      .eq('week_id', week.id)

    const sundayDeadline = getWeekSundayDeadline((games || []) as Game[])
    if (!sundayDeadline) return NextResponse.json({ ok: true, message: 'No deadline found' })

    const deadlineStr = formatCentralTime(sundayDeadline)

    // Find alive players without a pick this week
    const { data: alivePlayers } = await supabase
      .from('players')
      .select('id, full_name, email')
      .eq('status', 'alive')

    const { data: existingPicks } = await supabase
      .from('picks')
      .select('player_id')
      .eq('week_id', week.id)

    const playersWithPicks = new Set(
      (existingPicks || []).map((p: { player_id: string }) => p.player_id)
    )

    const toRemind = (alivePlayers || []).filter(
      (p: { id: string }) => !playersWithPicks.has(p.id)
    )

    for (const player of toRemind) {
      if (player.email) {
        await sendReminderEmail(
          player.email,
          player.full_name,
          week.week_number,
          deadlineStr
        )
      }
    }

    return NextResponse.json({ ok: true, reminded: toRemind.length })
  } catch (err) {
    console.error('reminders error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
