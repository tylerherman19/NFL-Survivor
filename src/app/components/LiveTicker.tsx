'use client'

import { useEffect, useRef, useState } from 'react'
import type { LiveGame, LiveScoresResponse } from '@/app/api/live-scores/route'

// The ticker is one continuous velocity, never a stop-and-restart. Left alone it
// cruises; a swipe injects velocity; friction relaxes that velocity back toward
// the cruise speed instead of toward zero, so a throw coasts, decays, and slides
// straight back into the normal drift with no seam.
const CRUISE = 34 // px/s the strip drifts at when nobody is touching it
const SETTLE_TAU = 620 // ms time constant for velocity relaxing back to CRUISE
const TRACKING_TAU = 45 // ms smoothing on the velocity sampled from the pointer
const MAX_FLICK = 3400 // px/s cap so a violent swipe still stays readable
const HOLD_TIMEOUT = 90 // ms of stillness before release that cancels the throw
const KEY_NUDGE = 420 // px/s impulse from one arrow key press
const WHEEL_GAIN = 14 // px/s of velocity carried per px of wheel delta
const MIN_COPIES = 3

type Drag = {
  active: boolean
  pointerId: number
  lastX: number
  lastAt: number
}

function scoreColor(myScore: number, theirScore: number, state: string): string {
  if (state === 'pre') return 'var(--dark)'
  if (myScore > theirScore) return 'var(--green)'
  if (myScore < theirScore) return 'var(--red)'
  return 'var(--dark)' // tie
}

