import writeExcelFile, { type Cell, type SheetData } from 'write-excel-file/node'
import { isPickRevealed } from '@/lib/deadline'
import { getDb, getEffectiveNow } from '@/lib/testMode'
import type { Game } from '@/types'

export const dynamic = 'force-dynamic'

type ExportWeek = {
  id: string
  week_number: number
  season_year: number
  is_active: boolean
}

type ExportPlayer = {
  id: string
  full_name: string
  status: string
  elimination_week: number | null
}

type ExportPick = {
  player_id: string
  week_id: string
  team: string
}

type ExportGame = {
  week_id: string
  home_team: string
  away_team: string
  result: string
  kickoff_central: string
}

const headerCell = (value: string, align: 'left' | 'center' = 'center'): Cell => ({
  value,
  fontWeight: 'bold',
  textColor: '#FFFFFF',
  backgroundColor: '#1A1A1A',
  borderColor: '#D8D3CB',
  borderStyle: 'thin',
  align,
  alignVertical: 'center',
  height: 28,
})

export async function GET() {
  try {
    const supabase = await getDb()
    const [weeksRes, playersRes, picksRes, gamesRes] = await Promise.all([
      supabase.from('weeks').select('id, week_number, season_year, is_active').order('week_number'),
      supabase
        .from('players')
        .select('id, full_name, status, elimination_week')
        .not('email', 'like', '%@nflsurvivor.internal')
        .order('full_name'),
      supabase.from('picks').select('player_id, week_id, team'),
      supabase.from('games').select('week_id, home_team, away_team, result, kickoff_central'),
    ])

    const queryError = weeksRes.error || playersRes.error || picksRes.error || gamesRes.error
    if (queryError) throw queryError

    const allWeeks = (weeksRes.data ?? []) as ExportWeek[]
    const players = (playersRes.data ?? []) as ExportPlayer[]
    const allPicks = (picksRes.data ?? []) as ExportPick[]
    const allGames = (gamesRes.data ?? []) as ExportGame[]
    const activeWeek = allWeeks.find((week) => week.is_active)
    const seasonAnchor = activeWeek ?? allWeeks.slice().sort((a, b) => b.season_year - a.season_year)[0]
    const seasonWeeks = allWeeks
      .filter((week) => !seasonAnchor || week.season_year === seasonAnchor.season_year)
      .sort((a, b) => a.week_number - b.week_number)

    const realPlayerIds = new Set(players.map((player) => player.id))
    const seasonWeekIds = new Set(seasonWeeks.map((week) => week.id))
    const seasonPicks = allPicks.filter(
      (pick) => seasonWeekIds.has(pick.week_id) && realPlayerIds.has(pick.player_id)
    )
    const pickedWeekIds = new Set(seasonPicks.map((pick) => pick.week_id))
    const lastPickedWeek = seasonWeeks.reduce(
      (max, week) => pickedWeekIds.has(week.id) ? Math.max(max, week.week_number) : max,
      0
    )
    const finalWeekNumber = activeWeek?.week_number ?? lastPickedWeek
    const includedWeeks = seasonWeeks.filter((week) => week.week_number <= finalWeekNumber)
    const includedWeekIds = new Set(includedWeeks.map((week) => week.id))
    const includedPicks = seasonPicks.filter((pick) => includedWeekIds.has(pick.week_id))

    const pickMap = new Map(includedPicks.map((pick) => [`${pick.player_id}:${pick.week_id}`, pick.team]))
    const pickCountByPlayer = new Map<string, number>()
    for (const pick of includedPicks) {
      pickCountByPlayer.set(pick.player_id, (pickCountByPlayer.get(pick.player_id) ?? 0) + 1)
    }

    const sortedPlayers = players.slice().sort((a, b) => {
      if (a.status !== b.status) return a.status === 'alive' ? -1 : 1
      if (a.status === 'alive') {
        const countDifference = (pickCountByPlayer.get(b.id) ?? 0) - (pickCountByPlayer.get(a.id) ?? 0)
        if (countDifference !== 0) return countDifference
      } else {
        const eliminationDifference = (b.elimination_week ?? 0) - (a.elimination_week ?? 0)
        if (eliminationDifference !== 0) return eliminationDifference
      }
      return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
    })

    const gamesByWeek = new Map<string, Game[]>()
    for (const game of allGames) {
      const games = gamesByWeek.get(game.week_id) ?? []
      games.push(game as unknown as Game)
      gamesByWeek.set(game.week_id, games)
    }
    const now = await getEffectiveNow()

    const sheetData: SheetData = [
      [headerCell('Player', 'left'), ...includedWeeks.map((week) => headerCell(`Week ${week.week_number}`))],
      ...sortedPlayers.map((player) => [
        {
          value: player.full_name,
          fontWeight: 'bold' as const,
          borderColor: '#D8D3CB',
          bottomBorderStyle: 'thin' as const,
          alignVertical: 'center' as const,
          height: 22,
        },
        ...includedWeeks.map((week): Cell => {
          const team = pickMap.get(`${player.id}:${week.id}`)
          const value = !team
            ? ''
            : isPickRevealed(team, gamesByWeek.get(week.id) ?? [], now)
              ? team
              : 'Hidden'
          return {
            value,
            align: 'center',
            alignVertical: 'center',
            borderColor: '#D8D3CB',
            bottomBorderStyle: 'thin',
          }
        }),
      ]),
    ]

    const workbook = await writeExcelFile(
      sheetData,
      {
        sheet: 'Pick Grid',
        columns: [{ width: 28 }, ...includedWeeks.map(() => ({ width: 12 }))],
        stickyRowsCount: 1,
        stickyColumnsCount: 1,
        showGridLines: false,
        zoomScale: 1,
      },
      { fontFamily: 'Arial', fontSize: 11 }
    ).toBuffer()

    const seasonLabel = seasonAnchor?.season_year ?? new Date().getFullYear()
    const weekLabel = finalWeekNumber > 0 ? `-through-week-${finalWeekNumber}` : ''
    return new Response(new Uint8Array(workbook), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="nfl-survivor-${seasonLabel}-pick-grid${weekLabel}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Pick grid Excel export failed:', error)
    return Response.json({ error: 'Unable to export the pick grid.' }, { status: 500 })
  }
}
