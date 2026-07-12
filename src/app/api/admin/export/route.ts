import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/testMode'
import { getAdminSession } from '@/lib/session'

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
  const isAdmin = await getAdminSession()
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const type = req.nextUrl.searchParams.get('type')
  if (type !== 'players' && type !== 'picks' && type !== 'grid') {
    return NextResponse.json({ error: 'Invalid type. Use ?type=players, ?type=picks, or ?type=grid' }, { status: 400 })
  }

  // Internal sandbox accounts never belong in exports
  const isInternal = (email: string | null | undefined) => !!email?.endsWith('@nflsurvivor.internal')

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
        (players || [])
          .filter((p) => !isInternal(p.email))
          .map((p) => [p.full_name, p.email, p.phone, p.venmo_handle, p.paid, p.status, p.elimination_week])
      )
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="survivor-players.csv"',
        },
      })
    }

    const [{ data: picks, error: picksErr }, { data: players }, { data: weeks }, { data: games }] = await Promise.all([
      supabase.from('picks').select('player_id, week_id, team, auto_assigned, submitted_by_admin, created_at'),
      supabase.from('players').select('id, full_name, email, status, elimination_week'),
      supabase.from('weeks').select('id, week_number, season_year').order('week_number'),
      supabase.from('games').select('week_id, home_team, away_team, result'),
    ])
    if (picksErr) return NextResponse.json({ error: picksErr.message }, { status: 500 })

    const realPlayers = (players || []).filter((p) => !isInternal(p.email))
    const nameById = new Map(realPlayers.map((p) => [p.id, p.full_name]))
    const weekById = new Map((weeks || []).map((w) => [w.id, w]))

    if (type === 'picks') {
      const rows = (picks || [])
        .filter((p) => nameById.has(p.player_id))
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
    }

    // type === 'grid' — the pick spread as a player × week matrix, the weekly
    // failsafe snapshot. Cells read "KC (W)" / "DAL (L)" / "MIN" (ungraded).
    const gamesByWeek = new Map<string, { home_team: string; away_team: string; result: string }[]>()
    for (const g of games || []) {
      const list = gamesByWeek.get(g.week_id) || []
      list.push(g)
      gamesByWeek.set(g.week_id, list)
    }
    const pickByPlayerWeek = new Map<string, { team: string; auto_assigned: boolean }>()
    for (const p of picks || []) {
      pickByPlayerWeek.set(`${p.player_id}:${p.week_id}`, p)
    }

    const sortedWeeks = weeks || []
    const sortedPlayers = [...realPlayers].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'alive' ? -1 : 1
      return a.full_name.localeCompare(b.full_name)
    })

    const header = ['player', 'status', ...sortedWeeks.map((w) => `week_${w.week_number}`)]
    const rows = sortedPlayers.map((player) => {
      const status = player.status === 'alive' ? 'alive' : `out (wk ${player.elimination_week ?? '?'})`
      const cells = sortedWeeks.map((w) => {
        const pick = pickByPlayerWeek.get(`${player.id}:${w.id}`)
        if (!pick) return ''
        const game = (gamesByWeek.get(w.id) || []).find(
          (g) => g.home_team === pick.team || g.away_team === pick.team
        )
        let mark = ''
        if (game && game.result !== 'pending') {
          const won =
            (game.result === 'home_win' && pick.team === game.home_team) ||
            (game.result === 'away_win' && pick.team === game.away_team)
          mark = won ? ' (W)' : ' (L)'
        }
        return `${pick.team}${mark}${pick.auto_assigned ? ' [auto]' : ''}`
      })
      return [player.full_name, status, ...cells]
    })

    const csv = toCsv(header, rows)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="survivor-pick-grid.csv"',
      },
    })
  } catch (err) {
    console.error('export error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
