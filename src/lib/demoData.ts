// TEMPORARY — local UI development only. Gated behind UI_DEMO and never
// reachable in production. Generates a realistic mid-season pool so every
// dashboard module renders against the real derivation code paths.
//
//   UI_DEMO=1  → mid-week: Thursday pick public, Sunday cutoff still ahead
//   UI_DEMO=2  → Sunday cutoff passed: every pick public, games ungraded
//
// Delete this file (and its two call sites in src/app/page.tsx) before committing.

import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { NFL_TEAMS } from '@/types'

const CHICAGO_TZ = 'America/Chicago'
const SEASON = 2026
const CURRENT_WEEK = 8
const TOTAL_WEEKS = 18

// Deterministic PRNG so the fixture is stable across reloads.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// Rough tiering so the "chalk" behaves like chalk: favourites get picked more
// and win more, which is what makes the crowd-following modules meaningful.
const STRENGTH: Record<string, number> = {
  KC: 0.92, BUF: 0.9, PHI: 0.88, BAL: 0.87, DET: 0.86, SF: 0.84, GB: 0.82, HOU: 0.8,
  LAR: 0.78, MIN: 0.77, CIN: 0.76, TB: 0.74, LAC: 0.73, DEN: 0.72, PIT: 0.7, SEA: 0.68,
  WSH: 0.66, ARI: 0.6, ATL: 0.58, DAL: 0.57, IND: 0.56, MIA: 0.54, CHI: 0.5, NYJ: 0.46,
  JAX: 0.44, NO: 0.42, LV: 0.4, NE: 0.38, NYG: 0.34, TEN: 0.3, CLE: 0.28, CAR: 0.26,
}

const NAMES = [
  'Griffin Sell', 'Tyler Herman', 'Maddie Okoro', 'Ben Whitaker', 'Priya Raman',
  'Dane Kolstad', 'Alexis Boone', 'Marcus Delgado', 'Nora Feldman', 'Sam Tran',
  'Jordan Reyes', 'Katie Lindqvist', 'Owen Brzezinski', 'Hana Sato', 'Chris Mulvaney',
  'Devin Achebe', 'Lauren Stotz', 'Ryan Kaminski', 'Simone Nkemdirim', 'Paul Vandenberg',
  'Erica Holloway', 'Mo Farouk', 'Trevor Nyquist', 'Bianca Ferrante', 'Josh Sandoval',
  'Ali Mansour', 'Renee Duchamp', 'Cole Vandersteen', 'Yuki Hoffman', 'Drew Pallas',
  'Nina Castellano', 'Ike Osei', 'Brett Lawler', 'Camila Rojas',
]

/** Noon Central on the Sunday of the calendar week containing `ref`, offset by `weekOffset` weeks. */
function sundayNoonCT(ref: Date, weekOffset: number): Date {
  const local = toZonedTime(ref, CHICAGO_TZ)
  const sunday = new Date(local)
  sunday.setDate(local.getDate() - local.getDay() + weekOffset * 7)
  sunday.setHours(12, 0, 0, 0)
  return fromZonedTime(sunday, CHICAGO_TZ)
}

const HOUR = 3600_000
const DAY = 24 * HOUR

export interface DemoSet {
  weeks: { id: string; week_number: number; season_year: number; is_active: boolean; created_at: string }[]
  players: {
    id: string
    full_name: string
    email: string
    status: string
    elimination_week: number | null
    elimination_reason: string | null
    paid: boolean
  }[]
  picks: { player_id: string; week_id: string; team: string }[]
  games: {
    id: string
    week_id: string
    home_team: string
    away_team: string
    game_day: string
    kickoff_central: string
    is_snf: boolean
    is_mnf: boolean
    result: string
    created_at: string
  }[]
}

