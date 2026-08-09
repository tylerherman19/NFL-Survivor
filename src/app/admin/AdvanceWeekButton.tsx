'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  currentWeekNumber: number
  seasonYear: number
  seasonType?: 'preseason' | 'regular'
}

export default function AdvanceWeekButton({ currentWeekNumber, seasonYear, seasonType = 'regular' }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const label = seasonType === 'preseason' ? 'Preseason Week' : 'Week'

  async function handleAdvance() {
    if (!confirm(`Advance to ${label} ${currentWeekNumber + 1}? This will pull the schedule from ESPN and set it as the active week.`)) return
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/schedule/sync-espn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_number: currentWeekNumber + 1, season_year: seasonYear, season_type: seasonType }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(`Error: ${data.error}`)
        return
      }

      // sync-espn deliberately won't switch the active week out from under
      // the current one, so activate the newly-synced week explicitly.
      const activateRes = await fetch('/api/admin/set-active-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id: data.week_id }),
      })
      const activateData = await activateRes.json()
      if (activateRes.ok) {
        setMessage(`✅ Advanced to ${label} ${currentWeekNumber + 1} — ${data.games_synced} games synced`)
        router.refresh()
      } else {
        setMessage(`Synced but failed to activate: ${activateData.error}`)
      }
    } catch {
      setMessage('Server error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-blue-700 bg-slate-800 p-4 space-y-3">
      <p className="text-sm font-semibold text-blue-300">Advance Season</p>
      <p className="text-xs text-slate-400">Moves the pool to {label} {currentWeekNumber + 1} and auto-syncs the ESPN schedule.</p>
      <button
        onClick={handleAdvance}
        disabled={loading}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Advancing…' : `Advance to ${label} ${currentWeekNumber + 1}`}
      </button>
      {message && (
        <p className={`text-xs ${message.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{message}</p>
      )}
    </div>
  )
}
