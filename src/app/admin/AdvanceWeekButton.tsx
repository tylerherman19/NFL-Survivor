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
    <div className="card p-4 space-y-3" style={{ borderColor: 'var(--border-strong)' }}>
      <div>
        <p className="eyebrow">Advance Season</p>
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Moves the pool to Week {currentWeekNumber + 1} and auto-syncs the ESPN schedule.</p>
      </div>
      <button
        onClick={handleAdvance}
        disabled={loading}
        className="btn-primary px-4 py-2 text-sm font-semibold"
      >
        {loading ? 'Advancing…' : `Advance to Week ${currentWeekNumber + 1} →`}
      </button>
      {message && (
        <p className="text-xs" style={{ color: message.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{message}</p>
      )}
    </div>
  )
}
