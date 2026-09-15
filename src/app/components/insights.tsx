// Editorial modules for the dashboard.
//
// Each one is built the same way: a kicker, a sentence that states what the
// data found, the chart that shows it, and a method note. The sentence comes
// from lib/insights.ts — the same computation the chart draws — so the prose
// and the picture cannot drift apart.
//
// These are server components. The dashboard is CDN-cached (revalidate = 60)
// and serves ~1k concurrent viewers, so the hover layer is pure CSS and no
// chart library ships to the browser.

import { NFL_TEAM_NAMES } from '@/types'
import { teamColor } from '@/lib/teamColors'
import TeamChip from './TeamChip'
import type {
  ExposureModule,
  LeverageModule,
  OverlapModule,
  ScarcityModule,
} from '@/lib/insights'

const teamName = (t: string) => NFL_TEAM_NAMES[t] ?? t

export function Story({
  kicker,
  lede,
  deck,
  method,
  children,
  id,
}: {
  kicker: string
  lede?: string
  deck?: string
  method?: string
  children?: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} className="pt-10">
      <p className="kicker">{kicker}</p>
      {lede && <h2 className="lede mt-2">{lede}</h2>}
      {deck && <p className="deck mt-2.5">{deck}</p>}
      {children && <div className="mt-5">{children}</div>}
      {method && <p className="method">{method}</p>}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Exposure — revealed pick counts and the still-hidden field          */
/* ------------------------------------------------------------------ */

export function ExposureFigure({ data }: { data: ExposureModule }) {
  const { rows, aliveCount, hiddenCount } = data
  const widthOf = (count: number) => `${(count / Math.max(aliveCount, 1)) * 100}%`

  return (
    <div className="card p-4 sm:p-5">
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.team}
            className="grid items-center"
            style={{ gridTemplateColumns: '58px 1fr 48px', columnGap: 12 }}
          >
            <TeamChip team={row.team} size={18} />
            <div className="bar-track" style={{ height: 15 }}>
              <div
                className="bar-fill"
                style={{ width: widthOf(row.count), background: teamColor(row.team).primary }}
              />
            </div>
            <span className="text-right text-sm font-bold tnum" style={{ color: 'var(--ink)' }}>
              {row.count}
            </span>
          </div>
        ))}

        {hiddenCount > 0 && (
          <div
            className="grid items-center"
            style={{ gridTemplateColumns: '58px 1fr 48px', columnGap: 12 }}
          >
            <span className="eyebrow" style={{ fontSize: 9 }}>Hidden</span>
            <div className="bar-track" style={{ height: 15 }}>
              <div
                className="bar-fill"
                style={{
                  width: widthOf(hiddenCount),
                  background:
                    'repeating-linear-gradient(135deg, var(--border) 0 5px, var(--surface-sunken) 5px 10px)',
                }}
              />
            </div>
            <div className="text-right leading-tight">
              <span className="text-sm font-bold tnum" style={{ color: 'var(--muted)' }}>
                {hiddenCount}
              </span>
              <span className="block" style={{ fontSize: 10, color: 'var(--muted)' }}>unknown</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Leverage — what a survivor stands to gain if the chalk falls        */
/* ------------------------------------------------------------------ */

export function LeverageTable({ data, limit = 12 }: { data: LeverageModule; limit?: number }) {
  const shown = data.rows.slice(0, limit)
  const hidden = data.rows.length - shown.length

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--surface-sunken)' }}>
            <th className="py-2.5 pl-4 pr-2 text-left eyebrow">Survivor</th>
            <th className="py-2.5 px-2 text-left eyebrow">Pick</th>
            {/* Four tracked columns overflow a 390px viewport. "Shared" is
                implied by Best case (an N-way split means N-1 others), so it
                is the one that goes on a phone. */}
            <th className="py-2.5 px-3 text-right eyebrow whitespace-nowrap hidden sm:table-cell">Shared</th>
            <th className="py-2.5 pl-2 pr-4 text-right eyebrow whitespace-nowrap">Best case</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const alone = row.bestCaseField === 1
            return (
              <tr key={row.player_id} className="row-hover border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="py-2.5 pl-4 pr-2 relative">
                  {alone && (
                    <span className="absolute left-0 top-0 h-full" style={{ width: 3, background: 'var(--red)' }} />
                  )}
                  <span className="font-bold" style={{ color: 'var(--ink)' }}>{row.full_name}</span>
                </td>
                <td className="py-2.5 px-2"><TeamChip team={row.team} size={18} /></td>
                <td className="py-2.5 px-3 text-right tnum hidden sm:table-cell" style={{ color: row.sharedWith === 0 ? 'var(--red)' : 'var(--ink-2)' }}>
                  {row.sharedWith === 0 ? 'alone' : row.sharedWith}
                </td>
                <td className="py-2.5 pl-2 pr-4 text-right leading-tight whitespace-nowrap">
                  <span className="font-bold tnum" style={{ color: 'var(--ink)' }}>
                    {row.bestCaseField === 1 ? 'wins pool' : `${row.bestCaseField}-way`}
                  </span>
                  <span className="block tnum" style={{ fontSize: 10, color: 'var(--muted)' }}>${row.impliedPayout}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {hidden > 0 && (
        <p className="px-4 py-2.5 text-xs border-t" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
          {hidden} more {hidden === 1 ? 'survivor' : 'survivors'} on more crowded teams — full board in the{' '}
          <a href="/grid" className="underline">pick grid</a>.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Burn map — which teams are spent, and who still holds what          */
/* ------------------------------------------------------------------ */

const BURN_STEPS = ['var(--burn-0)', 'var(--burn-1)', 'var(--burn-2)', 'var(--burn-3)', 'var(--burn-4)', 'var(--burn-5)']

function burnStep(share: number): number {
  if (share <= 0) return 0
  if (share <= 0.2) return 1
  if (share <= 0.4) return 2
  if (share <= 0.6) return 3
  if (share <= 0.8) return 4
  return 5
}

export function BurnMap({ data }: { data: ScarcityModule }) {
  const { rows, aliveCount, uniqueHolds, exhausted } = data
  const sorted = [...rows].sort((a, b) => b.burnedBy - a.burnedBy || a.team.localeCompare(b.team))

  return (
    <div className="space-y-3">
      <div className="card p-4 sm:p-5">
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
          {sorted.map((row) => {
            const share = aliveCount > 0 ? row.burnedBy / aliveCount : 0
            const step = burnStep(share)
            const onDark = step >= 4
            return (
              <div
                key={row.team}
                className="burn-cell hint"
                style={{ background: BURN_STEPS[step] }}
              >
                <span
                  className="block text-[11px] font-extrabold leading-none"
                  style={{ color: onDark ? 'var(--cream)' : 'var(--ink)' }}
                >
                  {row.team}
                </span>
                <span
                  className="block tnum leading-none mt-1 font-bold"
                  style={{ fontSize: 9.5, color: onDark ? 'var(--cream)' : 'var(--ink-2)' }}
                >
                  {row.availableTo}
                </span>
                <span className="hint-body">
                  {teamName(row.team)} · {row.burnedBy} of {aliveCount} survivors have spent it
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="eyebrow" style={{ fontSize: 9 }}>Spent by</span>
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>none</span>
          <span className="flex gap-0.5">
            {BURN_STEPS.map((c) => (
              <span key={c} style={{ background: c, width: 22, height: 10, borderRadius: 2 }} />
            ))}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--muted)' }}>all {aliveCount}</span>
          <span className="text-[10px] ml-1" style={{ color: 'var(--muted)' }}>· small number = survivors who can still play it</span>
        </div>
      </div>

      {(uniqueHolds.length > 0 || exhausted.length > 0) && (
        <div className="card p-4 sm:p-5 grid sm:grid-cols-2 gap-x-8 gap-y-4">
          {uniqueHolds.length > 0 && (
            <div>
              <p className="eyebrow mb-2">Last one holding it</p>
              <ul className="space-y-1.5">
                {uniqueHolds.slice(0, 6).map((u) => (
                  <li key={u.team} className="flex items-center gap-2.5 text-sm">
                    <TeamChip team={u.team} size={18} />
                    <span style={{ color: 'var(--ink-2)' }}>{u.holder}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {exhausted.length > 0 && (
            <div>
              <p className="eyebrow mb-2">Off the board for everyone</p>
              <div className="flex flex-wrap gap-1.5">
                {exhausted.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] font-bold px-2 py-1 rounded"
                    style={{ background: 'var(--surface-sunken)', color: 'var(--muted)', textDecoration: 'line-through' }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Overlap — how alike survivors' remaining boards have become         */
/* ------------------------------------------------------------------ */

export function OverlapFigure({ data }: { data: OverlapModule }) {
  const pairs = [
    data.mostAlike ? { label: 'Most alike', ...data.mostAlike, accent: 'var(--red)' } : null,
    // Red flags convergence, which is the risk worth seeing. The other pair is
    // neutral ink — "least alike" is not a good/bad state, so it doesn't get a
    // status color.
    data.mostDivergent ? { label: 'Least alike', ...data.mostDivergent, accent: 'var(--ink-2)' } : null,
  ].filter(Boolean) as { label: string; a: string; b: string; overlap: number; accent: string }[]

  return (
    <div className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
      <div className="shrink-0">
        <p className="figure-num text-6xl" style={{ color: 'var(--ink)' }}>{Math.round(data.average * 100)}%</p>
        <p className="eyebrow mt-1.5">Average board overlap</p>
      </div>
      <div className="flex-1 space-y-3 min-w-0">
        {pairs.map((p) => (
          <div key={p.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-bold truncate" style={{ color: 'var(--ink)' }}>
                {p.a} <span style={{ color: 'var(--muted)' }}>&amp;</span> {p.b}
              </span>
              <span className="text-xs tnum shrink-0" style={{ color: 'var(--ink-2)' }}>{Math.round(p.overlap * 100)}%</span>
            </div>
            <div className="mt-1 bar-track" style={{ height: 8 }}>
              <div className="bar-fill" style={{ width: `${p.overlap * 100}%`, background: p.accent }} />
            </div>
            <p className="eyebrow mt-1" style={{ fontSize: 9 }}>{p.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
