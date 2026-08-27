// Pool-internal analytics for the dashboard's editorial modules.
//
// Everything here is a pure function of data the dashboard already fetches —
// no DB access, no external stats feed. The point is to surface what the pool's
// own pick history implies but never states out loud: how concentrated the
// field's exposure is on a single result, who owns leverage if the chalk falls,
// which teams are effectively spent, and how alike the survivors' remaining
// boards have become.
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

export interface InsightGame {
  week_id: string
  home_team: string
  away_team: string
  result: string
}

export interface InsightsInput {
  /** Real players in the season being played (internal test accounts already filtered out). */
  players: InsightPlayer[]
  /** This season's weeks, ascending by week_number. */
  weeks: InsightWeek[]
  /** This season's picks, real players only. */
  picks: InsightPick[]
  games: InsightGame[]
  currentWeek: InsightWeek | null
  /** player_id -> team, current week, revealed picks only. */
  revealedCurrentPicks: Record<string, string>
  /** Count of alive players who have submitted a pick, revealed or not. */
  picksMade: number
  potSize: number
  totalWeeks: number
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
  headline: string
  deck: string
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
  /** Teams no survivor has spent yet — everyone's future competition. */
  untouched: string[]
  /** Teams no survivor can play again. */
  exhausted: string[]
  headline: string
  deck: string
}

export interface OverlapModule {
  /** Mean pairwise overlap of survivors' unused teams, 0–1. */
  average: number
  mostAlike: { a: string; b: string; overlap: number } | null
  mostDivergent: { a: string; b: string; overlap: number } | null
  headline: string
  deck: string
}

export interface ChalkWeek {
  week_number: number
  team: string
  count: number
  totalPicks: number
  outcome: 'won' | 'lost' | 'unknown'
  eliminated: number
}

export interface ChalkModule {
  weeks: ChalkWeek[]
  wins: number
  decided: number
  worstWeek: ChalkWeek | null
  /** Alive players ranked by how rarely they rode the week's most-picked team. */
  contrarians: { player_id: string; full_name: string; offChalk: number; weeks: number }[]
  headline: string
  deck: string
}

export interface TrajectoryPoint {
  week_number: number
  remaining: number
  eliminated: number
  /** Team that took out the most players that week, if any. */
  topTeam: string | null
}

export interface TrajectoryModule {
  points: TrajectoryPoint[]
  start: number
  aliveCount: number
  bloodiest: TrajectoryPoint | null
  /** First week the field was at or below half its starting size. */
  halvingWeek: number | null
  /** Week the pool resolves to one at the season's observed attrition rate. */
  projectedEndWeek: number | null
  /** True when the projection runs past the end of the regular season. */
  projectionOverruns: boolean
  headline: string
  deck: string
}

export interface PoolInsights {
  exposure: ExposureModule | null
  leverage: LeverageModule | null
  scarcity: ScarcityModule | null
  overlap: OverlapModule | null
  chalk: ChalkModule | null
  trajectory: TrajectoryModule | null
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** player+week -> team, so the per-week scans below stay linear. */
function indexPicks(picks: InsightPick[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const p of picks) m.set(`${p.player_id}:${p.week_id}`, p.team)
  return m
}

/** Teams that won their game, keyed by week. Ties count as losses for pickers. */
function buildWinners(games: InsightGame[]): Record<string, Set<string>> {
  const winners: Record<string, Set<string>> = {}
  for (const g of games) {
    if (g.result !== 'home_win' && g.result !== 'away_win') continue
    if (!winners[g.week_id]) winners[g.week_id] = new Set()
    winners[g.week_id].add(g.result === 'home_win' ? g.home_team : g.away_team)
  }
  return winners
}

export function computeInsights(input: InsightsInput): PoolInsights {
  const { players, weeks, picks, games, currentWeek, revealedCurrentPicks, picksMade, potSize, totalWeeks } = input

  const alive = players.filter((p) => p.status === 'alive')
  const nameById: Record<string, string> = {}
  for (const p of players) nameById[p.id] = p.full_name

  const winnersByWeek = buildWinners(games)

  // Picks from weeks that are behind us. The current week is excluded because
  // its picks are only partly public and, for anyone still able to change one,
  // not yet spent.
  const pastPicks = picks.filter((p) => !currentWeek || p.week_id !== currentWeek.id)
  const completedWeeks = weeks.filter((w) => !currentWeek || w.week_number < currentWeek.week_number)

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
    exposure: buildExposure({ alive, revealedCurrentPicks, picksMade, currentWeek }),
    leverage: buildLeverage({ alive, revealedCurrentPicks, potSize, nameById }),
    scarcity: buildScarcity({ alive, usedByPlayer, nameById, pastPicks }),
    overlap: buildOverlap({ alive, usedByPlayer, completedWeeks }),
    chalk: buildChalk({ players, alive, pastPicks, completedWeeks, winnersByWeek, nameById }),
    trajectory: buildTrajectory({ players, alive, completedWeeks, pastPicks, weeks, totalWeeks }),
  }
}

