'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NFL_TEAM_NAMES } from '@/types'

interface AvailableTeam {
  team: string
  deadline: string | null
  locked: boolean
}

interface Props {
  weekId: string
  weekNumber: number
  playerId: string
  availableTeams: AvailableTeam[]
  usedTeams: string[]
}

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

      if (!res.ok) {
        setError(data.error || 'Failed to submit pick')
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.refresh()
      }, 2000)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-12">
        <p className="text-5xl mb-4">✅</p>
        <p className="text-2xl font-bold text-white">Pick locked in!</p>
        <p className="text-slate-400 mt-2">
          You picked <strong>{NFL_TEAM_NAMES[selected!] || selected}</strong> for Week {weekNumber}.
          A confirmation email is on its way.
        </p>
      </div>
    )
  }

  if (unlocked.length === 0 && locked.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-xl text-white">All available teams are locked</p>
        <p className="mt-2">
          Either all deadlines have passed, or you&apos;ve already used every team playing this week.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-slate-400 text-sm mb-1">
          Week {weekNumber} — select one team to win their game
        </p>
        {usedTeams.length > 0 && (
          <p className="text-slate-500 text-xs">
            Already used: {usedTeams.join(', ')}
          </p>
        )}
      </div>

      {/* Available (unlocked) teams */}
      {unlocked.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
            Available to pick
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {unlocked.map(({ team, deadline }) => (
              <button
                key={team}
                onClick={() => {
                  setSelected(team)
                  setConfirmed(false)
                }}
                className={`rounded-lg border p-3 text-left transition-all ${
                  selected === team
                    ? 'border-green-500 bg-green-500/20 ring-1 ring-green-500'
                    : 'border-slate-700 bg-slate-800 hover:border-slate-500'
                }`}
              >
                <p className="font-bold text-white font-mono">{team}</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-tight">
                  {NFL_TEAM_NAMES[team]}
                </p>
                {deadline && (
                  <p className="text-xs text-amber-400 mt-1">
                    Locks{' '}
                    {new Date(deadline).toLocaleString('en-US', {
                      timeZone: 'America/Chicago',
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZoneName: 'short',
                    })}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Locked teams */}
      {locked.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
            Deadline passed (no longer pickable)
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {locked.map(({ team }) => (
              <div
                key={team}
                className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-3 opacity-50 cursor-not-allowed"
              >
                <p className="font-bold text-slate-400 font-mono">{team}</p>
                <p className="text-xs text-slate-500 mt-0.5">{NFL_TEAM_NAMES[team]}</p>
                <p className="text-xs text-red-400 mt-1">🔒 Locked</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm step */}
      {selected && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 space-y-4">
          <p className="text-white font-medium">
            You selected: <strong>{NFL_TEAM_NAMES[selected] || selected}</strong>
          </p>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-green-500"
            />
            <span className="text-sm text-slate-300">
              I confirm this is my pick. I understand picks cannot be changed once submitted.
            </span>
          </label>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!confirmed || submitting}
            className="w-full rounded-lg bg-green-600 py-2.5 font-semibold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Locking in…' : `Lock In ${selected}`}
          </button>
        </div>
      )}
    </div>
  )
}
