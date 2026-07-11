'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface WeekOption {
  id: string
  week_number: number
  season_year: number
  is_active: boolean
}

export default function SetActiveWeek({ weeks }: { weeks: WeekOption[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const inactive = weeks.filter((w) => !w.is_active)
  if (inactive.length === 0) return null

  async function handleActivate() {
    const week = weeks.find((w) => w.id === selected)
    if (!week) return
    if (!confirm(`Set Week ${week.week_number} (${week.season_year}) as the active week? Players will immediately see it on the pick page.`)) return
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin/set-active-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id: selected }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(`✅ Week ${data.week_number} is now active`)
        setSelected('')
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
    <div className="card p-4 space-y-3" style={{ borderColor: 'var(--red)', background: 'var(--red-tint)' }}>
      <p className="eyebrow" style={{ color: 'var(--red)' }}>Set Active Week</p>
      <p className="text-xs" style={{ color: 'var(--dark)' }}>
        Manually switch which week is active. Use this to roll back or jump ahead — normally you should use Advance Season instead.
      </p>
      <div className="flex items-center gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="field px-3 py-2 text-sm"
          style={{ color: 'var(--dark)' }}
        >
          <option value="">Select a week…</option>
          {inactive.map((w) => (
            <option key={w.id} value={w.id}>
              Week {w.week_number} · {w.season_year}
            </option>
          ))}
        </select>
        <button
          onClick={handleActivate}
          disabled={!selected || loading}
          className="btn-primary px-4 py-2 text-sm font-semibold"
        >
          {loading ? 'Activating…' : 'Activate'}
        </button>
      </div>
      {message && (
        <p className="text-xs" style={{ color: message.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{message}</p>
      )}
    </div>
  )
}
