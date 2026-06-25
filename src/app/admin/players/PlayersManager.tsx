'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Player } from '@/types'
import { NFL_TEAMS, NFL_TEAM_NAMES } from '@/types'

interface Props {
  players: Player[]
  activeWeekId: string | null
  activeWeekNumber: number | null
  currentPicks: Record<string, string>
  weeksSurvived: Record<string, number>
}

export default function PlayersManager({ players, activeWeekId, activeWeekNumber, currentPicks, weeksSurvived }: Props) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [pickModal, setPickModal] = useState<{ player: Player; team: string } | null>(null)
  const [submittingPick, setSubmittingPick] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkWorking, setBulkWorking] = useState(false)

  const allIds = players.map((p) => p.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  const someSelected = selected.size > 0

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(allIds))
  }

  async function bulkSetPaid(paid: boolean) {
    if (!someSelected) return
    setBulkWorking(true)
    setMessage('')
    const ids = [...selected]
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/players/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paid }),
        })
      )
    )
    setMessage(`✅ Marked ${ids.length} player${ids.length !== 1 ? 's' : ''} as ${paid ? 'paid' : 'unpaid'}`)
    setSelected(new Set())
    setBulkWorking(false)
    router.refresh()
  }

  async function togglePaid(playerId: string, current: boolean) {
    const res = await fetch(`/api/players/${playerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: !current }),
    })
    if (res.ok) router.refresh()
    else setMessage('Failed to update')
  }

  async function regenPin(playerId: string, fullName: string) {
    if (!confirm(`Regenerate PIN for ${fullName}? They'll get a new email.`)) return
    const res = await fetch(`/api/players/${playerId}/regen-pin`, { method: 'POST' })
    if (res.ok) setMessage(`New PIN sent to ${fullName}`)
    else setMessage('Failed to regen PIN')
  }

  async function deletePlayer(player: Player) {
    if (!confirm(`Permanently delete ${player.full_name}? This cannot be undone and removes all their picks.`)) return
    const res = await fetch(`/api/players/${player.id}`, { method: 'DELETE' })
    if (res.ok) {
      setMessage(`${player.full_name} deleted`)
      setSelected((prev) => { const next = new Set(prev); next.delete(player.id); return next })
      router.refresh()
    } else {
      setMessage('Failed to delete player')
    }
  }

  async function toggleElimination(player: Player) {
    const reason =
      player.status === 'alive'
        ? prompt('Reason for elimination (shown in recap):') || 'Admin correction'
        : null

    const res = await fetch(`/api/players/${player.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: player.status === 'eliminated' ? 'alive' : 'eliminated',
        elimination_reason: reason,
        elimination_week: activeWeekNumber,
      }),
    })
    if (res.ok) {
      setMessage(`${player.full_name} ${player.status === 'alive' ? 'eliminated' : 'restored'}`)
      router.refresh()
    }
  }

  async function submitAdminPick() {
    if (!pickModal || !activeWeekId) return
    setSubmittingPick(true)
    try {
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_id: activeWeekId,
          team: pickModal.team,
          player_id_override: pickModal.player.id,
          submitted_by_admin: true,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(`Pick submitted for ${pickModal.player.full_name}: ${pickModal.team}`)
        setPickModal(null)
        router.refresh()
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } finally {
      setSubmittingPick(false)
    }
  }

  async function handleImport() {
    if (!csvText.trim()) return
    setImporting(true)
    setMessage('')
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(`✅ Imported ${data.count} players. Emails sent.`)
        setCsvText('')
        setShowImport(false)
        router.refresh()
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Import section */}
      <div>
        <button
          onClick={() => setShowImport(!showImport)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
        >
          📥 Import Players from CSV
        </button>

        {showImport && (
          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-3">
            <p className="text-sm text-slate-400">
              Paste CSV with headers:{' '}
              <code className="text-blue-300">Full Name, Phone, Email, Venmo, Paid</code>
            </p>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Full Name,Phone,Email,Venmo,Paid&#10;John Smith,555-1234,john@example.com,@johnsmith,yes"
              rows={8}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white text-sm font-mono placeholder-slate-600 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                onClick={handleImport}
                disabled={importing || !csvText.trim()}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
              >
                {importing ? 'Importing…' : 'Import & Send Welcome Emails'}
              </button>
              <button
                onClick={() => setShowImport(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:border-slate-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {message && (
        <p className={`text-sm ${message.startsWith('✅') ? 'text-green-400' : 'text-amber-400'}`}>
          {message}
        </p>
      )}

      {/* Bulk actions */}
      {someSelected && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2">
          <span className="text-sm text-slate-300">{selected.size} selected</span>
          <button
            onClick={() => bulkSetPaid(true)}
            disabled={bulkWorking}
            className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50"
          >
            Mark Paid
          </button>
          <button
            onClick={() => bulkSetPaid(false)}
            disabled={bulkWorking}
            className="rounded bg-red-700 px-3 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
          >
            Mark Unpaid
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300"
          >
            Clear
          </button>
        </div>
      )}

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {players.map((p) => {
          const pick = currentPicks[p.id]
          const weeks = weeksSurvived[p.id] || 0
          return (
            <div
              key={p.id}
              className="rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-3"
              style={selected.has(p.id) ? { borderColor: '#6366f1' } : {}}
            >
              {/* Top row: checkbox + name + status */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  className="accent-green-500 shrink-0"
                />
                <span className="font-medium text-white flex-1">{p.full_name}</span>
                <span className={`text-xs font-bold ${p.status === 'alive' ? 'text-green-400' : 'text-red-400'}`}>
                  {p.status === 'alive' ? '✅ Alive' : '❌ Out'}
                </span>
              </div>

              {/* Second row: paid + week pick */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => togglePaid(p.id, p.paid)}
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    p.paid
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  }`}
                >
                  {p.paid ? '✓ Paid' : '✗ Unpaid'}
                </button>
                {pick ? (
                  <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-mono font-bold text-white">{pick}</span>
                ) : p.status === 'alive' ? (
                  <span className="text-amber-400 text-xs">pending pick</span>
                ) : null}
              </div>

              {/* Third row: weeks survived */}
              <p className="text-xs text-slate-500">{weeks > 0 ? `${weeks} week${weeks !== 1 ? 's' : ''} survived` : 'No weeks survived'}</p>

              {/* Bottom row: actions */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => regenPin(p.id, p.full_name)}
                  className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-slate-400 hover:text-white"
                >
                  Regen PIN
                </button>
                <button
                  onClick={() => toggleElimination(p)}
                  className={`rounded border px-2 py-1 text-xs ${
                    p.status === 'alive'
                      ? 'border-red-700 text-red-400 hover:border-red-500'
                      : 'border-green-700 text-green-400 hover:border-green-500'
                  }`}
                >
                  {p.status === 'alive' ? 'Eliminate' : 'Restore'}
                </button>
                {activeWeekId && p.status === 'alive' && (
                  <button
                    onClick={() => setPickModal({ player: p, team: '' })}
                    className="rounded border border-blue-700 px-2 py-1 text-xs text-blue-400 hover:border-blue-500"
                  >
                    Submit Pick
                  </button>
                )}
                <button
                  onClick={() => deletePlayer(p)}
                  className="rounded border border-red-900 px-2 py-1 text-xs text-red-500 hover:border-red-600 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Players table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800 text-slate-400 text-left">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="accent-green-500"
                />
              </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Wks</th>
              <th className="px-4 py-3">This Week</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const pick = currentPicks[p.id]
              const weeks = weeksSurvived[p.id] || 0
              return (
                <tr key={p.id} className={`border-b border-slate-700/50 ${selected.has(p.id) ? 'bg-slate-700/40' : p.status === 'alive' ? 'bg-slate-800/30' : 'bg-slate-900/40 opacity-70'}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="accent-green-500"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{p.full_name}</td>
                  <td className="px-4 py-3">
                    <span className={p.status === 'alive' ? 'text-green-400' : 'text-red-400'}>
                      {p.status === 'alive' ? '✅ Alive' : '❌ Out'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{weeks}</td>
                  <td className="px-4 py-3">
                    {pick ? (
                      <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-mono font-bold text-white">{pick}</span>
                    ) : p.status === 'alive' ? (
                      <span className="text-amber-400 text-xs">pending</span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => togglePaid(p.id, p.paid)}
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        p.paid
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      }`}
                    >
                      {p.paid ? '✓ Paid' : '✗ Unpaid'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{p.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => regenPin(p.id, p.full_name)}
                        className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:border-slate-400 hover:text-white"
                      >
                        Regen PIN
                      </button>
                      <button
                        onClick={() => toggleElimination(p)}
                        className={`rounded border px-2 py-0.5 text-xs ${
                          p.status === 'alive'
                            ? 'border-red-700 text-red-400 hover:border-red-500'
                            : 'border-green-700 text-green-400 hover:border-green-500'
                        }`}
                      >
                        {p.status === 'alive' ? 'Eliminate' : 'Restore'}
                      </button>
                      {activeWeekId && p.status === 'alive' && (
                        <button
                          onClick={() => setPickModal({ player: p, team: '' })}
                          className="rounded border border-blue-700 px-2 py-0.5 text-xs text-blue-400 hover:border-blue-500"
                        >
                          Submit Pick
                        </button>
                      )}
                      <button
                        onClick={() => deletePlayer(p)}
                        className="rounded border border-red-900 px-2 py-0.5 text-xs text-red-500 hover:border-red-600 hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Admin pick modal */}
      {pickModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-white">
              Submit Pick for {pickModal.player.full_name}
            </h3>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Team</label>
              <select
                value={pickModal.team}
                onChange={(e) => setPickModal({ ...pickModal, team: e.target.value })}
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select team…</option>
                {NFL_TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {t} — {NFL_TEAM_NAMES[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={submitAdminPick}
                disabled={!pickModal.team || submittingPick}
                className="flex-1 rounded-lg bg-blue-600 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {submittingPick ? 'Submitting…' : 'Submit Pick'}
              </button>
              <button
                onClick={() => setPickModal(null)}
                className="flex-1 rounded-lg border border-slate-600 py-2 text-slate-300 hover:border-slate-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
