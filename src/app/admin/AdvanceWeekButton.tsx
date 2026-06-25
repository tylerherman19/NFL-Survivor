'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  currentWeekNumber: number
  seasonYear: number
}

export default function AdvanceWeekButton({ currentWeekNumber, seasonYear }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleAdvance() {
    if (!confirm(`Advance to Week ${currentWeekNumber + 1}? This will pull the schedule from ESPN and set it as the active week.`)) return
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/schedule/sync-espn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_number: currentWeekNumber + 1, season_year: seasonYear }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(`✅ Advanced to Week ${currentWeekNumber + 1} — ${data.games_synced} games synced`)
        router.refresh()
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch {
      setMessage('Server error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-blue-700 bg-blue-950/30 p-4 space-y-3">
      <p className="text-sm font-semibold text-blue-300">Advance Season</p>
      <p className="text-xs text-slate-400">Moves the pool to Week {currentWeekNumber + 1} and auto-syncs the ESPN schedule.</p>
      <button
        onClick={handleAdvance}
        disabled={loading}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Advancing…' : `Advance to Week ${currentWeekNumber + 1} →`}
      </button>
      {message && (
        <p className={`text-xs ${message.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{message}</p>
      )}
    </div>
  )
}
