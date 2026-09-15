// Pool-internal analytics for the dashboard's editorial modules.
//
// Everything here is a pure function of data the dashboard already fetches —
// no DB access, no external stats feed. The point is to surface what the pool's
// own pick history implies but never states out loud: how concentrated the
// field's exposure is on a single result, who owns leverage if the chalk falls,
// and which teams are effectively spent.
//
// Reveal safety: the caller passes only *revealed* current-week picks (see
// isPickRevealed). Anything keyed off the current week therefore describes
// picks that are already public and can no longer be changed. Past weeks are
// public in full — the pick grid has always shown them.

import { NFL_TEAMS } from '@/types'

export interface InsightPlayer {
  id: string
  full_name: string
  status: string
  elimination_week: number | null
}

export interface InsightWeek {
  id: string
  week_number: number
}

export interface InsightPick {
  player_id: string
  week_id: string
  team: string
}

export interface InsightsInput {
  /** Real players in the season being played (internal test accounts already filtered out). */
  players: InsightPlayer[]
  /** This season's picks, real players only. */
  picks: InsightPick[]
  currentWeek: InsightWeek | null
  /** player_id -> team, current week, revealed picks only. */
  revealedCurrentPicks: Record<string, string>
  potSize: number
}

export interface ExposureRow {
  team: string
  count: number
  /** Survivors left if this team loses, counting only what is already public. */
  survivorsIfLoses: number
}

export interface ExposureModule {
  rows: ExposureRow[]
  aliveCount: number
  /** Alive players whose pick is public. */
  revealedCount: number
  /** Alive players whose pick is in but still hidden, plus those who haven't picked. */
  hiddenCount: number
  /** True once every alive player's pick is public — the scenario math is exact. */
  complete: boolean
  distinctTeams: number
  worstCase: ExposureRow | null
  /** Survivors guaranteed to remain no matter which single team loses. */
  floor: number
}

export interface LeverageRow {
  player_id: string
  full_name: string
  team: string
  /** Other survivors riding the same team. */
  sharedWith: number
  /** Field size if this pick wins and every other public pick loses. */
  bestCaseField: number
  /** Pot split across that best-case field. */
  impliedPayout: number
}

export interface LeverageModule {
  rows: LeverageRow[]
  /** Survivors sitting alone on a team nobody else took. */
  loneWolves: LeverageRow[]
  headline: string
  deck: string
}

export interface ScarcityRow {
  team: string
  /** Survivors who have already spent this team. */
  burnedBy: number
  /** Survivors who can still play it. */
  availableTo: number
}

export interface ScarcityModule {
  rows: ScarcityRow[]
  aliveCount: number
  /** Teams exactly one survivor can still play, with that survivor's name. */
  uniqueHolds: { team: string; holder: string }[]
  /** Teams no survivor can play again. */
  exhausted: string[]
}

export interface PoolInsights {
  exposure: ExposureModule | null
  leverage: LeverageModule | null
  scarcity: ScarcityModule | null
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export function computeInsights(input: InsightsInput): PoolInsights {
  const { players, picks, currentWeek, revealedCurrentPicks, potSize } = input

  const alive = players.filter((p) => p.status === 'alive')
  const nameById: Record<string, string> = {}
  for (const p of players) nameById[p.id] = p.full_name

  // Picks from weeks that are behind us. The current week is excluded because
  // its picks are only partly public and, for anyone still able to change one,
  // not yet spent.
  const pastPicks = picks.filter((p) => !currentWeek || p.week_id !== currentWeek.id)

  // Teams each survivor has spent: every past pick, plus this week's pick once
  // it is public and locked.
  const usedByPlayer: Record<string, Set<string>> = {}
  for (const p of alive) usedByPlayer[p.id] = new Set()
  for (const pick of pastPicks) {
    if (usedByPlayer[pick.player_id]) usedByPlayer[pick.player_id].add(pick.team)
  }
  for (const [playerId, team] of Object.entries(revealedCurrentPicks)) {
    if (usedByPlayer[playerId]) usedByPlayer[playerId].add(team)
  }

  return {
    exposure: buildExposure({ alive, revealedCurrentPicks, currentWeek }),
    leverage: buildLeverage({ alive, revealedCurrentPicks, potSize, nameById }),
    scarcity: buildScarcity({ alive, usedByPlayer, nameById, pastPicks }),
  }
}

function buildExposure({
  alive,
  revealedCurrentPicks,
  currentWeek,
}: {
  alive: InsightPlayer[]
  revealedCurrentPicks: Record<string, string>
  currentWeek: InsightWeek | null
}): ExposureModule | null {
  if (!currentWeek || alive.length === 0) return null

  const counts: Record<string, number> = {}
  let revealedCount = 0
  for (const p of alive) {
    const team = revealedCurrentPicks[p.id]
    if (!team) continue
    counts[team] = (counts[team] || 0) + 1
    revealedCount++
  }
  if (revealedCount === 0) return null

  const rows: ExposureRow[] = Object.entries(counts)
    .map(([team, count]) => ({ team, count, survivorsIfLoses: alive.length - count }))
    .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team))

  const complete = revealedCount === alive.length
  const worstCase = rows[0] ?? null
  const floor = alive.length - (worstCase?.count ?? 0)
  const hiddenCount = alive.length - revealedCount

  return {
    rows,
    aliveCount: alive.length,
    revealedCount,
    hiddenCount,
    complete,
    distinctTeams: rows.length,
    worstCase,
    floor,
  }
}

