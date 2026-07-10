// Official-ish primary colors for each NFL team, keyed to the abbreviations
// used in NFL_TEAM_NAMES. `primary` is the team's dominant brand color; used
// for pick chips, accent bars, and color-coding. Text on a `primary` fill
// should be white for all of these (they're all dark/saturated enough).
//
// No logos here — colors only. Trademark-safe and asset-free.

export interface TeamColor {
  primary: string
}

export const TEAM_COLORS: Record<string, TeamColor> = {
  ARI: { primary: '#97233F' },
  ATL: { primary: '#A71930' },
  BAL: { primary: '#241773' },
  BUF: { primary: '#00338D' },
  CAR: { primary: '#0085CA' },
  CHI: { primary: '#0B162A' },
  CIN: { primary: '#FB4F14' },
  CLE: { primary: '#311D00' },
  DAL: { primary: '#041E42' },
  DEN: { primary: '#FB4F14' },
  DET: { primary: '#0076B6' },
  GB: { primary: '#203731' },
  HOU: { primary: '#03202F' },
  IND: { primary: '#002C5F' },
  JAX: { primary: '#006778' },
  KC: { primary: '#E31837' },
  LAC: { primary: '#0080C6' },
  LAR: { primary: '#003594' },
  LV: { primary: '#0b0b0b' },
  MIA: { primary: '#008E97' },
  MIN: { primary: '#4F2683' },
  NE: { primary: '#002244' },
  NO: { primary: '#9F8958' },
  NYG: { primary: '#0B2265' },
  NYJ: { primary: '#125740' },
  PHI: { primary: '#004C54' },
  PIT: { primary: '#101820' },
  SEA: { primary: '#002244' },
  SF: { primary: '#AA0000' },
  TB: { primary: '#D50A0A' },
  TEN: { primary: '#0C2340' },
  WSH: { primary: '#5A1414' },
  // Aliases seen in some data sources
  WAS: { primary: '#5A1414' },
  JAC: { primary: '#006778' },
}

const FALLBACK: TeamColor = { primary: '#1a1a1a' }

export function teamColor(team: string | null | undefined): TeamColor {
  if (!team) return FALLBACK
  return TEAM_COLORS[team] ?? FALLBACK
}
