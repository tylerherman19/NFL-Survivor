'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NFL_TEAM_NAMES } from '@/types'

interface AvailableTeam { team: string; deadline: string | null; locked: boolean }
interface Props { weekId: string; weekNumber: number; playerId: string; availableTeams: AvailableTeam[]; usedTeams: string[] }

export default function PickForm({ weekId, weekNumber, availableTeams, usedTeams }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const unlocked = availableTeams.filter((t) => !t.locked)
  const locked = availableTeams.filter((t) => t.locked)

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
      <p className="font-display text-6xl" style={{ color: 'var(--green)' }}>LOCKED IN!</p>
      <p className="text-sm mt-4" style={{ color: 'var(--muted)' }}>
        {NFL_TEAM_NAMES[selected!] || selected} — Week {weekNumber}. Confirmation email on its way.
      </p>
    </div>
  )

  if (unlocked.length === 0 && locked.length === 0) return (
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

      {unlocked.length > 0 && (
        <div>
          <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>Select a team</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {unlocked.map(({ team, deadline }) => (
              <button
                key={team}
                onClick={() => { setSelected(team); setConfirmed(false) }}
                className="border p-3 text-left transition-all"
                style={{
                  borderColor: selected === team ? 'var(--green)' : 'var(--border)',
                  borderWidth: selected === team ? 2 : 1,
                  background: selected === team ? 'rgba(30,82,24,0.06)' : 'white',
                }}
              >
                <p className="font-bold font-mono text-sm" style={{ color: 'var(--dark)' }}>{team}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[team]}</p>
                {deadline && (
                  <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>
                    Locks {new Date(deadline).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>Deadline passed</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {locked.map(({ team }) => (
              <div key={team} className="border p-3 opacity-40 cursor-not-allowed" style={{ borderColor: 'var(--border)', background: 'white' }}>
                <p className="font-bold font-mono text-sm" style={{ color: 'var(--muted)' }}>{team}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[team]}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--red)' }}>Locked</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="border p-5 space-y-4" style={{ borderColor: 'var(--green)', borderWidth: 2 }}>
          <p className="font-bold" style={{ color: 'var(--dark)' }}>
            Selected: <span className="font-display text-xl">{NFL_TEAM_NAMES[selected] || selected}</span>
          </p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
            <span className="text-sm" style={{ color: 'var(--dark)' }}>
              I confirm this pick. Picks cannot be changed once submitted.
            </span>
          </label>
          {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={!confirmed || submitting}
            className="w-full font-display tracking-wider text-white py-3 disabled:opacity-40 transition-opacity"
            style={{ background: 'var(--red)' }}
          >
            {submitting ? 'LOCKING IN…' : `LOCK IN ${selected} →`}
          </button>
        </div>
      )}
    </div>
  )
}