function buildLeverage({
  alive,
  revealedCurrentPicks,
  potSize,
  nameById,
}: {
  alive: InsightPlayer[]
  revealedCurrentPicks: Record<string, string>
  potSize: number
  nameById: Record<string, string>
}): LeverageModule | null {
  // "Alone on a team" is only true once every survivor's pick is public. Run
  // this mid-week, off a Thursday night reveal, and a player who merely happens
  // to be the first one public gets called a lone wolf while most of the field
  // is still hidden. Exposure is built to describe a partial picture honestly;
  // this module is not, so it waits.
  const revealed = alive.filter((p) => revealedCurrentPicks[p.id])
  if (revealed.length !== alive.length) return null

  const counts: Record<string, number> = {}
  for (const p of alive) {
    const team = revealedCurrentPicks[p.id]
    if (team) counts[team] = (counts[team] || 0) + 1
  }
  // Nothing to say when everyone left is riding the same result, or when there
  // are so few survivors that the standings already tell the whole story.
  if (Object.keys(counts).length < 2 || alive.length < 3) return null

  const rows: LeverageRow[] = alive
    .filter((p) => revealedCurrentPicks[p.id])
    .map((p) => {
      const team = revealedCurrentPicks[p.id]
      const count = counts[team]
      return {
        player_id: p.id,
        full_name: nameById[p.id] ?? p.full_name,
        team,
        sharedWith: count - 1,
        bestCaseField: count,
        impliedPayout: count > 0 ? Math.floor(potSize / count) : 0,
      }
    })
    .sort((a, b) => a.bestCaseField - b.bestCaseField || a.full_name.localeCompare(b.full_name))

  if (rows.length === 0) return null

  const loneWolves = rows.filter((r) => r.bestCaseField === 1)
  const chalk = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]

  let headline: string
  if (loneWolves.length === 1) {
    const w = loneWolves[0]
    headline = `${w.full_name} is alone on ${w.team}. If it wins and ${chalk[0]} doesn't, the pot goes from a ${chalk[1]}-way split to $${w.impliedPayout}.`
  } else if (loneWolves.length > 1) {
    headline = `${loneWolves.length} survivors are the only ones on their team. A bad day for ${chalk[0]} hands each of them the pool.`
  } else {
    const best = rows[0]
    headline = `Nobody is out on their own. The smallest bloc is ${best.bestCaseField} ${plural(best.bestCaseField, 'player', 'players')} on ${best.team}.`
  }

  return {
    rows,
    loneWolves,
    headline,
    deck: 'Best case assumes your team wins and every other public pick loses. It is the ceiling of a single Sunday, not a prediction.',
  }
}

function buildScarcity({
  alive,
  usedByPlayer,
  nameById,
  pastPicks,
}: {
  alive: InsightPlayer[]
  usedByPlayer: Record<string, Set<string>>
  nameById: Record<string, string>
  pastPicks: InsightPick[]
}): ScarcityModule | null {
  if (alive.length === 0 || pastPicks.length === 0) return null

  const rows: ScarcityRow[] = NFL_TEAMS.map((team) => {
    let burnedBy = 0
    for (const p of alive) {
      if (usedByPlayer[p.id]?.has(team)) burnedBy++
    }
    return { team, burnedBy, availableTo: alive.length - burnedBy }
  })

  const uniqueHolds: { team: string; holder: string }[] = []
  for (const row of rows) {
    if (row.availableTo !== 1 || row.burnedBy === 0) continue
    const holder = alive.find((p) => !usedByPlayer[p.id]?.has(row.team))
    if (holder) uniqueHolds.push({ team: row.team, holder: nameById[holder.id] ?? holder.full_name })
  }

  const exhausted = rows.filter((r) => r.availableTo === 0).map((r) => r.team)

  return {
    rows,
    aliveCount: alive.length,
    uniqueHolds,
    exhausted,
  }
}
