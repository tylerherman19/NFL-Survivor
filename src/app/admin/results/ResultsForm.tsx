'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Game, Week } from '@/types'

interface Props {
  week: Week
  games: Game[]
}

type GameResult = 'home_win' | 'away_win' | 'tie' | 'pending'

export default function ResultsForm({ week, games }: Props) {
  const router = useRouter()
  const [results, setResults] = useState<Record<string, GameResult>>(
    Object.fromEntries(games.map((g) => [g.id, g.result as GameResult]))
  )
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [gradingResult, setGradingResult] = useState<null | {
    eliminated: string[]
    advanced: string[]
  }>(null)

  async function saveResult(gameId: string, result: GameResult) {
    setResults((prev) => ({ ...prev, [gameId]: result }))
    setMessage('')

    try {
      const res = await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId, result }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMessage(`Error: ${data.error}`)
        return
      }

      if (data.grading) {
        setGradingResult(data.grading)
        router.refresh()
      }
    } catch {
      setMessage('Server error. Try again.')
    }
  }

  async function gradeAllPending() {
    setSubmitting(true)
    setMessage('')
    try {
      const res = await fetch('/api/results/grade-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_id: week.id }),
      })
      const data = await res.json()
      if (res.ok && data.grading) {
        setGradingResult(data.grading)
        setMessage(`✅ Graded ${week.week_number}. ${data.grading.eliminated.length} eliminated.`)
        router.refresh()
      } else {
        setMessage(data.error || 'Grading failed')
      }
    } catch {
      setMessage('Server error')
    } finally {
      setSubmitting(false)
    }
  }

  const resultOptions: { value: GameResult; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'home_win', label: 'Home Win' },
    { value: 'away_win', label: 'Away Win' },
    { value: 'tie', label: 'Tie' },
  ]

  function optionStyle(gameId: string, value: GameResult): React.CSSProperties {
    const active = results[gameId] === value
    if (!active) {
      return { background: 'var(--surface-sunken)', color: 'var(--dark)' }
    }
    if (value === 'pending') return { background: 'var(--muted)', color: '#fff' }
    if (value === 'tie') return { background: 'var(--red)', color: '#fff' }
    return { background: 'var(--green)', color: '#fff' }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {games.map((g) => (
          <div
            key={g.id}
            className="card p-4 flex items-center justify-between gap-4 flex-wrap"
          >
            <div>
              <p className="font-medium font-mono" style={{ color: 'var(--dark)' }}>
                {g.away_team} @ {g.home_team}
              </p>
              <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--muted)' }}>
                {g.game_day}
                {g.is_snf && ' · SNF'}
                {g.is_mnf && ' · MNF'}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {resultOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => saveResult(g.id, opt.value)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={optionStyle(g.id, opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={gradeAllPending}
          disabled={submitting}
          className="btn-primary px-6 py-2.5 font-semibold"
        >
          {submitting ? 'Grading…' : 'Grade All Picks & Eliminate Losers'}
        </button>
      </div>

      {message && (
        <p className="text-sm" style={{ color: message.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>
          {message}
        </p>
      )}

      {gradingResult && (
        <div className="card p-4 space-y-3">
          <p className="font-bold" style={{ color: 'var(--dark)' }}>Grading Result:</p>
          {gradingResult.eliminated.length > 0 && (
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--red)' }}>Eliminated ({gradingResult.eliminated.length}):</p>
              <p className="text-sm" style={{ color: 'var(--dark)' }}>{gradingResult.eliminated.join(', ')}</p>
            </div>
          )}
          {gradingResult.advanced.length > 0 && (
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--green)' }}>Advanced ({gradingResult.advanced.length}):</p>
              <p className="text-sm" style={{ color: 'var(--dark)' }}>{gradingResult.advanced.join(', ')}</p>
            </div>
          )}
          {gradingResult.eliminated.length === 0 && gradingResult.advanced.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No picks found for this week yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
