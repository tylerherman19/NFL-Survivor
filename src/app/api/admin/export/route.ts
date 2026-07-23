import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { requireAdmin } from '@/lib/api'

function csvField(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  // Neutralize spreadsheet formula injection: player names/phones/venmo are
  // attacker-controlled via the public signup form. A leading = + - @ (or
  // tab/CR) makes Excel/Sheets evaluate the cell as a formula. Prefix with '.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvField).join(',')]
  for (const row of rows) lines.push(row.map(csvField).join(','))
  return lines.join('\r\n') + '\r\n'
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  const type = req.nextUrl.searchParams.get('type')
  if (type !== 'players' && type !== 'picks') {
    return NextResponse.json({ error: 'Invalid type. Use ?type=players or ?type=picks' }, { status: 400 })
  }

  try {
    const supabase = await getDb()
    if (type === 'players') {
      const { data: players, error } = await supabase
        .from('players')
        .select('full_name, email, phone, venmo_handle, paid, status, elimination_week')
        .order('full_name')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const csv = toCsv(
        ['full_name', 'email', 'phone', 'venmo_handle', 'paid', 'status', 'elimination_week'],
        (players || []).map((p) => [p.full_name, p.email, p.phone, p.venmo_handle, p.paid, p.status, p.elimination_week])
      )
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="survivor-players.csv"',
        },
      })
    }

    // type === 'picks'
    const [{ data: picks, error: picksErr }, { data: players }, { data: weeks }] = await Promise.all([
      supabase.from('picks').select('player_id, week_id, team, auto_assigned, submitted_by_admin, created_at'),
      supabase.from('players').select('id, full_name'),
      supabase.from('weeks').select('id, week_number, season_year'),
    ])
    if (picksErr) return NextResponse.json({ error: picksErr.message }, { status: 500 })

    const nameById = new Map((players || []).map((p) => [p.id, p.full_name]))
    const weekById = new Map((weeks || []).map((w) => [w.id, w]))

    const rows = (picks || [])
      .map((p) => {
        const week = weekById.get(p.week_id)
        return {
          player: nameById.get(p.player_id) || p.player_id,
          week_number: week?.week_number ?? null,
          season_year: week?.season_year ?? null,
          team: p.team,
          auto_assigned: p.auto_assigned,
          submitted_by_admin: p.submitted_by_admin,
          created_at: p.created_at,
        }
      })
      .sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0) || a.player.localeCompare(b.player))

    const csv = toCsv(
      ['player', 'week_number', 'season_year', 'team', 'auto_assigned', 'submitted_by_admin', 'created_at'],
      rows.map((r) => [r.player, r.week_number, r.season_year, r.team, r.auto_assigned, r.submitted_by_admin, r.created_at])
    )
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="survivor-picks.csv"',
      },
    })
  } catch (err) {
    console.error('export error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
