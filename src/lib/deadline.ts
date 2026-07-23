import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { Game, GameDay } from '@/types'

const CHICAGO_TZ = 'America/Chicago'

// Returns true if this game day means the pick deadline is the game's kickoff
function isEarlyDeadlineDay(day: GameDay): boolean {
  return day === 'thursday' || day === 'friday' || day === 'saturday'
}

// Given a game, return the UTC timestamp of when picks for that game lock
export function getPickDeadline(game: Game): Date {
  if (isEarlyDeadlineDay(game.game_day)) {
    // Deadline is the game's kickoff time
    return new Date(game.kickoff_central)
  }
  // For all other days (Sun, Mon, Tue), deadline is Sunday 12:00 PM Central
  // Find the Sunday of the week this game is in
  const kickoff = new Date(game.kickoff_central)
  const chicagoKickoff = toZonedTime(kickoff, CHICAGO_TZ)

  // Walk back to Sunday
  const dow = chicagoKickoff.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToSunday = dow === 0 ? 0 : -dow // days backward to reach Sunday
  const sunday = new Date(chicagoKickoff)
  sunday.setDate(chicagoKickoff.getDate() + daysToSunday)
  sunday.setHours(12, 0, 0, 0) // 12:00 PM

  // Convert back to UTC
  return fromZonedTime(sunday, CHICAGO_TZ)
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

// Get the Sunday 12:00 PM Central deadline for a given week (from any game in that week)
export function getWeekSundayDeadline(games: Game[]): Date | null {
  const anyGame = games[0]
  if (!anyGame) return null
  // Use a Sunday game or any game to find the Sunday
  const kickoff = new Date(anyGame.kickoff_central)
  const chicagoKickoff = toZonedTime(kickoff, CHICAGO_TZ)
  const dow = chicagoKickoff.getDay()
  // Mon (-1) goes back to the Sunday deadline that already passed for MNF.
  // Thu/Fri/Sat/Tue/Wed (7-dow) go forward to the upcoming Sunday.
  const daysToSunday = dow === 0 ? 0 : dow === 1 ? -1 : 7 - dow
  const sunday = new Date(chicagoKickoff)
  sunday.setDate(chicagoKickoff.getDate() + daysToSunday)
  sunday.setHours(12, 0, 0, 0)
  return fromZonedTime(sunday, CHICAGO_TZ)
}