function buildExposure({
  alive,
  revealedCurrentPicks,
  picksMade,
  currentWeek,
}: {
  alive: InsightPlayer[]
  revealedCurrentPicks: Record<string, string>
  picksMade: number
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
  const topShare = worstCase ? worstCase.count / revealedCount : 0

  let headline: string
  if (!worstCase) {
    headline = 'No picks are public yet.'
  } else if (rows.length === 1 && complete) {
    headline = `Every survivor is on ${worstCase.team}. One result decides the week for all of them.`
  } else if (topShare >= 0.5) {
    headline = `${worstCase.count} of ${revealedCount} public ${plural(revealedCount, 'pick sits', 'picks sit')} on ${worstCase.team} — one loss would cut the field to ${worstCase.survivorsIfLoses}.`
  } else if (rows.length >= Math.max(3, revealedCount * 0.6)) {
    headline = `The field is scattered across ${rows.length} teams. No single result costs more than ${worstCase.count} ${plural(worstCase.count, 'player', 'players')}.`
  } else {
    headline = `${worstCase.team} carries ${worstCase.count} of the ${revealedCount} public ${plural(revealedCount, 'pick', 'picks')} — the week's biggest single exposure.`
  }

  const hiddenCount = alive.length - revealedCount
  const deck = complete
    ? `All ${alive.length} survivors' picks are public. The worst Sunday the pool can have leaves ${floor} alive.`
    : `${revealedCount} of ${alive.length} survivor ${plural(revealedCount, 'pick is', 'picks are')} public so far — ${picksMade - revealedCount > 0 ? `${picksMade - revealedCount} in but still hidden, ` : ''}${alive.length - picksMade} not yet made. Bars fill in as each game locks.`

  return {
    rows,
    aliveCount: alive.length,
    revealedCount,
    hiddenCount,
    complete,
    distinctTeams: rows.length,
    worstCase,
    floor,
    headline,
    deck,
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

  const untouched = rows.filter((r) => r.burnedBy === 0).map((r) => r.team)
  const exhausted = rows.filter((r) => r.availableTo === 0).map((r) => r.team)
  const spent = rows.filter((r) => r.burnedBy > 0)

  let headline: string
  if (exhausted.length > 0) {
    headline = `${exhausted.length} ${plural(exhausted.length, 'team is', 'teams are')} gone for good — no survivor can play ${exhausted.length === 1 ? exhausted[0] : exhausted.slice(0, 3).join(', ')} again.`
  } else if (uniqueHolds.length > 0) {
    const u = uniqueHolds[0]
    headline = `${u.holder} is the last survivor who can still play ${u.team}.`
  } else if (spent.length > 0) {
    const hottest = [...spent].sort((a, b) => b.burnedBy - a.burnedBy)[0]
    headline = `${hottest.burnedBy} of ${alive.length} survivors have already spent ${hottest.team}. ${untouched.length} teams remain untouched by anyone.`
  } else {
    headline = `Every team is still on the board for every survivor.`
  }

  return {
    rows,
    aliveCount: alive.length,
    uniqueHolds,
    untouched,
    exhausted,
    headline,
    deck: 'Darker cells are closer to spent. A team the whole field has burned can never be the popular pick again — and a team only you hold is the cheapest way to break away.',
  }
}

function buildOverlap({
  alive,
  usedByPlayer,
  completedWeeks,
}: {
  alive: InsightPlayer[]
  usedByPlayer: Record<string, Set<string>>
  completedWeeks: InsightWeek[]
}): OverlapModule | null {
  // Before a few weeks are in the books every board is nearly identical, so the
  // number carries no information.
  if (alive.length < 3 || completedWeeks.length < 3) return null

  const unused: Record<string, Set<string>> = {}
  for (const p of alive) {
    const used = usedByPlayer[p.id] ?? new Set<string>()
    unused[p.id] = new Set(NFL_TEAMS.filter((t) => !used.has(t)))
  }

  let sum = 0
  let pairs = 0
  let mostAlike: { a: string; b: string; overlap: number } | null = null
  let mostDivergent: { a: string; b: string; overlap: number } | null = null

  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = unused[alive[i].id]
      const b = unused[alive[j].id]
      let shared = 0
      for (const t of a) if (b.has(t)) shared++
      const union = a.size + b.size - shared
      const overlap = union > 0 ? shared / union : 0
      sum += overlap
      pairs++
      const entry = { a: alive[i].full_name, b: alive[j].full_name, overlap }
      if (!mostAlike || overlap > mostAlike.overlap) mostAlike = entry
      if (!mostDivergent || overlap < mostDivergent.overlap) mostDivergent = entry
    }
  }

  if (pairs === 0) return null
  const average = sum / pairs

  let headline: string
  if (average >= 0.8) {
    headline = `Survivors' remaining boards are ${pct(average)} identical. The field is running out of ways to differ.`
  } else if (average <= 0.6) {
    headline = `Survivors have taken genuinely different paths — remaining boards overlap just ${pct(average)}.`
  } else {
    headline = `Remaining boards overlap ${pct(average)} on average. The field is converging, not yet locked together.`
  }

  const deck = mostAlike && mostDivergent
    ? `${mostAlike.a} and ${mostAlike.b} are ${pct(mostAlike.overlap)} alike — they will keep facing the same board. ${mostDivergent.a} and ${mostDivergent.b} share the least at ${pct(mostDivergent.overlap)}.`
    : 'Overlap measures how much of two survivors’ unused rosters is the same.'

  return { average, mostAlike, mostDivergent, headline, deck }
}