export function buildDemoData(mode: '1' | '2'): DemoSet {
  const rand = rng(20260827)
  const now = new Date()

  // Anchor the current week's Sunday cutoff either just ahead of now (mode 1)
  // or just behind it (mode 2).
  let currentSunday = sundayNoonCT(now, 0)
  if (mode === '1') {
    while (currentSunday <= now) currentSunday = new Date(currentSunday.getTime() + 7 * DAY)
  } else {
    while (currentSunday > now) currentSunday = new Date(currentSunday.getTime() - 7 * DAY)
  }

  const weeks = Array.from({ length: TOTAL_WEEKS }, (_, i) => {
    const n = i + 1
    return {
      id: `demo-week-${n}`,
      week_number: n,
      season_year: SEASON,
      is_active: n === CURRENT_WEEK,
      created_at: new Date(now.getTime() - 200 * DAY).toISOString(),
    }
  })

  const sundayOf = (weekNumber: number) =>
    new Date(currentSunday.getTime() + (weekNumber - CURRENT_WEEK) * 7 * DAY)

  // ---- Schedule: 16 games a week, every team playing once. ----
  const games: DemoSet['games'] = []
  const scheduleByWeek: Record<number, { home: string; away: string }[]> = {}

  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    const pool = [...NFL_TEAMS]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const pairs: { home: string; away: string }[] = []
    for (let i = 0; i < pool.length; i += 2) pairs.push({ home: pool[i], away: pool[i + 1] })
    scheduleByWeek[w] = pairs

    const sunday = sundayOf(w)
    // Thursday night, three Sunday windows, Sunday night, Monday night.
    const thursday = new Date(sunday.getTime() - 3 * DAY + 7.5 * HOUR)
    pairs.forEach((pair, idx) => {
      let kickoff: Date
      let day = 'sunday'
      let snf = false
      let mnf = false
      if (idx === 0) {
        // In mid-week mode the current week's Thursday game must already have
        // kicked off, otherwise nothing is public and the week's modules have
        // nothing to draw.
        kickoff = w === CURRENT_WEEK && thursday > now ? new Date(now.getTime() - 5 * HOUR) : thursday
        day = 'thursday'
      } else if (idx === pairs.length - 1) {
        kickoff = new Date(sunday.getTime() + DAY + 7.3 * HOUR)
        day = 'monday'
        mnf = true
      } else if (idx === pairs.length - 2) {
        kickoff = new Date(sunday.getTime() + 7.3 * HOUR)
        snf = true
      } else if (idx < 9) {
        kickoff = new Date(sunday.getTime() + 0.25 * HOUR)
      } else {
        kickoff = new Date(sunday.getTime() + 3.25 * HOUR)
      }
      games.push({
        id: `demo-game-${w}-${idx}`,
        week_id: `demo-week-${w}`,
        home_team: pair.home,
        away_team: pair.away,
        game_day: day,
        kickoff_central: kickoff.toISOString(),
        is_snf: snf,
        is_mnf: mnf,
        result: 'pending',
        created_at: new Date(now.getTime() - 100 * DAY).toISOString(),
      })
    })
  }

  // ---- Results for completed weeks: favourite wins ~70% of the time. ----
  const winnersByWeek: Record<number, Set<string>> = {}
  for (let w = 1; w < CURRENT_WEEK; w++) {
    const winners = new Set<string>()
    for (const g of games.filter((g) => g.week_id === `demo-week-${w}`)) {
      const hs = STRENGTH[g.home_team] ?? 0.5
      const as = STRENGTH[g.away_team] ?? 0.5
      // Logistic on the strength gap plus a small home bump: big favourites
      // hold up, so the pool thins at a survivor-pool pace instead of halving
      // every Sunday.
      const homeEdge = 1 / (1 + Math.exp(-((hs - as) * 11 + 0.3)))
      const homeWins = rand() < homeEdge
      g.result = homeWins ? 'home_win' : 'away_win'
      winners.add(homeWins ? g.home_team : g.away_team)
    }
    winnersByWeek[w] = winners
  }

  // ---- Players and their week-by-week picks. ----
  const players: DemoSet['players'] = NAMES.map((name, i) => ({
    id: `demo-player-${i}`,
    full_name: name,
    email: `demo${i}@example.com`,
    status: 'alive',
    elimination_week: null,
    elimination_reason: null,
    paid: i < NAMES.length - 2,
  }))

  const picks: DemoSet['picks'] = []
  const used: Record<string, Set<string>> = {}
  for (const p of players) used[p.id] = new Set()

  // A per-player taste for the crowd: low values chase the favourite, high
  // values wander, which is what the chalk/contrarian module reads.
  const independence = players.map((_, i) => 0.05 + rand() * (i % 4 === 0 ? 0.34 : 0.13))

  for (let w = 1; w <= CURRENT_WEEK; w++) {
    const weekGames = games.filter((g) => g.week_id === `demo-week-${w}`)
    const teamsThisWeek = weekGames.flatMap((g) => [g.home_team, g.away_team])

    players.forEach((p, i) => {
      if (p.status === 'eliminated') return
      const candidates = teamsThisWeek
        .filter((t) => !used[p.id].has(t))
        .map((t) => ({ team: t, score: (STRENGTH[t] ?? 0.5) + (rand() - 0.5) * independence[i] * 2 }))
        .sort((a, b) => b.score - a.score)
      if (candidates.length === 0) return
      const team = candidates[0].team
      used[p.id].add(team)
      picks.push({ player_id: p.id, week_id: `demo-week-${w}`, team })
    })

    if (w < CURRENT_WEEK) {
      const winners = winnersByWeek[w]
      for (const p of players) {
        if (p.status === 'eliminated') continue
        const pick = picks.find((pk) => pk.player_id === p.id && pk.week_id === `demo-week-${w}`)
        if (!pick || winners.has(pick.team)) continue
        p.status = 'eliminated'
        p.elimination_week = w
        p.elimination_reason = `${pick.team} lost`
      }
    }
  }

  // Leave a couple of survivors without a Week 8 pick in mid-week mode so the
  // "picks pending" state is exercised.
  if (mode === '1') {
    const aliveIds = players.filter((p) => p.status === 'alive').map((p) => p.id)
    const skip = new Set(aliveIds.slice(-2))
    for (let i = picks.length - 1; i >= 0; i--) {
      if (picks[i].week_id === `demo-week-${CURRENT_WEEK}` && skip.has(picks[i].player_id)) picks.splice(i, 1)
    }
  }

  // Put the week's most-popular team in the Thursday slot so mid-week mode has
  // a real block of public picks alongside the still-hidden ones.
  if (mode === '1') {
    const counts: Record<string, number> = {}
    for (const pk of picks) {
      if (pk.week_id !== `demo-week-${CURRENT_WEEK}`) continue
      const owner = players.find((p) => p.id === pk.player_id)
      if (owner?.status === 'alive') counts[pk.team] = (counts[pk.team] || 0) + 1
    }
    const modal = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
    const weekGames = games.filter((g) => g.week_id === `demo-week-${CURRENT_WEEK}`)
    const thursdayGame = weekGames[0]
    const modalGame = modal ? weekGames.find((g) => g.home_team === modal || g.away_team === modal) : undefined
    if (modal && modalGame && modalGame !== thursdayGame) {
      const slot = { kickoff: thursdayGame.kickoff_central, day: thursdayGame.game_day, snf: thursdayGame.is_snf, mnf: thursdayGame.is_mnf }
      thursdayGame.kickoff_central = modalGame.kickoff_central
      thursdayGame.game_day = modalGame.game_day
      thursdayGame.is_snf = modalGame.is_snf
      thursdayGame.is_mnf = modalGame.is_mnf
      modalGame.kickoff_central = slot.kickoff
      modalGame.game_day = slot.day
      modalGame.is_snf = slot.snf
      modalGame.is_mnf = slot.mnf
    }
  }

  return { weeks, players, picks, games }
}
