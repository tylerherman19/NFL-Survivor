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

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {games.map((g) => (
          <div
            key={g.id}
            className="rounded-xl border border-slate-700 bg-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div>
              <p className="text-white font-medium font-mono">
                {g.away_team} @ {g.home_team}
              </p>
              <p className="text-slate-400 text-xs mt-0.5 capitalize">
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
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    results[g.id] === opt.value
                      ? opt.value === 'pending'
                        ? 'bg-slate-600 text-white'
                        : opt.value === 'tie'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-green-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={gradeAllPending}
          disabled={submitting}
          className="rounded-lg bg-green-600 px-6 py-2.5 font-semibold text-white hover:bg-green-500 disabled:opacity-50 transition-colors w-full sm:w-auto"
        >
          {submitting ? 'Grading…' : 'Grade All Picks & Eliminate Losers'}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
          {message}
        </p>
      )}

      {gradingResult && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-3">
          <p className="font-semibold text-white">Grading Result:</p>
          {gradingResult.eliminated.length > 0 && (
            <div>
              <p className="text-red-400 text-sm font-medium">Eliminated ({gradingResult.eliminated.length}):</p>
              <p className="text-slate-300 text-sm">{gradingResult.eliminated.join(', ')}</p>
            </div>
          )}
          {gradingResult.advanced.length > 0 && (
            <div>
              <p className="text-green-400 text-sm font-medium">Advanced ({gradingResult.advanced.length}):</p>
              <p className="text-slate-300 text-sm">{gradingResult.advanced.join(', ')}</p>
            </div>
          )}
          {gradingResult.eliminated.length === 0 && gradingResult.advanced.length === 0 && (
            <p className="text-slate-400 text-sm">No picks found for this week yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
