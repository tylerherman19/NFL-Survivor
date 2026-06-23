export type PlayerStatus = 'alive' | 'eliminated'
export type GameDay = 'thursday' | 'friday' | 'saturday' | 'sunday' | 'monday' | 'tuesday'
export type GameResult = 'home_win' | 'away_win' | 'tie' | 'pending'

export interface Player {
  id: string
  full_name: string
  phone: string | null
  email: string
  venmo_handle: string | null
  paid: boolean
  status: PlayerStatus
  elimination_week: number | null
  elimination_reason: string | null
  created_at: string
}

export interface Week {
  id: string
  week_number: number
  season_year: number
  is_active: boolean
  created_at: string
}

export interface Game {
  id: string
  week_id: string
  home_team: string
  away_team: string
  game_day: GameDay
  kickoff_central: string // ISO timestamp stored as UTC, represents Central time
  is_snf: boolean
  is_mnf: boolean
  result: GameResult
  created_at: string
}

export interface Pick {
  id: string
  player_id: string
  week_id: string
  team: string
  auto_assigned: boolean
  submitted_by_admin: boolean
  created_at: string
}

export interface PlayerWithPick extends Player {
  pick?: Pick
  used_teams: string[]
  weeks_survived: number
}

export interface DashboardData {
  current_week: Week | null
  active_players: number
  eliminated_players: number
  total_players: number
  pot_size: number
  payout_per_survivor: number
  standings: StandingRow[]
  team_stats: TeamStat[]
  next_deadline: string | null
  next_deadline_label: string | null
}

export interface StandingRow {
  player_id: string
  full_name: string
  status: PlayerStatus
  weeks_survived: number
  current_pick: string | null
  pick_locked: boolean
  elimination_reason: string | null
}

export interface TeamStat {
  team: string
  times_picked: number
  win_rate: number
  eliminations_caused: number
}

export interface SessionPayload {
  player_id: string
  full_name: string
  is_admin: boolean
  expires_at: string
}

// 32 NFL teams
export const NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WSH',
] as const

export const NFL_TEAM_NAMES: Record<string, string> = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB: 'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs',
  LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams',
  LV: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE: 'New England Patriots',
  NO: 'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers',
  TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WSH: 'Washington Commanders',
}