function GameCard({ game }: { game: LiveGame }) {
  const isLive = game.state === 'in'
  const isPre = game.state === 'pre'
  // A schedule-sourced game can be decided without the numbers being known —
  // its statusText carries the winner instead, so don't print a fake 0–0.
  const showScores = !isPre && game.scoresKnown !== false

  return (
    <div
      // The right margin (rather than a gap on the track) is load-bearing: it
      // is measured as part of one sequence's width, so copies tile at exactly
      // the same spacing the cards inside a copy use.
      className="shrink-0 border px-3 py-2 text-xs mr-2"
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
      {/* Pre-game kickoff time is rendered below in Central — avoid showing
          ESPN's raw statusText here too, which bakes in Eastern time. */}
      {!isLive && !isPre && (
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
            <span style={{ fontSize: 9, color: 'var(--muted)' }}>{game.awayPicks} {game.awayPicks === 1 ? 'Pick' : 'Picks'}</span>
          )}
        </div>
        {showScores && (
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
            <span style={{ fontSize: 9, color: 'var(--muted)' }}>{game.homePicks} {game.homePicks === 1 ? 'Pick' : 'Picks'}</span>
          )}
        </div>
        {showScores && (
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
  const [paused, setPaused] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)
  const [copyCount, setCopyCount] = useState(MIN_COPIES)

  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const sequence = useRef<HTMLDivElement>(null)

  const sequenceWidth = useRef(0)
  const offset = useRef(0)
  // Start from a standstill and let the loop ease up to CRUISE: it reads as a
  // gentle start, and it means a reader who asked for reduced motion gets a
  // strip that never moves on its own rather than one that drifts and stops.
  const velocity = useRef(0)
  const cruising = useRef(false)
  const drag = useRef<Drag>({ active: false, pointerId: -1, lastX: 0, lastAt: 0 })

  const hasLive = data?.hasLiveGames ?? false

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/live-scores', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        setData(json)
        setLastUpdated(new Date())
      } catch {
        // silently fail — scores are non-critical
      }
    }

    load()
    const timer = setInterval(load, hasLive ? 30_000 : 5 * 60_000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [hasLive])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  // The cruise target is read inside the animation frame, so keep it on a ref:
  // toggling pause must bend the current velocity, not restart the loop.
  useEffect(() => {
    cruising.current = !paused && !reduceMotion
  }, [paused, reduceMotion])

  // Repeat the score sequence enough times to cover the viewport plus one spare
  // copy, which is what lets the modular wrap below stay invisible.
  useEffect(() => {
    const scroller = viewport.current
    const unit = sequence.current
    if (!scroller || !unit) return

    const measure = () => {
      const width = unit.getBoundingClientRect().width
      if (!width) return
      sequenceWidth.current = width
      setCopyCount(Math.max(MIN_COPIES, Math.ceil((scroller.clientWidth + width) / width) + 1))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    observer.observe(unit)
    return () => observer.disconnect()
  }, [data])

  useEffect(() => {
    const strip = track.current
    if (!strip) return

    let frame = 0
    let last = 0

    const draw = () => {
      const width = sequenceWidth.current
      // One sequence is indistinguishable from the next, so folding the offset
      // back into [0, width) keeps the strip endless without any visible jump.
      if (width > 0) offset.current = ((offset.current % width) + width) % width
      strip.style.transform = `translate3d(${-offset.current}px, 0, 0)`
    }

    const tick = (now: number) => {
      if (!last) last = now
      const deltaMs = Math.min(48, now - last)
      last = now

      if (!drag.current.active) {
        const target = cruising.current ? CRUISE : 0
        const ease = 1 - Math.exp(-deltaMs / SETTLE_TAU)
        velocity.current += (target - velocity.current) * ease
        if (target === 0 && Math.abs(velocity.current) < 0.15) velocity.current = 0
        offset.current += (velocity.current * deltaMs) / 1000
      }

      draw()
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [data])

  // React listens for wheel passively at the root, so preventDefault only takes
  // effect from a listener we attach ourselves.
  useEffect(() => {
    const scroller = viewport.current
    if (!scroller) return

    const onWheel = (event: WheelEvent) => {
      const horizontal = event.shiftKey ? event.deltaY : event.deltaX
      if (!horizontal || (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY))) return
      event.preventDefault()
      offset.current += horizontal
      // Carry the wheel into velocity too, so letting go of the wheel coasts
      // back to cruise the same way a released swipe does.
      velocity.current = Math.max(-MAX_FLICK, Math.min(MAX_FLICK, horizontal * WHEEL_GAIN))
    }

    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [data])

  // Don't render if no active week or no games
  if (!data || data.games.length === 0) return null

  const liveCount = data.games.filter((g) => g.state === 'in').length

  const release = (element: HTMLDivElement, pointerId: number) => {
    const state = drag.current
    if (!state.active || state.pointerId !== pointerId) return
    state.active = false
    // A pointer parked in place is a deliberate hold, not a throw: let it fall
    // back to cruise from a standstill rather than firing off a stale velocity.
    if (performance.now() - state.lastAt > HOLD_TIMEOUT) velocity.current = 0
    velocity.current = Math.max(-MAX_FLICK, Math.min(MAX_FLICK, velocity.current))
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--cream)' }}>
      <div className="mx-auto max-w-5xl px-4 py-2">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="whitespace-nowrap text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
              Week {data.weekNumber} Scores
            </span>
            {liveCount > 0 && (
              <span className="flex items-center gap-1 whitespace-nowrap text-xs font-bold tracking-wider" style={{ color: 'var(--red)' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: 'var(--red)' }} />
                {liveCount} {liveCount === 1 ? 'GAME' : 'GAMES'} LIVE
              </span>
            )}
            {data.picksVisible && (
              <span className="hidden sm:inline whitespace-nowrap tracking-wider" style={{ color: 'var(--muted)', fontSize: 10 }}>
                · pick counts shown
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="hidden sm:inline whitespace-nowrap" style={{ fontSize: 10, color: 'var(--muted)' }}>
                Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: 'America/Chicago' })}
              </span>
            )}
            <button
              type="button"
              disabled={reduceMotion}
              onClick={() => setPaused((value) => !value)}
              className="whitespace-nowrap font-bold tracking-widest uppercase underline underline-offset-2"
              style={{ fontSize: 9, color: 'var(--muted)' }}
            >
              {reduceMotion ? 'Manual scroll' : paused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>

        {/* Auto-scrolling game card ticker — cruises on its own, and can be
            dragged, flicked, wheeled or arrow-keyed without ever stopping. */}
        <div
          ref={viewport}
          className="ticker-viewport pb-1"
          tabIndex={0}
          role="group"
          aria-label={`Week ${data.weekNumber} scores. Drag or use the arrow keys to browse.`}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            velocity.current = event.key === 'ArrowRight' ? KEY_NUDGE : -KEY_NUDGE
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 && event.pointerType === 'mouse') return
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = {
              active: true,
              pointerId: event.pointerId,
              lastX: event.clientX,
              lastAt: performance.now(),
            }
            // Grabbing catches the strip mid-coast, exactly like pinning a
            // spinning wheel: whatever momentum it had is now yours.
            velocity.current = 0
          }}
          onPointerMove={(event) => {
            const state = drag.current
            if (!state.active || state.pointerId !== event.pointerId) return
            const now = performance.now()
            const deltaMs = Math.max(1, now - state.lastAt)
            const deltaX = event.clientX - state.lastX
            state.lastX = event.clientX
            state.lastAt = now
            // Dragging right reveals earlier games, which means a smaller offset.
            offset.current -= deltaX
            const sample = (-deltaX / deltaMs) * 1000
            const ease = 1 - Math.exp(-deltaMs / TRACKING_TAU)
            velocity.current += (sample - velocity.current) * ease
          }}
          onPointerUp={(event) => release(event.currentTarget, event.pointerId)}
          onPointerCancel={(event) => release(event.currentTarget, event.pointerId)}
          onLostPointerCapture={(event) => release(event.currentTarget, event.pointerId)}
        >
          <div ref={track} className="ticker-track">
            {Array.from({ length: copyCount }, (_, copyIndex) => (
              <div
                key={copyIndex}
                ref={copyIndex === 0 ? sequence : undefined}
                className="ticker-sequence"
                aria-hidden={copyIndex > 0 || undefined}
              >
                {data.games.map((game) => (
                  <GameCard key={`${copyIndex}-${game.id}`} game={game} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
