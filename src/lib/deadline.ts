import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { Game } from '@/types'

const CHICAGO_TZ = 'America/Chicago'

// Given a game, return the UTC timestamp of when picks for that game lock.
// Deadline is whichever comes first: the game's own kickoff, or that week's
// Sunday 12:00 PM Central cutoff. This locks Thu/Fri/Sat games — and any
// Sunday game that kicks off before noon Central (e.g. an early international
// window) — at their own kickoff, while normal Sunday afternoon/SNF/MNF games
// all share the Sunday-noon cutoff.
export function getPickDeadline(game: Game): Date {
  const kickoff = new Date(game.kickoff_central)
  const chicagoKickoff = toZonedTime(kickoff, CHICAGO_TZ)

  // Sunday of the week this game falls in: Thu/Fri/Sat (4/5/6) belong to the
  // upcoming Sunday, Sun/Mon/Tue/Wed (0/1/2/3) belong to the Sunday already passed.
  const dow = chicagoKickoff.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToSunday = dow >= 4 ? 7 - dow : -dow
  const sunday = new Date(chicagoKickoff)
  sunday.setDate(chicagoKickoff.getDate() + daysToSunday)
  sunday.setHours(12, 0, 0, 0) // 12:00 PM
  const sundayNoon = fromZonedTime(sunday, CHICAGO_TZ)

  return kickoff < sundayNoon ? kickoff : sundayNoon
}

// Given a week's games, find the deadline for a specific team's pick
export function getTeamDeadline(team: string, games: Game[]): Date | null {
  const game = games.find(g => g.home_team === team || g.away_team === team)
  if (!game) return null
  return getPickDeadline(game)
}

// Format a UTC date as a human-readable Central time string
export function formatCentralTime(utcDate: Date | string): string {
  const d = typeof utcDate === 'string' ? new Date(utcDate) : utcDate
  return d.toLocaleString('en-US', {
    timeZone: CHICAGO_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

// Returns true if the pick deadline for a given team has passed
export function isDeadlinePassed(team: string, games: Game[]): boolean {
  const deadline = getTeamDeadline(team, games)
  if (!deadline) return false
  return new Date() >= deadline
}

// Find the SNF game in a week's schedule
export function getSNFGame(games: Game[]): Game | undefined {
  return games.find(g => g.is_snf)
}

// Find the MNF game in a week's schedule
export function getMNFGame(games: Game[]): Game | undefined {
  return games.find(g => g.is_mnf)
}

// Get the Sunday 12:00 PM Central deadline for a given week (from any game in that week).
// This is the shared week-level cutoff used for reminders/auto-assign timing — unlike
// getPickDeadline, it doesn't account for early-kickoff exceptions, so the result is the
// same regardless of which game in the week is passed in (queries here aren't ordered).
export function getWeekSundayDeadline(games: Game[]): Date | null {
  const anyGame = games[0]
  if (!anyGame) return null
  const kickoff = new Date(anyGame.kickoff_central)
  const chicagoKickoff = toZonedTime(kickoff, CHICAGO_TZ)
  const dow = chicagoKickoff.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  // Thu/Fri/Sat (4/5/6): their own deadline is before this week's Sunday, so walk forward to it.
  // Sun/Mon/Tue/Wed (0/1/2/3): the Sunday deadline already passed, so walk back to it.
  const isEarlyDay = dow === 4 || dow === 5 || dow === 6
  const daysToSunday = isEarlyDay ? 7 - dow : dow === 0 ? 0 : -dow
  const sunday = new Date(chicagoKickoff)
  sunday.setDate(chicagoKickoff.getDate() + daysToSunday)
  sunday.setHours(12, 0, 0, 0)
  return fromZonedTime(sunday, CHICAGO_TZ)
}
