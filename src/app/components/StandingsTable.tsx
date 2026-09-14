'use client'

import { useMemo, useState } from 'react'
import { NFL_TEAM_NAMES, type StandingRow } from '@/types'
import TeamChip from './TeamChip'

type SortMode = 'alphabetical' | 'team'

function byName(a: StandingRow, b: StandingRow): number {
  return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
}

function byTeamThenName(a: StandingRow, b: StandingRow): number {
  // The server removes unrevealed team values before these rows reach the
  // browser. pick_locked still lets submitted picks group ahead of no-picks.
  const aBucket = a.current_pick ? 0 : a.pick_locked ? 1 : 2
  const bBucket = b.current_pick ? 0 : b.pick_locked ? 1 : 2
  if (aBucket !== bBucket) return aBucket - bBucket

  if (a.current_pick && b.current_pick) {
    const aTeam = NFL_TEAM_NAMES[a.current_pick] ?? a.current_pick
    const bTeam = NFL_TEAM_NAMES[b.current_pick] ?? b.current_pick
    const teamOrder = aTeam.localeCompare(bTeam, undefined, { sensitivity: 'base' })
    if (teamOrder !== 0) return teamOrder
  }

  return byName(a, b)
}

export default function StandingsTable({
  aliveRows,
  elimRows,
  weekNumber,
}: {
  aliveRows: StandingRow[]
  elimRows: StandingRow[]
  weekNumber: number | null
}) {
  const [sortMode, setSortMode] = useState<SortMode>('alphabetical')
  const sortedAliveRows = useMemo(
    () => aliveRows.slice().sort(sortMode === 'team' ? byTeamThenName : byName),
    [aliveRows, sortMode]
  )
  const sortedElimRows = useMemo(() => elimRows.slice().sort(byName), [elimRows])

  return (
    <>
      <div className="mb-3 flex justify-end" aria-label="Sort standings">
        <div className="inline-flex rounded-full p-1" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
          {(['alphabetical', 'team'] as const).map((mode) => {
            const active = sortMode === mode
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={active}
                onClick={() => setSortMode(mode)}
                className="rounded-full px-3 py-1.5 text-xs font-bold transition-colors"
                style={{
                  background: active ? 'var(--dark)' : 'transparent',
                  color: active ? 'white' : 'var(--muted)',
                }}
              >
                {mode === 'alphabetical' ? 'Alphabetical' : 'Team'}
              </button>
            )
          })}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-sunken)' }}>
              <th className="py-2.5 pl-4 text-left eyebrow w-full">Player</th>
              <th className="py-2.5 px-4 text-left eyebrow hidden sm:table-cell whitespace-nowrap">Status</th>
              <th className="py-2.5 pl-4 pr-4 text-left eyebrow whitespace-nowrap">{weekNumber ? `Wk ${weekNumber} Pick` : 'Pick'}</th>
            </tr>
          </thead>
          <tbody>
            {sortedAliveRows.length > 0 && (
              <tr>
                <td colSpan={3} className="pt-4 pb-1.5 pl-4">
                  <span className="pill pill-alive"><span className="pill-dot" />{sortedAliveRows.length} Still Alive</span>
                </td>
              </tr>
            )}
            {sortedAliveRows.map((row) => (
              <tr key={row.player_id} className="row-hover border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="py-3 pl-4 font-bold" style={{ color: 'var(--dark)' }}>{row.full_name}</td>
                <td className="py-3 px-4 hidden sm:table-cell">
                  <span className="pill pill-alive"><span className="pill-dot" />Alive</span>
                </td>
                <td className="py-3 pl-4 pr-4">
                  {row.current_pick ? (
                    <TeamChip team={row.current_pick} size={18} />
                  ) : row.pick_locked ? (
                    <span className="pill pill-alive">✓ Pick In</span>
                  ) : (
                    <span className="text-xs italic" style={{ color: 'var(--red)' }}>no pick yet</span>
                  )}
                </td>
              </tr>
            ))}

            {sortedElimRows.length > 0 && (
              <tr>
                <td colSpan={3} className="pt-6 pb-1.5 pl-4">
                  <span className="pill pill-out">♦ {sortedElimRows.length} Eliminated</span>
                </td>
              </tr>
            )}
            {sortedElimRows.map((row) => (
              <tr key={row.player_id} className="border-t" style={{ borderColor: 'var(--border)', opacity: 0.65 }}>
                <td className="py-2.5 pl-4 text-sm" style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>{row.full_name}</td>
                <td className="py-2.5 px-4 hidden sm:table-cell">
                  <span className="pill pill-out">Out{row.elimination_week ? ` · Wk ${row.elimination_week}` : ''}</span>
                </td>
                <td className="py-2.5 pl-4 pr-4 text-xs" style={{ color: 'var(--muted)' }}>
                  {row.elimination_reason ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
