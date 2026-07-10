'use client'

import { useEffect, useState } from 'react'
import { NFL_TEAM_NAMES } from '@/types'
import { teamColor } from '@/lib/teamColors'
import type { SweatResponse, SweatGame, SweatPlayer } from '@/app/api/sweat/route'

function scoreColor(myScore: number, theirScore: number, state: string): string {
  if (state === 'pre') return 'var(--dark)'
  if (myScore > theirScore) return 'var(--green)'
  if (myScore < theirScore) return 'var(--red)'
  return 'var(--dark)'
}

function kickoffLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function TeamRow({ game, side }: { game: SweatGame; side: 'home' | 'away' }) {
  const team = side === 'home' ? game.homeTeam : game.awayTeam
  const my = side === 'home' ? game.homeScore : game.awayScore
  const their = side === 'home' ? game.awayScore : game.homeScore
  const pickers = side === 'home' ? game.homePlayers : game.awayPlayers
  const isPre = game.state === 'pre'
  const color = scoreColor(my, their, game.state)

  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="team-chip-swatch" style={{ background: teamColor(team).primary }}>{team.slice(0, 3)}</span>
          <span className="font-bold" style={{ color }}>{team}</span>
          <span className="text-xs hidden sm:inline truncate" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[team]}</span>
          {pickers.length > 0 && (
            <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--muted)' }}>
              {pickers.length} {pickers.length === 1 ? 'pick' : 'picks'}
            </span>
          )}
        </div>
        {!isPre && (
          <span className="font-display text-2xl tnum leading-none shrink-0" style={{ color }}>{my}</span>
        )}
      </div>
      {pickers.length > 0 && (
        <p className="mt-1 text-xs leading-relaxed" style={{ color }}>
          {pickers.join(' · ')}
        </p>
      )}
    </div>
  )
}

function GameCard({ game }: { game: SweatGame }) {
  const isLive = game.state === 'in'
  const sweatCount = game.homePlayers.length + game.awayPlayers.length

  return (
    <div
      className="card px-4 py-3"
      style={{
        borderColor: isLive ? 'var(--red)' : 'var(--border)',
        boxShadow: isLive ? '0 0 0 2px var(--red)' : undefined,
        opacity: game.state === 'post' && sweatCount === 0 ? 0.6 : 1,
      }}
    >
      <div className="flex items-center justify-between mb-1">
        {isLive ? (
          <span className="flex items-center gap-1.5 eyebrow" style={{ color: 'var(--red)' }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--red)' }} />
            {game.statusText}
          </span>
        ) : (
          <span className="eyebrow">
            {game.state === 'pre' ? kickoffLabel(game.kickoff) : game.statusText}
          </span>
        )}
      </div>
      <TeamRow game={game} side="away" />
      <div style={{ borderTop: '1px solid var(--border)' }} />
      <TeamRow game={game} side="home" />
    </div>
  )
}

function StatTile({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="card px-4 py-3 text-center">
      <p className="font-display text-4xl leading-none tnum" style={{ color: color ?? 'var(--dark)' }}>{value}</p>
      <p className="eyebrow mt-1">{label}</p>
    </div>
  )
}

function NameList({ title, players, color, note }: { title: string; players: SweatPlayer[]; color: string; note?: string }) {
  if (players.length === 0) return null
  return (
    <div className="py-4 border-t" style={{ borderColor: 'var(--border)' }}>
      <p className="eyebrow mb-2" style={{ color }}>
        {title} ({players.length})
      </p>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--dark)' }}>
        {players.map((p) => p.name).join(' · ')}
      </p>
      {note && <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{note}</p>}
    </div>
  )
}

const GAME_ORDER: Record<string, number> = { in: 0, pre: 1, post: 2 }

export default function SweatBoard() {
  const [data, setData] = useState<SweatResponse | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const hasLive = data?.hasLiveGames ?? false

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/sweat', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        setData(json)
        setLastUpdated(new Date())
      } catch {
        // non-critical — keep showing the last snapshot
      }
    }

    load()
    const timer = setInterval(load, hasLive ? 30_000 : 5 * 60_000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [hasLive])

  if (!data) {
    return (
      <div className="py-20 text-center">
        <p className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    )
  }

  if (data.weekNumber === null || data.games.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="font-display text-6xl" style={{ color: 'var(--dark)' }}>NO GAMES YET</p>
        <p className="mt-4 text-sm tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          The sweat board lights up on game day
        </p>
      </div>
    )
  }

  const s = data.summary
  const inDanger = s.losing + s.noPick
  const games = [...data.games].sort(
    (a, b) =>
      GAME_ORDER[a.state] - GAME_ORDER[b.state] ||
      new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  )
  const byStatus = (statuses: string[]) => data.players.filter((p) => statuses.includes(p.status))

  return (
    <div>
      {/* Hero */}
      <div className="py-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h1 className="font-display text-7xl leading-none" style={{ color: 'var(--dark)' }}>SWEAT BOARD</h1>
          <p className="mt-1 eyebrow">
            Week {data.weekNumber} · live picks &amp; scores
            {data.hasLiveGames && (
              <span className="ml-2 font-bold" style={{ color: 'var(--red)' }}>● LIVE</span>
            )}
          </p>
        </div>
        {lastUpdated && (
          <p style={{ fontSize: 10, color: 'var(--muted)' }}>
            Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: 'America/Chicago' })}
          </p>
        )}
      </div>

      {/* Danger banner */}
      {inDanger > 0 && (
        <div className="mt-6 rounded-lg px-4 py-3 flex items-center gap-3" style={{ background: 'var(--red-tint)', boxShadow: '0 0 0 1px var(--red)' }}>
          <span className="inline-block w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: 'var(--red)' }} />
          <p className="text-sm font-bold" style={{ color: 'var(--red)' }}>
            {inDanger} player{inDanger !== 1 ? 's' : ''} facing elimination right now
          </p>
        </div>
      )}

      {/* Summary tiles */}
      <div className="mt-6 grid grid-cols-3 sm:grid-cols-6 gap-2">
        <StatTile value={s.safe} label="Safe" color="var(--green)" />
        <StatTile value={s.winning} label="Winning" color="var(--green)" />
        <StatTile value={s.losing} label="Losing" color="var(--red)" />
        <StatTile value={s.out} label="Out" color="var(--red)" />
        <StatTile value={s.notStarted} label="Yet to Play" />
        <StatTile value={s.hidden + s.pending + s.noPick} label="No Pick Shown" />
      </div>

      {/* Games with pickers */}
      <div className="mt-8 grid sm:grid-cols-2 gap-3">
        {games.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>

      {/* Reveal note */}
      {!data.allRevealed && s.hidden > 0 && (
        <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
          {s.hidden} pick{s.hidden !== 1 ? 's are' : ' is'} in but hidden until kickoff or the Sunday 12 PM CT reveal.
        </p>
      )}

      {/* Off-board groups */}
      <div className="mt-8">
        <NameList
          title="Pick revealed, game not started"
          players={byStatus(['pre'])}
          color="var(--muted)"
        />
        <NameList
          title="No pick submitted"
          players={byStatus(['pending'])}
          color="var(--muted)"
          note="Deadline hasn't passed yet."
        />
        <NameList
          title="Missed the deadline"
          players={byStatus(['no_pick'])}
          color="var(--red)"
          note="Will be auto-assigned the SNF away team, then MNF. Miss both and it's elimination."
        />
      </div>
    </div>
  )
}
