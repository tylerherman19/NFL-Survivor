'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NFL_TEAM_NAMES } from '@/types'
import { teamColor } from '@/lib/teamColors'

interface AvailableTeam { team: string; deadline: string | null; locked: boolean }
interface CurrentPick { team: string; deadline: string | null }
interface Props { weekId: string; weekNumber: number; availableTeams: AvailableTeam[]; usedTeams: string[]; teamRecords?: Record<string, string>; teamOdds?: Record<string, number>; currentPick?: CurrentPick | null }

function formatLockTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function oddsColor(prob: number): string {
  if (prob >= 0.6) return 'var(--green)'
  if (prob >= 0.4) return 'var(--dark)'
  return 'var(--red)'
}

export default function PickForm({ weekId, weekNumber, availableTeams, usedTeams, teamRecords, teamOdds, currentPick }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sortBy, setSortBy] = useState<'alpha' | 'odds'>('alpha')

  const hasOdds = Object.keys(teamOdds ?? {}).length > 0
  const sortTeams = (list: AvailableTeam[]) =>
    sortBy === 'odds' && hasOdds
      ? [...list].sort((a, b) => (teamOdds?.[b.team] ?? -1) - (teamOdds?.[a.team] ?? -1))
      : list

  const isChange = !!currentPick
  const unlocked = sortTeams(availableTeams.filter((t) => !t.locked && t.team !== currentPick?.team))
  const locked = availableTeams.filter((t) => t.locked && t.team !== currentPick?.team)

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

  if (!isChange && unlocked.length === 0 && locked.length === 0) return (
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

      {isChange && unlocked.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>No other teams are available to switch to.</p>
      )}

      {unlocked.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="eyebrow">{isChange ? 'Switch to a different team' : 'Select a team'}</p>
            {hasOdds && (
              <div className="flex items-center gap-2">
                <span className="eyebrow">Sort:</span>
                {(['alpha', 'odds'] as const).map((mode) => (
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
                    {mode === 'alpha' ? 'A–Z' : 'Win %'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {unlocked.map(({ team, deadline }) => {
              const c = teamColor(team).primary
              const isSel = selected === team
              return (
                <button
                  key={team}
                  onClick={() => { setSelected(team); setConfirmed(false) }}
                  className="card text-left transition-all relative overflow-hidden"
                  style={{
                    padding: '12px 12px 12px 16px',
                    borderColor: isSel ? c : 'var(--border)',
                    boxShadow: isSel ? `0 0 0 2px ${c}` : undefined,
                  }}
                >
                  <span className="absolute left-0 top-0 h-full" style={{ width: 4, background: c }} />
                  <div className="flex items-center gap-2">
                    <span className="team-chip-swatch" style={{ background: c }}>{team.slice(0, 3)}</span>
                    <span className="font-bold text-sm" style={{ color: 'var(--dark)' }}>{team}</span>
                    {isSel && <span className="ml-auto text-sm" style={{ color: c }}>✓</span>}
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[team]}</p>
                  {teamRecords?.[team] && (
                    <p className="text-xs mt-0.5 tnum" style={{ color: 'var(--muted)' }}>{teamRecords[team]}</p>
                  )}
                  {teamOdds?.[team] !== undefined && (
                    <p className="text-xs mt-0.5 font-semibold tnum" style={{ color: oddsColor(teamOdds[team]) }}>
                      {Math.round(teamOdds[team] * 100)}% win odds · Kalshi
                    </p>
                  )}
                  {deadline && (
                    <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>
                      Locks {formatLockTime(deadline)}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <p className="eyebrow mb-3">Deadline passed</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {locked.map(({ team }) => (
              <div key={team} className="card p-3 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-2">
                  <span className="team-chip-swatch" style={{ background: 'var(--muted)' }}>{team.slice(0, 3)}</span>
                  <span className="font-bold text-sm" style={{ color: 'var(--muted)' }}>{team}</span>
                </div>
                <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[team]}</p>
                <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--red)' }}>🔒 Locked</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
            {submitting ? 'LOCKING IN…' : isChange ? `SWITCH TO ${selected} →` : `LOCK IN ${selected} →`}
          </button>
        </div>
      )}
    </div>
  )
}
