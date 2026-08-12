'use client'

import { useMemo, useState } from 'react'
import { AUDIT_EVENT_TYPES, type AuditRow } from '@/lib/auditEvents'

const ACTOR_COLORS: Record<string, string> = {
  admin: 'var(--dark)',
  system: 'var(--muted)',
  player: 'var(--green)',
}

// Events that represent something being destroyed or a player going out —
// worth spotting at a glance while scanning the feed.
const ALERT_EVENTS = new Set(['player-deleted', 'player-eliminated', 'pool-reset'])

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AuditLogClient({ rows }: { rows: AuditRow[] }) {
  const [eventType, setEventType] = useState('')
  const [player, setPlayer] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  // Only offer filter values that actually appear in the loaded window —
  // an empty result from a dropdown choice would just be confusing.
  const presentEvents = useMemo(
    () => [...new Set(rows.map((r) => r.event_type))].sort((a, b) =>
      (AUDIT_EVENT_TYPES[a] || a).localeCompare(AUDIT_EVENT_TYPES[b] || b)
    ),
    [rows]
  )
  const presentPlayers = useMemo(
    () => [...new Set(rows.map((r) => r.player_name).filter((n): n is string => !!n))].sort(),
    [rows]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (eventType && r.event_type !== eventType) return false
      if (player && r.player_name !== player) return false
      if (q) {
        const haystack = `${r.message} ${r.player_name ?? ''} ${AUDIT_EVENT_TYPES[r.event_type] || r.event_type}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [rows, eventType, player, search])

  const selectStyle = {
    borderColor: 'var(--border)',
    background: 'var(--surface)',
    color: 'var(--dark)',
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="font-display text-3xl" style={{ color: 'var(--dark)' }}>AUDIT LOG</h1>
        <p className="text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          {filtered.length === rows.length
            ? `${rows.length} event${rows.length === 1 ? '' : 's'}`
            : `${filtered.length} of ${rows.length}`}
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events…"
          className="border rounded px-3 py-2 text-sm"
          style={selectStyle}
        />
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          style={selectStyle}
        >
          <option value="">All events</option>
          {presentEvents.map((t) => (
            <option key={t} value={t}>{AUDIT_EVENT_TYPES[t] || t}</option>
          ))}
        </select>
        <select
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          style={selectStyle}
        >
          <option value="">All players</option>
          {presentPlayers.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {(eventType || player || search) && (
        <button
          onClick={() => { setEventType(''); setPlayer(''); setSearch('') }}
          className="mt-3 text-xs tracking-widest uppercase underline"
          style={{ color: 'var(--muted)' }}
        >
          Clear filters
        </button>
      )}

      {rows.length === 0 ? (
        <p className="mt-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
          Nothing logged yet. Events appear here as they happen.
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
          No events match those filters.
        </p>
      ) : (
        <ul className="mt-6 border-t" style={{ borderColor: 'var(--border)' }}>
          {filtered.map((row) => {
            const isOpen = expanded === row.id
            const hasDetails = row.details && Object.keys(row.details).length > 0
            return (
              <li key={row.id} className="border-b py-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
                  <span className="font-mono text-xs shrink-0 w-32" style={{ color: 'var(--muted)' }}>
                    {formatWhen(row.created_at)}
                  </span>
                  <span
                    className="text-[10px] tracking-widest uppercase shrink-0 border rounded px-1.5 py-0.5"
                    style={{ color: ACTOR_COLORS[row.actor], borderColor: 'var(--border)' }}
                  >
                    {row.actor}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm"
                      style={{ color: ALERT_EVENTS.has(row.event_type) ? 'var(--red)' : 'var(--dark)' }}
                    >
                      {row.message}
                    </p>
                    <p className="text-[11px] tracking-widest uppercase mt-0.5" style={{ color: 'var(--muted)' }}>
                      {AUDIT_EVENT_TYPES[row.event_type] || row.event_type}
                      {hasDetails && (
                        <button
                          onClick={() => setExpanded(isOpen ? null : row.id)}
                          className="ml-2 underline"
                          style={{ color: 'var(--muted)' }}
                        >
                          {isOpen ? 'hide details' : 'details'}
                        </button>
                      )}
                    </p>
                    {isOpen && hasDetails && (
                      <pre
                        className="mt-2 text-xs overflow-x-auto rounded p-2"
                        style={{ background: 'var(--surface-sunken)', color: 'var(--dark)' }}
                      >
                        {JSON.stringify(row.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
