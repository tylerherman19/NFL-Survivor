'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NFL_TEAMS, NFL_TEAM_NAMES } from '@/types'
import type { Game, Week } from '@/types'

type GameDay = 'thursday' | 'friday' | 'saturday' | 'sunday' | 'monday' | 'tuesday'

interface Props {
  weeks: Week[]
  activeWeek: Week | null
  games: Game[]
}

interface NewGame {
  home_team: string
  away_team: string
  game_day: GameDay
  kickoff_date: string
  kickoff_time: string
  is_snf: boolean
  is_mnf: boolean
}

const BLANK_GAME: NewGame = {
  home_team: '',
  away_team: '',
  game_day: 'sunday',
  kickoff_date: '',
  kickoff_time: '13:00',
  is_snf: false,
  is_mnf: false,
}

export default function ScheduleForm({ weeks, activeWeek, games }: Props) {
  const router = useRouter()
  const [weekNumber, setWeekNumber] = useState(
    activeWeek ? activeWeek.week_number : (weeks.length > 0 ? weeks[weeks.length - 1].week_number + 1 : 1)
  )
  const [seasonYear, setSeasonYear] = useState(activeWeek?.season_year || 2026)
  const [newGames, setNewGames] = useState<NewGame[]>([{ ...BLANK_GAME }])
  const [submitting, setSubmitting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function addGame() {
    setNewGames((prev) => [...prev, { ...BLANK_GAME }])
  }

  function removeGame(i: number) {
    setNewGames((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateGame(i: number, field: keyof NewGame, value: string | boolean) {
    setNewGames((prev) =>
      prev.map((g, idx) => {
        if (idx !== i) return g
        const updated = { ...g, [field]: value }
        // Auto-set game_day from kickoff_date
        if (field === 'kickoff_date' && typeof value === 'string') {
          const d = new Date(value + 'T12:00:00')
          const dayMap: Record<number, GameDay> = {
            0: 'sunday',
            1: 'monday',
            2: 'tuesday',
            4: 'thursday',
            5: 'friday',
            6: 'saturday',
          }
          updated.game_day = dayMap[d.getDay()] ?? 'sunday'
        }
        // Auto-unset SNF/MNF if day doesn't match
        if (field === 'game_day') {
          if (value !== 'sunday') updated.is_snf = false
          if (value !== 'monday') updated.is_mnf = false
        }
        if (field === 'is_snf' && value) updated.is_mnf = false
        if (field === 'is_mnf' && value) updated.is_snf = false
        return updated
      })
    )
  }

  async function syncFromESPN() {
    setSyncing(true)
    setMessage('')
    try {
      const res = await fetch('/api/schedule/sync-espn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_number: weekNumber, season_year: seasonYear }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(`Error: ${data.error}`)
      } else {
        setMessage(`✅ Synced ${data.games_synced} games from ESPN for Week ${weekNumber} ${seasonYear}`)
        router.refresh()
      }
    } catch {
      setMessage('Server error. Try again.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMessage('')

    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_number: weekNumber,
          season_year: seasonYear,
          games: newGames.map((g) => ({
            ...g,
            kickoff_central: `${g.kickoff_date}T${g.kickoff_time}:00`,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(`Error: ${data.error}`)
      } else {
        setMessage(`✅ Week ${weekNumber} schedule saved!`)
        setNewGames([{ ...BLANK_GAME }])
        router.refresh()
      }
    } catch {
      setMessage('Server error. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteGame(gameId: string) {
    setDeletingId(gameId)
    try {
      const res = await fetch(`/api/schedule?id=${gameId}`, { method: 'DELETE' })
      if (res.ok) router.refresh()
      else setMessage('Failed to delete game')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-8">

      {/* ESPN Auto-Sync — primary action */}
      <div className="rounded-xl border border-green-700 bg-green-950/40 p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-green-400 tracking-wide">⚡ Auto-Sync from ESPN</h2>
          <p className="text-xs text-slate-400 mt-1">Pulls schedule directly from ESPN — no manual entry. Also auto-detects SNF/MNF.</p>
        </div>
        <div className="flex gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Season</label>
            <input
              type="number"
              value={seasonYear}
              onChange={(e) => setSeasonYear(Number(e.target.value))}
              className="w-24 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white focus:border-green-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Week</label>
            <input
              type="number"
              value={weekNumber}
              min={1}
              max={22}
              onChange={(e) => setWeekNumber(Number(e.target.value))}
              className="w-20 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white focus:border-green-500 focus:outline-none"
            />
          </div>
          <button
            onClick={syncFromESPN}
            disabled={syncing}
            className="rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 px-6 py-2 text-sm font-bold text-white transition-colors"
          >
            {syncing ? 'Syncing…' : 'SYNC FROM ESPN →'}
          </button>
        </div>
        {message && (
          <p className={`text-sm ${message.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
            {message}
          </p>
        )}
      </div>

      {/* Existing games */}
      {activeWeek && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">
            Week {activeWeek.week_number} Current Schedule
          </h2>
          {games.length === 0 ? (
            <p className="text-slate-400 text-sm">No games entered yet for this week.</p>
          ) : (
            <div className="space-y-2">
              {games.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-4 py-3"
                >
                  <div>
                    <span className="text-white font-medium font-mono">
                      {g.away_team} @ {g.home_team}
                    </span>
                    <span className="ml-3 text-slate-400 text-sm capitalize">{g.game_day}</span>
                    {g.is_snf && <span className="ml-2 text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">SNF</span>}
                    {g.is_mnf && <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">MNF</span>}
                    <span className="ml-3 text-slate-500 text-xs">
                      {new Date(g.kickoff_central).toLocaleString('en-US', {
                        timeZone: 'America/Chicago',
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZoneName: 'short',
                      })}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteGame(g.id)}
                    disabled={deletingId === g.id}
                    className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50"
                  >
                    {deletingId === g.id ? '…' : 'Delete'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add new week/games */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <h2 className="text-lg font-semibold text-white">Add Games</h2>

        <div className="flex gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Season Year</label>
            <input
              type="number"
              value={seasonYear}
              onChange={(e) => setSeasonYear(Number(e.target.value))}
              className="w-28 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Week Number</label>
            <input
              type="number"
              value={weekNumber}
              min={1}
              max={22}
              onChange={(e) => setWeekNumber(Number(e.target.value))}
              className="w-24 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-4">
          {newGames.map((g, i) => (
            <div key={i} className="rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-300">Game {i + 1}</p>
                {newGames.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeGame(i)}
                    className="text-red-400 text-sm hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Away Team</label>
                  <select
                    value={g.away_team}
                    onChange={(e) => updateGame(i, 'away_team', e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Select…</option>
                    {NFL_TEAMS.map((t) => (
                      <option key={t} value={t}>
                        {t} — {NFL_TEAM_NAMES[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Home Team</label>
                  <select
                    value={g.home_team}
                    onChange={(e) => updateGame(i, 'home_team', e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Select…</option>
                    {NFL_TEAMS.map((t) => (
                      <option key={t} value={t}>
                        {t} — {NFL_TEAM_NAMES[t]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Date (Central)</label>
                  <input
                    type="date"
                    value={g.kickoff_date}
                    onChange={(e) => updateGame(i, 'kickoff_date', e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Kickoff (Central)</label>
                  <input
                    type="time"
                    value={g.kickoff_time}
                    onChange={(e) => updateGame(i, 'kickoff_time', e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Day</label>
                  <select
                    value={g.game_day}
                    onChange={(e) => updateGame(i, 'game_day', e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  >
                    {(['thursday','friday','saturday','sunday','monday','tuesday'] as GameDay[]).map((d) => (
                      <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={g.is_snf}
                    onChange={(e) => updateGame(i, 'is_snf', e.target.checked)}
                    className="accent-yellow-500"
                  />
                  <span className="text-sm text-yellow-400">Sunday Night Football (SNF)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={g.is_mnf}
                    onChange={(e) => updateGame(i, 'is_mnf', e.target.checked)}
                    className="accent-blue-500"
                  />
                  <span className="text-sm text-blue-400">Monday Night Football (MNF)</span>
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={addGame}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
          >
            + Add Another Game
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Saving…' : 'Save Schedule'}
          </button>
        </div>

        {message && (
          <p className={`text-sm ${message.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
            {message}
          </p>
        )}
      </form>
    </div>
  )
}
