'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NFL_TEAM_NAMES } from '@/types'
import { teamColor } from '@/lib/teamColors'

export interface GameRow {
  gameId: string
  kickoff: string // ISO UTC
  away: { team: string; used: boolean }
  home: { team: string; used: boolean }
  deadline: string // ISO UTC
  locked: boolean
}
interface CurrentPick { team: string; deadline: string | null }
interface Props {
  weekId: string
  weekNumber: number
  playerId: string
  gameRows: GameRow[]
  usedTeams: string[]
  teamRecords?: Record<string, string>
  teamOdds?: Record<string, number>
  currentPick?: CurrentPick | null
}

function formatLockTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function oddsColor(prob: number): string {
  if (prob >= 0.6) return 'var(--green)'
  if (prob >= 0.4) return 'var(--dark)'
  return 'var(--red)'
}

function TeamHalf({
  team,
  used,
  disabled,
  selected,
  isCurrentPick,
  record,
  odds,
  onClick,
}: {
  team: string
  used: boolean
  disabled: boolean
  selected: boolean
  isCurrentPick: boolean
  record?: string
  odds?: number
  onClick: () => void
}) {
  const c = teamColor(team).primary
  const clickable = !disabled && !used
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className="flex-1 text-left transition-all relative"
      style={{
        padding: '12px 14px',
        cursor: clickable ? 'pointer' : 'not-allowed',
        opacity: used || disabled ? 0.45 : 1,
        background: selected ? 'var(--surface-sunken)' : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="team-chip-swatch" style={{ background: used || disabled ? 'var(--muted)' : c }}>{team.slice(0, 3)}</span>
        <div>
          <span className="font-bold text-sm block" style={{ color: used || disabled ? 'var(--muted)' : 'var(--dark)' }}>{team}</span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[team]}</span>
        </div>
        {selected && <span className="ml-auto text-sm" style={{ color: c }}>✓</span>}
        {isCurrentPick && !selected && <span className="ml-auto text-xs font-bold" style={{ color: 'var(--green)' }}>PICKED</span>}
      </div>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {record && <span className="text-xs tnum" style={{ color: 'var(--muted)' }}>{record}</span>}
        {odds !== undefined && (
          <span className="text-xs font-semibold tnum" style={{ color: oddsColor(odds) }}>{Math.round(odds * 100)}% win</span>
        )}
        {used && <span className="text-xs font-semibold" style={{ color: 'var(--red)' }}>Already used</span>}
      </div>
    </button>
  )
}

