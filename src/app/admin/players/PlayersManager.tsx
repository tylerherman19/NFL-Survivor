'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Player } from '@/types'
import { NFL_TEAMS, NFL_TEAM_NAMES } from '@/types'
import { teamColor } from '@/lib/teamColors'

interface Props {
  players: Player[]
  activeWeekId: string | null
  activeWeekNumber: number | null
  currentPicks: Record<string, string>
  weeksSurvived: Record<string, number>
}

function actionBtn(color: 'neutral' | 'red' | 'green') {
  const c = color === 'red' ? 'var(--red)' : color === 'green' ? 'var(--green)' : 'var(--dark)'
  return {
    borderColor: color === 'neutral' ? 'var(--border)' : c,
    color: c,
  }
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
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const filtered = query
    ? players.filter((p) => p.full_name.toLowerCase().includes(query) || p.email.toLowerCase().includes(query))
    : players

  const allIds = filtered.map((p) => p.id)
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
    setMessage(`Marked ${ids.length} player${ids.length !== 1 ? 's' : ''} as ${paid ? 'paid' : 'unpaid'}`)
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

  async function bulkDelete() {
    if (!someSelected) return
    const ids = [...selected]
    if (!confirm(`Permanently delete ${ids.length} player${ids.length !== 1 ? 's' : ''}? This cannot be undone and removes all their picks.`)) return
    setBulkWorking(true)
    setMessage('')
    const results = await Promise.all(
      ids.map((id) => fetch(`/api/players/${id}`, { method: 'DELETE' }))
    )
    const failed = results.filter((r) => !r.ok).length
    setMessage(
      failed
        ? `Deleted ${ids.length - failed} player${ids.length - failed !== 1 ? 's' : ''}, ${failed} failed`
        : `Deleted ${ids.length} player${ids.length !== 1 ? 's' : ''}`
    )
    setSelected(new Set())
    setBulkWorking(false)
    router.refresh()
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
        setMessage(`Imported ${data.count} players. Emails sent.`)
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
          className="btn-primary text-sm font-semibold px-4 py-2"
        >
          📥 Import Players from CSV
        </button>

        {showImport && (
          <div className="card mt-4 p-4 space-y-3">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Paste CSV with headers:{' '}
              <code style={{ color: 'var(--dark)' }}>Full Name, Phone, Email, Venmo, Paid</code>
            </p>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Full Name,Phone,Email,Venmo,Paid&#10;John Smith,555-1234,john@example.com,@johnsmith,yes"
              rows={8}
              className="field w-full px-3 py-2 text-sm font-mono"
              style={{ color: 'var(--dark)' }}
            />
            <div className="flex gap-3">
              <button
                onClick={handleImport}
                disabled={importing || !csvText.trim()}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: 'var(--green)' }}
              >
                {importing ? 'Importing…' : 'Import & Send Welcome Emails'}
              </button>
              <button
                onClick={() => setShowImport(false)}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {message && (
        <p className="text-sm font-medium" style={{ color: message.toLowerCase().includes('fail') || message.toLowerCase().includes('error') ? 'var(--red)' : 'var(--green)' }}>
          {message}
        </p>
      )}

      {/* Bulk actions */}
      {someSelected && (
        <div className="card flex items-center gap-3 px-4 py-2.5">
          <span className="text-sm" style={{ color: 'var(--dark)' }}>{selected.size} selected</span>
          <button
            onClick={() => bulkSetPaid(true)}
            disabled={bulkWorking}
            className="pill disabled:opacity-50"
            style={{ background: 'var(--green-tint)', color: 'var(--green)' }}
          >
            Mark Paid
          </button>
          <button
            onClick={() => bulkSetPaid(false)}
            disabled={bulkWorking}
            className="pill disabled:opacity-50"
            style={{ background: 'var(--red-tint)', color: 'var(--red)' }}
          >
            Mark Unpaid
          </button>
          <button
            onClick={bulkDelete}
            disabled={bulkWorking}
            className="pill disabled:opacity-50"
            style={{ background: 'var(--red-tint)', color: 'var(--red)' }}
          >
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs"
            style={{ color: 'var(--muted)' }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players by name or email…"
          className="field w-full max-w-sm px-3 py-2 text-sm"
          style={{ color: 'var(--dark)' }}
        />
        {query && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {filtered.length} of {players.length}
          </span>
        )}
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {filtered.length === 0 && query ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No players match &ldquo;{search}&rdquo;.</p>
        ) : null}
        {filtered.map((p) => {
          const pick = currentPicks[p.id]
          const weeks = weeksSurvived[p.id] || 0
          return (
            <div
              key={p.id}
              className="card p-4 space-y-3"
              style={selected.has(p.id) ? { borderColor: 'var(--dark)', borderWidth: 2 } : {}}
            >
              {/* Top row: checkbox + name + status */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  className="shrink-0"
                />
                <span className="font-medium flex-1" style={{ color: 'var(--dark)' }}>{p.full_name}</span>
                <span className={`pill ${p.status === 'alive' ? 'pill-alive' : 'pill-out'}`}>
                  {p.status === 'alive' ? 'Alive' : 'Out'}
                </span>
              </div>

              {/* Second row: paid + week pick */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => togglePaid(p.id, p.paid)}
                  className="pill"
                  style={{ background: p.paid ? 'var(--green-tint)' : 'var(--red-tint)', color: p.paid ? 'var(--green)' : 'var(--red)' }}
                >
                  {p.paid ? 'Paid' : 'Unpaid'}
                </button>
                {pick ? (
                  <span className="team-chip-swatch" style={{ background: teamColor(pick).primary, width: 'auto', padding: '3px 8px', borderRadius: 6 }}>{pick}</span>
                ) : p.status === 'alive' ? (
                  <span className="text-xs" style={{ color: 'var(--red)' }}>pending pick</span>
                ) : null}
              </div>

              {/* Third row: weeks survived */}
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{weeks > 0 ? `${weeks} week${weeks !== 1 ? 's' : ''} survived` : 'No weeks survived'}</p>

              {/* Bottom row: actions */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => regenPin(p.id, p.full_name)}
                  className="rounded border px-2 py-1 text-xs"
                  style={actionBtn('neutral')}
                >
                  Regen PIN
                </button>
                <button
                  onClick={() => toggleElimination(p)}
                  className="rounded border px-2 py-1 text-xs"
                  style={actionBtn(p.status === 'alive' ? 'red' : 'green')}
                >
                  {p.status === 'alive' ? 'Eliminate' : 'Restore'}
                </button>
                {activeWeekId && p.status === 'alive' && (
                  <button
                    onClick={() => setPickModal({ player: p, team: pick || '' })}
                    className="rounded border px-2 py-1 text-xs"
                    style={actionBtn('neutral')}
                  >
                    {pick ? 'Change Pick' : 'Submit Pick'}
                  </button>
                )}
                <button
                  onClick={() => deletePlayer(p)}
                  className="rounded border px-2 py-1 text-xs"
                  style={actionBtn('red')}
                >
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Players table */}
      <div className="hidden sm:block card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }} className="text-left">
              <th className="px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              </th>
              <th className="px-4 py-3 eyebrow">Name</th>
              <th className="px-4 py-3 eyebrow">Status</th>
              <th className="px-4 py-3 eyebrow">Wks</th>
              <th className="px-4 py-3 eyebrow">This Week</th>
              <th className="px-4 py-3 eyebrow">Paid</th>
              <th className="px-4 py-3 eyebrow">Email</th>
              <th className="px-4 py-3 eyebrow">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && query && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
                  No players match &ldquo;{search}&rdquo;.
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const pick = currentPicks[p.id]
              const weeks = weeksSurvived[p.id] || 0
              return (
                <tr
                  key={p.id}
                  className="row-hover"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: selected.has(p.id) ? 'var(--surface-sunken)' : 'transparent',
                    opacity: p.status === 'eliminated' ? 0.65 : 1,
                  }}
                >
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--dark)' }}>{p.full_name}</td>
                  <td className="px-4 py-3">
                    <span className={`pill ${p.status === 'alive' ? 'pill-alive' : 'pill-out'}`}>
                      {p.status === 'alive' ? 'Alive' : 'Out'}
                    </span>
                  </td>
                  <td className="px-4 py-3 tnum" style={{ color: 'var(--muted)' }}>{weeks}</td>
                  <td className="px-4 py-3">
                    {pick ? (
                      <span className="team-chip-swatch" style={{ background: teamColor(pick).primary, width: 'auto', padding: '3px 8px', borderRadius: 6 }}>{pick}</span>
                    ) : p.status === 'alive' ? (
                      <span className="text-xs font-semibold" style={{ color: 'var(--red)' }}>pending</span>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => togglePaid(p.id, p.paid)}
                      className="pill"
                      style={{ background: p.paid ? 'var(--green-tint)' : 'var(--red-tint)', color: p.paid ? 'var(--green)' : 'var(--red)' }}
                    >
                      {p.paid ? 'Paid' : 'Unpaid'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>{p.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => regenPin(p.id, p.full_name)}
                        className="rounded border px-2 py-0.5 text-xs"
                        style={actionBtn('neutral')}
                      >
                        Regen PIN
                      </button>
                      <button
                        onClick={() => toggleElimination(p)}
                        className="rounded border px-2 py-0.5 text-xs"
                        style={actionBtn(p.status === 'alive' ? 'red' : 'green')}
                      >
                        {p.status === 'alive' ? 'Eliminate' : 'Restore'}
                      </button>
                      {activeWeekId && p.status === 'alive' && (
                        <button
                          onClick={() => setPickModal({ player: p, team: currentPicks[p.id] || '' })}
                          className="rounded border px-2 py-0.5 text-xs"
                          style={actionBtn('neutral')}
                        >
                          {currentPicks[p.id] ? 'Change Pick' : 'Submit Pick'}
                        </button>
                      )}
                      <button
                        onClick={() => deletePlayer(p)}
                        className="rounded border px-2 py-0.5 text-xs"
                        style={actionBtn('red')}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-sm space-y-4" style={{ background: 'var(--surface)' }}>
            <h3 className="font-display text-2xl" style={{ color: 'var(--dark)' }}>
              {currentPicks[pickModal.player.id] ? 'Change Pick' : 'Submit Pick'} — {pickModal.player.full_name}
            </h3>
            {currentPicks[pickModal.player.id] && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Current pick: <span className="font-mono font-bold" style={{ color: 'var(--dark)' }}>{currentPicks[pickModal.player.id]}</span>
              </p>
            )}
            <div>
              <label className="eyebrow block mb-1">Team</label>
              <select
                value={pickModal.team}
                onChange={(e) => setPickModal({ ...pickModal, team: e.target.value })}
                className="field w-full px-3 py-2"
                style={{ color: 'var(--dark)' }}
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
                className="btn-primary flex-1 py-2 font-semibold disabled:opacity-50"
              >
                {submittingPick ? 'Submitting…' : currentPicks[pickModal.player.id] ? 'Change Pick' : 'Submit Pick'}
              </button>
              <button
                onClick={() => setPickModal(null)}
                className="flex-1 rounded-lg border py-2"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
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
