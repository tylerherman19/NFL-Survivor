'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Player } from '@/types'
import { NFL_TEAMS, NFL_TEAM_NAMES } from '@/types'

interface Props {
  players: Player[]
  activeWeekId: string | null
  activeWeekNumber: number | null
}

export default function PlayersManager({ players, activeWeekId, activeWeekNumber }: Props) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [pickModal, setPickModal] = useState<{ player: Player; team: string } | null>(null)
  const [submittingPick, setSubmittingPick] = useState(false)

  async function togglePaid(playerId: string, current: boolean) {
    const res = await fetch(`/api/players/${playerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: !current }),
    })
    if (res.ok) {
      setMessage(`Payment status updated`)
      router.refresh()
    } else {
      setMessage('Failed to update')
    }
  }

  async function regenPin(playerId: string, fullName: string) {
    if (!confirm(`Regenerate PIN for ${fullName}? They'll get a new email.`)) return
    const res = await fetch(`/api/players/${playerId}/regen-pin`, { method: 'POST' })
    if (res.ok) {
      setMessage(`New PIN sent to ${fullName}`)
    } else {
      setMessage('Failed to regen PIN')
    }
  }

  async function toggleElimination(player: Player) {
    const action = player.status === 'eliminated' ? 'restore' : 'eliminate'
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
      setMessage(`${player.full_name} ${action}d`)
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
              <br />
              <span className="text-slate-500">
                (Paid column: &quot;yes&quot;/&quot;no&quot; or &quot;true&quot;/&quot;false&quot;)
              </span>
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

      {/* Players table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800 text-slate-400 text-left">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="border-b border-slate-700/50 bg-slate-800/30">
                <td className="px-4 py-3 font-medium text-white">{p.full_name}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{p.email}</td>
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
                <td className="px-4 py-3">
                  <span
                    className={
                      p.status === 'alive' ? 'text-green-400' : 'text-red-400'
                    }
                  >
                    {p.status === 'alive' ? '✅ Alive' : '❌ Out'}
                  </span>
                </td>
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
                  </div>
                </td>
              </tr>
            ))}
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