function buildChalk({
  players,
  alive,
  pastPicks,
  completedWeeks,
  winnersByWeek,
  nameById,
}: {
  players: InsightPlayer[]
  alive: InsightPlayer[]
  pastPicks: InsightPick[]
  completedWeeks: InsightWeek[]
  winnersByWeek: Record<string, Set<string>>
  nameById: Record<string, string>
}): ChalkModule | null {
  if (completedWeeks.length === 0) return null

  const picksByWeek: Record<string, InsightPick[]> = {}
  for (const pick of pastPicks) {
    if (!picksByWeek[pick.week_id]) picksByWeek[pick.week_id] = []
    picksByWeek[pick.week_id].push(pick)
  }

  const modalByWeek: Record<string, string> = {}
  const weeksOut: ChalkWeek[] = []

  for (const w of completedWeeks) {
    const weekPicks = picksByWeek[w.id] ?? []
    if (weekPicks.length === 0) continue
    const counts: Record<string, number> = {}
    for (const p of weekPicks) counts[p.team] = (counts[p.team] || 0) + 1
    const [team, count] = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    modalByWeek[w.id] = team

    const winners = winnersByWeek[w.id]
    const outcome: ChalkWeek['outcome'] = !winners || winners.size === 0 ? 'unknown' : winners.has(team) ? 'won' : 'lost'
    const eliminated = players.filter((p) => p.elimination_week === w.week_number).length

    weeksOut.push({ week_number: w.week_number, team, count, totalPicks: weekPicks.length, outcome, eliminated })
  }

  if (weeksOut.length === 0) return null

  const decided = weeksOut.filter((w) => w.outcome !== 'unknown')
  const wins = decided.filter((w) => w.outcome === 'won').length
  const losses = decided.filter((w) => w.outcome === 'lost')
  const worstWeek = losses.sort((a, b) => b.eliminated - a.eliminated)[0] ?? null

  // How often each survivor went off the week's most-picked team.
  const pickIndex = indexPicks(pastPicks)
  const contrarians = alive
    .map((p) => {
      let offChalk = 0
      let weeksPlayed = 0
      for (const w of completedWeeks) {
        const modal = modalByWeek[w.id]
        if (!modal) continue
        const team = pickIndex.get(`${p.id}:${w.id}`)
        if (!team) continue
        weeksPlayed++
        if (team !== modal) offChalk++
      }
      return { player_id: p.id, full_name: nameById[p.id] ?? p.full_name, offChalk, weeks: weeksPlayed }
    })
    .filter((r) => r.weeks > 0)
    .sort((a, b) => b.offChalk - a.offChalk || a.full_name.localeCompare(b.full_name))

  let headline: string
  if (decided.length === 0) {
    headline = `The most-picked team is still waiting on results.`
  } else if (worstWeek) {
    headline = `Following the crowd has worked ${wins} of ${decided.length} weeks — and the week it didn't, ${worstWeek.team} took ${worstWeek.eliminated} ${plural(worstWeek.eliminated, 'player', 'players')} down with it.`
  } else {
    headline = `The most-picked team has won all ${decided.length} decided ${plural(decided.length, 'week', 'weeks')}. Nobody has been punished for riding the chalk yet.`
  }

  const topContrarian = contrarians[0]
  const deck = topContrarian && topContrarian.offChalk > 0
    ? `${topContrarian.full_name} has gone against the crowd ${topContrarian.offChalk} of ${topContrarian.weeks} ${plural(topContrarian.weeks, 'week', 'weeks')} and is still alive.`
    : 'Every survivor left has ridden the most-picked team in most weeks.'

  return { weeks: weeksOut, wins, decided: decided.length, worstWeek, contrarians, headline, deck }
}