export default function PickForm({ weekId, weekNumber, gameRows, usedTeams, teamRecords, teamOdds, currentPick }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sortBy, setSortBy] = useState<'kickoff' | 'odds'>('kickoff')

  const hasOdds = Object.keys(teamOdds ?? {}).length > 0
  const rowBestOdds = (row: GameRow) => Math.max(teamOdds?.[row.away.team] ?? -1, teamOdds?.[row.home.team] ?? -1)
  const sortedRows = sortBy === 'odds' && hasOdds
    ? [...gameRows].sort((a, b) => rowBestOdds(b) - rowBestOdds(a))
    : [...gameRows].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())

  const isChange = !!currentPick
  const anySelectable = gameRows.some((r) => (!r.locked && !r.away.used) || (!r.locked && !r.home.used))

  async function handleSubmit() {
    if (!selected || !confirmed) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id: weekId, team: selected }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to submit pick'); return }
      setSuccess(true)
      setTimeout(() => router.refresh(), 1800)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) return (
    <div className="text-center py-16">
      <p className="font-display text-6xl" style={{ color: 'var(--green)' }}>{isChange ? 'PICK UPDATED!' : 'LOCKED IN!'}</p>
      <p className="text-sm mt-4" style={{ color: 'var(--muted)' }}>
        {NFL_TEAM_NAMES[selected!] || selected} — Week {weekNumber}. Confirmation email on its way.
      </p>
    </div>
  )

  if (!isChange && !anySelectable) return (
    <div className="text-center py-16">
      <p className="font-display text-4xl" style={{ color: 'var(--dark)' }}>ALL TEAMS LOCKED</p>
      <p className="text-sm mt-3" style={{ color: 'var(--muted)' }}>All deadlines passed or you&apos;ve used every team playing this week.</p>
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <p className="font-display text-4xl" style={{ color: 'var(--dark)' }}>WEEK {weekNumber} PICK</p>
        {usedTeams.length > 0 && (
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Already used: {usedTeams.join(', ')}</p>
        )}
      </div>

      {currentPick && (
        <div className="border p-6" style={{ borderColor: 'var(--green)', borderWidth: 2 }}>
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--green)' }}>
            ✓ Your Week {weekNumber} Pick
          </p>
          <div className="flex items-center gap-3 mt-3">
            <span className="team-chip-swatch" style={{ background: teamColor(currentPick.team).primary, width: 32, height: 32, fontSize: 11, borderRadius: 7 }}>{currentPick.team.slice(0, 3)}</span>
            <p className="font-display text-3xl leading-none" style={{ color: 'var(--dark)' }}>
              {NFL_TEAM_NAMES[currentPick.team] || currentPick.team}
            </p>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
            You can still change this pick{currentPick.deadline ? ` until it locks ${formatLockTime(currentPick.deadline)}` : ''}. Select a different team below to switch.
          </p>
        </div>
      )}

      {isChange && !anySelectable && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>No other teams are available to switch to.</p>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="eyebrow">{isChange ? 'Switch to a different team' : 'Select a team'}</p>
          {hasOdds && (
            <div className="flex items-center gap-2">
              <span className="eyebrow">Sort:</span>
              {(['kickoff', 'odds'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSortBy(mode)}
                  className="text-xs tracking-widest uppercase px-2.5 py-1 rounded-full transition-colors"
                  style={{
                    background: sortBy === mode ? 'var(--dark)' : 'transparent',
                    border: `1px solid ${sortBy === mode ? 'var(--dark)' : 'var(--border)'}`,
                    color: sortBy === mode ? '#fff' : 'var(--muted)',
                    fontWeight: sortBy === mode ? 700 : 400,
                  }}
                >
                  {mode === 'kickoff' ? 'Kickoff' : 'Win %'}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {sortedRows.map((row) => {
            const disabled = row.locked
            return (
              <div key={row.gameId} className="card overflow-hidden" style={{ padding: 0, opacity: disabled ? 0.6 : 1 }}>
                <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
                  <TeamHalf
                    team={row.away.team}
                    used={row.away.used}
                    disabled={disabled}
                    selected={selected === row.away.team}
                    isCurrentPick={currentPick?.team === row.away.team}
                    record={teamRecords?.[row.away.team]}
                    odds={teamOdds?.[row.away.team]}
                    onClick={() => { setSelected(row.away.team); setConfirmed(false) }}
                  />
                  <div style={{ width: 1, background: 'var(--border)' }} />
                  <TeamHalf
                    team={row.home.team}
                    used={row.home.used}
                    disabled={disabled}
                    selected={selected === row.home.team}
                    isCurrentPick={currentPick?.team === row.home.team}
                    record={teamRecords?.[row.home.team]}
                    odds={teamOdds?.[row.home.team]}
                    onClick={() => { setSelected(row.home.team); setConfirmed(false) }}
                  />
                </div>
                <div className="px-3 py-1.5 text-xs flex items-center justify-between" style={{ background: 'var(--surface-sunken)', color: 'var(--muted)' }}>
                  <span>{row.away.team} @ {row.home.team} · {formatLockTime(row.kickoff)}</span>
                  <span style={{ color: disabled ? 'var(--red)' : 'var(--muted)' }}>
                    {disabled ? '🔒 Locked' : `Locks ${formatLockTime(row.deadline)}`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selected && (
        <div className="card p-5 space-y-4" style={{ borderColor: teamColor(selected).primary, boxShadow: `0 0 0 2px ${teamColor(selected).primary}` }}>
          <div className="flex items-center gap-3">
            <span className="team-chip-swatch" style={{ background: teamColor(selected).primary, width: 32, height: 32, fontSize: 11, borderRadius: 7 }}>{selected.slice(0, 3)}</span>
            <div>
              <p className="eyebrow" style={{ color: 'var(--muted)' }}>{isChange ? 'New Pick' : 'Your Pick'}</p>
              <p className="font-display text-2xl leading-none" style={{ color: 'var(--dark)' }}>{NFL_TEAM_NAMES[selected] || selected}</p>
            </div>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            <span className="text-sm" style={{ color: 'var(--dark)' }}>
              I confirm this pick. Picks can be changed until your team&apos;s deadline, then they lock for good.
            </span>
          </label>
          {error && <p className="text-sm rounded-md px-3 py-2" style={{ color: 'var(--red)', background: 'var(--red-tint)' }}>{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={!confirmed || submitting}
            className="btn-primary w-full font-display tracking-wider py-3"
          >
            {submitting ? 'LOCKING IN…' : isChange ? `SWITCH TO ${selected}` : `LOCK IN ${selected}`}
          </button>
        </div>
      )}
    </div>
  )
}
