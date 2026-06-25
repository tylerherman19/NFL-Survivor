'use client'

import { useEffect, useState, useCallback } from 'react'
import type { LiveGame, LiveScoresResponse } from '@/app/api/live-scores/route'

function scoreColor(myScore: number, theirScore: number, state: string): string {
  if (state === 'pre') return 'var(--dark)'
  if (myScore > theirScore) return 'var(--green)'
  if (myScore < theirScore) return 'var(--red)'
  return 'var(--dark)' // tie
}

function GameCard({ game }: { game: LiveGame }) {
  const isLive = game.state === 'in'
  const isPre = game.state === 'pre'

  return (
    <div
      className="shrink-0 border px-3 py-2 text-xs"
      style={{
        borderColor: isLive ? 'var(--red)' : 'var(--border)',
        background: 'white',
        minWidth: 140,
      }}
    >
      {/* Live indicator */}
      {isLive && (
        <div className="flex items-center gap-1 mb-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--red)' }} />
          <span className="font-bold tracking-widest uppercase" style={{ fontSize: 9, color: 'var(--red)' }}>
            {game.statusText}
          </span>
        </div>
      )}
      {!isLive && (
        <div className="mb-1 tracking-wider uppercase" style={{ fontSize: 9, color: 'var(--muted)' }}>
          {game.statusText}
        </div>
      )}

      {/* Away team row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="font-bold font-mono" style={{ color: isPre ? 'var(--dark)' : scoreColor(game.awayScore, game.homeScore, game.state) }}>
            {game.awayTeam}
          </span>
          {game.awayPicks !== undefined && (
            <span style={{ fontSize: 9, color: 'var(--muted)' }}>({game.awayPicks})</span>
          )}
        </div>
        {!isPre && (
          <span className="font-bold font-mono tabular-nums" style={{ color: scoreColor(game.awayScore, game.homeScore, game.state) }}>
            {game.awayScore}
          </span>
        )}
      </div>

      {/* Home team row */}
      <div className="flex items-center justify-between gap-3 mt-0.5">
        <div className="flex items-center gap-1.5">
          <span className="font-bold font-mono" style={{ color: isPre ? 'var(--dark)' : scoreColor(game.homeScore, game.awayScore, game.state) }}>
            {game.homeTeam}
          </span>
          {game.homePicks !== undefined && (
            <span style={{ fontSize: 9, color: 'var(--muted)' }}>({game.homePicks})</span>
          )}
        </div>
        {!isPre && (
          <span className="font-bold font-mono tabular-nums" style={{ color: scoreColor(game.homeScore, game.awayScore, game.state) }}>
            {game.homeScore}
          </span>
        )}
      </div>

      {/* Pre-game: show kickoff time */}
      {isPre && (
        <div className="mt-1" style={{ fontSize: 9, color: 'var(--muted)' }}>
          {new Date(game.kickoff).toLocaleString('en-US', {
            timeZone: 'America/Chicago',
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          })}
        </div>
      )}
    </div>
  )
}

export default function LiveTicker({ weekNumber, season }: { weekNumber?: number | null; season?: number | null }) {
  const [data, setData] = useState<LiveScoresResponse | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch('/api/live-scores', { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastUpdated(new Date())
      }
    } catch {
      // silently fail — scores are non-critical
    }
  }, [])

  useEffect(() => {
    fetchScores()
  }, [fetchScores])

  useEffect(() => {
    if (!data) return
    // Poll every 30s during live games, every 5min otherwise
    const interval = data.hasLiveGames ? 30_000 : 5 * 60_000
    const timer = setInterval(fetchScores, interval)
    return () => clearInterval(timer)
  }, [data?.hasLiveGames, fetchScores])

  // Don't render if no active week or no games
  if (!data || data.games.length === 0) return null

  const liveCount = data.games.filter((g) => g.state === 'in').length

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--cream)' }}>
      <div className="mx-auto max-w-5xl px-4 py-2">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
              Week {data.weekNumber} Scores
            </span>
            {liveCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-bold tracking-wider" style={{ color: 'var(--red)' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--red)' }} />
                {liveCount} LIVE
              </span>
            )}
            {data.picksVisible && (
              <span className="text-xs tracking-wider" style={{ color: 'var(--muted)', fontSize: 10 }}>
                · pick counts shown
              </span>
            )}
          </div>
          {lastUpdated && (
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: 'America/Chicago' })}
            </span>
          )}
        </div>

        {/* Scrollable game cards */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {data.games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </div>
    </div>
  )
}