function buildTrajectory({
  players,
  alive,
  completedWeeks,
  pastPicks,
  weeks,
  totalWeeks,
}: {
  players: InsightPlayer[]
  alive: InsightPlayer[]
  completedWeeks: InsightWeek[]
  pastPicks: InsightPick[]
  weeks: InsightWeek[]
  totalWeeks: number
}): TrajectoryModule | null {
  if (completedWeeks.length === 0 || players.length === 0) return null

  const weekIdByNumber: Record<number, string> = {}
  for (const w of weeks) weekIdByNumber[w.week_number] = w.id
  const pickIndex = indexPicks(pastPicks)

  const points: TrajectoryPoint[] = completedWeeks.map((w) => {
    const out = players.filter((p) => p.elimination_week === w.week_number)
    const remaining = players.length - players.filter((p) => p.elimination_week !== null && p.elimination_week <= w.week_number).length

    // Team most responsible for that week's eliminations.
    const counts: Record<string, number> = {}
    for (const p of out) {
      const key = pickIndex.get(`${p.id}:${weekIdByNumber[w.week_number]}`) ?? 'no pick'
      counts[key] = (counts[key] || 0) + 1
    }
    const topTeam = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return { week_number: w.week_number, remaining, eliminated: out.length, topTeam }
  })

  const bloodiest = [...points].sort((a, b) => b.eliminated - a.eliminated)[0] ?? null
  const half = players.length / 2
  const halvingWeek = points.find((p) => p.remaining <= half)?.week_number ?? null

  // Attrition compounded over the weeks actually played, extended forward. A
  // rate this crude is only worth stating as "at this rate", never as a forecast.
  let projectedEndWeek: number | null = null
  let projectionOverruns = false
  const weeksPlayed = points.length
  const survivalRate = players.length > 0 && weeksPlayed > 0 ? Math.pow(alive.length / players.length, 1 / weeksPlayed) : 1
  if (alive.length > 1 && survivalRate > 0 && survivalRate < 1) {
    const weeksToOne = Math.log(1 / alive.length) / Math.log(survivalRate)
    const lastWeek = points[points.length - 1].week_number
    const projected = Math.ceil(lastWeek + weeksToOne)
    projectionOverruns = projected > totalWeeks
    projectedEndWeek = projectionOverruns ? null : projected
  }

  let headline: string
  if (alive.length === 1) {
    headline = `${alive[0].full_name} is the last one standing.`
  } else if (bloodiest && bloodiest.eliminated > 0) {
    const share = bloodiest.eliminated / Math.max(players.length - alive.length, 1)
    headline = share >= 0.4
      ? `Week ${bloodiest.week_number} did most of the damage — ${bloodiest.eliminated} of the ${players.length - alive.length} eliminations came in that single Sunday.`
      : `${players.length - alive.length} of ${players.length} entries are gone. Week ${bloodiest.week_number} was the bloodiest at ${bloodiest.eliminated}.`
  } else {
    headline = `All ${players.length} entries are still alive.`
  }

  let deck: string
  if (projectedEndWeek) {
    deck = `At the season's observed attrition rate, the pool resolves to one around Week ${projectedEndWeek}.`
  } else if (projectionOverruns) {
    deck = `At this rate the field would still have survivors when Week ${totalWeeks} ends — a split, not a winner.`
  } else {
    deck = `Not enough attrition yet to project an end date.`
  }
  if (halvingWeek) deck = `The field was cut in half by Week ${halvingWeek}. ${deck}`

  return {
    points,
    start: players.length,
    aliveCount: alive.length,
    bloodiest,
    halvingWeek,
    projectedEndWeek,
    projectionOverruns,
    headline,
    deck,
  }
}
