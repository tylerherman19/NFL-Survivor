// Kalshi prediction-market odds for NFL games.
// Public API, no auth. Prices are cents-on-the-dollar ≈ win probability.
// Everything here fails soft: any error returns empty data, never throws.

const KALSHI_MARKETS_URL = 'https://api.elections.kalshi.com/trade-api/v2/markets'
const SERIES_TICKER = 'KXNFLGAME'
const MAX_PAGES = 5
// Wider than this and the "price" is just an empty order book (e.g. 0.25/0.75
// placeholder quotes on far-future preseason games) — treat as no odds.
const MAX_SPREAD = 0.15

// ESPN team abbreviations → Kalshi market ticker codes. Identity unless listed.
const ESPN_TO_KALSHI: Record<string, string> = {
  JAX: 'JAC',
  WSH: 'WAS',
}

export function toKalshiCode(espnAbbr: string): string {
  return ESPN_TO_KALSHI[espnAbbr] ?? espnAbbr
}

export interface TeamOdds {
  prob: number // mid of yes bid/ask, 0–1
  spread: number // ask − bid, 0–1
}

export interface KalshiNflEvent {
  eventTicker: string
  dateMs: number // ticker date as UTC noon, for ±1 day matching
  teams: Record<string, TeamOdds> // keyed by Kalshi team code
}

interface KalshiMarket {
  ticker: string
  event_ticker: string
  status: string
  yes_bid_dollars: string
  yes_ask_dollars: string
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
}

// Event ticker: KXNFLGAME-26SEP13WASPHI → date "26SEP13" (YY MMM DD)
function parseEventDateMs(eventTicker: string): number | null {
  const m = eventTicker.match(/^KXNFLGAME-(\d{2})([A-Z]{3})(\d{2})/)
  if (!m) return null
  const month = MONTHS[m[2]]
  if (month === undefined) return null
  return Date.UTC(2000 + parseInt(m[1], 10), month, parseInt(m[3], 10), 12, 0, 0)
}

// Game's calendar date in US Eastern (Kalshi tickers use the scheduled local date),
// normalized to UTC noon so it can be compared against parseEventDateMs.
function kickoffDateMs(kickoffISO: string): number | null {
  const d = new Date(kickoffISO)
  if (isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d)
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '', 10)
  const [y, mo, day] = [get('year'), get('month'), get('day')]
  if (isNaN(y) || isNaN(mo) || isNaN(day)) return null
  return Date.UTC(y, mo - 1, day, 12, 0, 0)
}

const DAY_MS = 24 * 60 * 60 * 1000

// Fetch all open NFL game-winner markets, grouped by event (one event per game).
export async function getNflOdds(): Promise<KalshiNflEvent[]> {
  try {
    const byEvent = new Map<string, KalshiNflEvent>()
    let cursor = ''

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${KALSHI_MARKETS_URL}?series_ticker=${SERIES_TICKER}&status=open&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      const res = await fetch(url, { next: { revalidate: 300 } })
      if (!res.ok) break
      const data: { markets?: KalshiMarket[]; cursor?: string } = await res.json()
      const markets = data.markets ?? []

      for (const mkt of markets) {
        // Team code is the segment after the event ticker: KXNFLGAME-26SEP13WASPHI-PHI
        const teamCode = mkt.ticker.slice(mkt.event_ticker.length + 1)
        if (!teamCode) continue

        const bid = parseFloat(mkt.yes_bid_dollars)
        const ask = parseFloat(mkt.yes_ask_dollars)
        if (isNaN(bid) || isNaN(ask) || ask <= 0) continue
        const spread = ask - bid
        if (spread > MAX_SPREAD) continue

        const dateMs = parseEventDateMs(mkt.event_ticker)
        if (dateMs === null) continue

        let evt = byEvent.get(mkt.event_ticker)
        if (!evt) {
          evt = { eventTicker: mkt.event_ticker, dateMs, teams: {} }
          byEvent.set(mkt.event_ticker, evt)
        }
        evt.teams[teamCode] = { prob: (bid + ask) / 2, spread }
      }

      cursor = data.cursor ?? ''
      if (!cursor || markets.length === 0) break
    }

    return Array.from(byEvent.values())
  } catch {
    return []
  }
}

// Find odds for a specific game: both teams' Kalshi codes must have markets in
// the same event, and the event date must be within ±1 day of kickoff (Eastern).
export function matchGameOdds(
  homeAbbr: string,
  awayAbbr: string,
  kickoffISO: string,
  events: KalshiNflEvent[]
): { homeProb: number; awayProb: number } | null {
  const home = toKalshiCode(homeAbbr)
  const away = toKalshiCode(awayAbbr)
  const gameDateMs = kickoffDateMs(kickoffISO)
  if (gameDateMs === null) return null

  for (const evt of events) {
    if (Math.abs(evt.dateMs - gameDateMs) > DAY_MS) continue
    const homeOdds = evt.teams[home]
    const awayOdds = evt.teams[away]
    if (!homeOdds || !awayOdds) continue
    return { homeProb: homeOdds.prob, awayProb: awayOdds.prob }
  }
  return null
}
