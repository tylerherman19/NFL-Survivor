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
  ChalkModule,
  ExposureModule,
  LeverageModule,
  OverlapModule,
  ScarcityModule,
  TrajectoryModule,
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
  /** Omitted when this finding already leads the page — never print it twice. */
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
/* Exposure — how much of the field one result can take out            */
/* ------------------------------------------------------------------ */

export function ExposureFigure({ data }: { data: ExposureModule }) {
  const { rows, aliveCount, hiddenCount, complete, floor, worstCase } = data
  const showHalfLine = aliveCount >= 4

  // Bars are measured against the whole surviving field, not against the
  // biggest bar. "Six of fourteen" is the fact that matters; scaling to the
  // leader would make a scattered week look identical to a concentrated one.
  const widthOf = (count: number) => `${(count / Math.max(aliveCount, 1)) * 100}%`

  return (
    <div className="card p-4 sm:p-5">
      {showHalfLine && (
        <div className="grid items-end mb-1.5" style={{ gridTemplateColumns: '58px 1fr 84px', columnGap: 12 }}>
          <div />
          <div className="relative h-4">
            <span
              className="absolute eyebrow whitespace-nowrap"
              style={{ left: '50%', bottom: 0, transform: 'translateX(-50%)', fontSize: 9 }}
            >
              half the field
            </span>
          </div>
          <div />
        </div>
      )}

      <div className="relative">
        {showHalfLine && (
          <div
            className="absolute inset-0 grid pointer-events-none"
            style={{ gridTemplateColumns: '58px 1fr 84px', columnGap: 12 }}
            aria-hidden
          >
            <div />
            <div className="relative">
              <span className="absolute top-0 bottom-0" style={{ left: '50%', width: 1, background: 'var(--axis)' }} />
            </div>
            <div />
          </div>
        )}

        <div className="relative space-y-2">
          {rows.map((row) => (
            <div
              key={row.team}
              className="grid items-center"
              style={{ gridTemplateColumns: '58px 1fr 84px', columnGap: 12 }}
            >
              <TeamChip team={row.team} size={18} />
              <div className="hint">
                <div className="bar-track" style={{ height: 15 }}>
                  <div className="bar-fill" style={{ width: widthOf(row.count), background: teamColor(row.team).primary }} />
                </div>
                <span className="hint-body">
                  {row.count} on {teamName(row.team)} · a loss leaves {row.survivorsIfLoses}
                </span>
              </div>
              <div className="text-right leading-tight">
                <span className="text-sm font-bold tnum" style={{ color: 'var(--ink)' }}>{row.count}</span>
                <span className="block tnum" style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {row.survivorsIfLoses} left
                </span>
              </div>
            </div>
          ))}

          {hiddenCount > 0 && (
            <div className="grid items-center" style={{ gridTemplateColumns: '58px 1fr 84px', columnGap: 12 }}>
              <span className="eyebrow" style={{ fontSize: 9 }}>Hidden</span>
              {/* .bar-track clips its overflow, so the tooltip has to hang off a
                  wrapper outside it rather than off the track itself. */}
              <div className="hint">
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
                <span className="hint-body">{hiddenCount} picks not public until their game locks</span>
              </div>
              <div className="text-right leading-tight">
                <span className="text-sm font-bold tnum" style={{ color: 'var(--muted)' }}>{hiddenCount}</span>
                <span className="block" style={{ fontSize: 10, color: 'var(--muted)' }}>unknown</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {worstCase && (
        <div
          className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 rounded"
          style={{ background: 'var(--red-tint)' }}
        >
          <span className="eyebrow" style={{ color: 'var(--red)', fontSize: 9 }}>
            {complete ? 'Worst single result' : 'Worst result so far'}
          </span>
          <span className="text-sm" style={{ color: 'var(--ink)' }}>
            {teamName(worstCase.team)} lose →{' '}
            <strong className="tnum">{floor}</strong> of {aliveCount} survive
          </span>
        </div>
      )}
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
/* Trajectory — the field over time, annotated                         */
/* ------------------------------------------------------------------ */

export function TrajectoryFigure({ data }: { data: TrajectoryModule }) {
  const { points, start, aliveCount, bloodiest, halvingWeek, projectedEndWeek } = data
  const series = [{ week_number: 0, remaining: start }, ...points.map((p) => ({ week_number: p.week_number, remaining: p.remaining }))]
  const lastWeek = series[series.length - 1].week_number
  const maxWeek = Math.max(projectedEndWeek ?? lastWeek, lastWeek, 1)
  const maxY = Math.max(start, 1)

  // Inset the plot so the end markers and the last elimination bar sit inside
  // the card rather than half-hanging off its edge.
  const PAD = 2.5
  const px = (week: number) => PAD + (week / maxWeek) * (100 - 2 * PAD)
  const py = (v: number) => (1 - v / maxY) * 100

  const linePts = series.map((s) => `${px(s.week_number)},${py(s.remaining)}`).join(' ')
  const areaPts = `${px(0)},100 ${linePts} ${px(lastWeek)},100`
  const barWidth = `${Math.min(Math.max(56 / maxWeek, 2), 9)}%`
  const projectionPts =
    projectedEndWeek && aliveCount > 1
      ? `${px(lastWeek)},${py(aliveCount)} ${px(projectedEndWeek)},${py(1)}`
      : null

  const maxOut = Math.max(...points.map((p) => p.eliminated), 1)

  return (
    <div className="card p-4 sm:p-5">
      {/* Remaining field. preserveAspectRatio="none" lets the plot fill any
          width; every label lives in the HTML layer above it so text never
          scales with the box. */}
      <div className="relative" style={{ height: 168 }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="trajFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--green)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--green)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <line x1="0" y1={py(start / 2)} x2="100" y2={py(start / 2)} stroke="var(--axis)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <polygon points={areaPts} fill="url(#trajFill)" />
          <polyline points={linePts} fill="none" stroke="var(--green)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {projectionPts && (
            <polyline points={projectionPts} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        <div className="absolute inset-0 pointer-events-none">
          {/* Half-the-field reference. Kept on the left: the series always ends
              at the right edge, and its "N left" callout lives there. */}
          <span
            className="absolute eyebrow"
            style={{ top: `calc(${py(start / 2)}% - 14px)`, left: 0, fontSize: 9 }}
          >
            half the field
          </span>

          {series.map((s) => {
            const isLast = s.week_number === lastWeek
            return (
              <span
                key={s.week_number}
                className="absolute rounded-full"
                style={{
                  left: `${px(s.week_number)}%`,
                  top: `${py(s.remaining)}%`,
                  transform: 'translate(-50%, -50%)',
                  width: isLast ? 10 : 7,
                  height: isLast ? 10 : 7,
                  background: 'var(--surface)',
                  border: `2px solid var(--green)`,
                }}
              />
            )
          })}

          {/* The one point worth calling out by name. */}
          {bloodiest && bloodiest.eliminated > 0 && (
            <span
              className="absolute text-[10px] font-bold whitespace-nowrap"
              style={{
                left: `${px(bloodiest.week_number)}%`,
                top: `${py(points.find((p) => p.week_number === bloodiest.week_number)?.remaining ?? 0)}%`,
                transform: 'translate(-50%, -175%)',
                color: 'var(--red)',
              }}
            >
              Wk {bloodiest.week_number} · −{bloodiest.eliminated}
            </span>
          )}

          <span
            className="absolute font-bold text-xs whitespace-nowrap"
            style={{ left: `${px(lastWeek)}%`, top: `${py(aliveCount)}%`, transform: 'translate(-102%, -215%)', color: 'var(--green)' }}
          >
            {aliveCount} left
          </span>

          {projectedEndWeek && (
            <span
              className="absolute eyebrow whitespace-nowrap"
              style={{ left: `${px(projectedEndWeek)}%`, top: `${py(1)}%`, transform: 'translate(-100%, -140%)', fontSize: 9 }}
            >
              ≈ Wk {projectedEndWeek}
            </span>
          )}
        </div>
      </div>

      {/* Eliminations per week — same x scale, its own axis. Two measures, two
          plots; never two scales on one chart. The hover wrapper has to sit
          inside the positioned column: .hint carries position:relative and
          would otherwise cancel the absolute placement. */}
      <p className="eyebrow mt-5" style={{ fontSize: 9 }}>Eliminations per week</p>
      <div className="relative mt-1.5" style={{ height: 44 }}>
        <span className="absolute left-0 right-0 bottom-0" style={{ height: 1, background: 'var(--grid)' }} />
        {points.map((p) => (
          <div
            key={p.week_number}
            className="absolute"
            style={{ left: `${px(p.week_number)}%`, bottom: 0, transform: 'translateX(-50%)', width: barWidth }}
          >
            <div className="hint">
              <div
                style={{
                  height: Math.max((p.eliminated / maxOut) * 40, p.eliminated > 0 ? 3 : 0),
                  background: p.week_number === bloodiest?.week_number ? 'var(--red)' : 'var(--burn-2)',
                  borderRadius: '3px 3px 0 0',
                }}
              />
              <span className="hint-body">
                Wk {p.week_number}: {p.eliminated} out{p.topTeam && p.topTeam !== 'no pick' ? ` · mostly ${p.topTeam}` : ''}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-2" style={{ height: 14 }}>
        {[0, ...points.map((p) => p.week_number)].map((w) => (
          <span
            key={w}
            className="absolute eyebrow tnum"
            style={{ left: `${px(w)}%`, transform: 'translateX(-50%)', fontSize: 9 }}
          >
            {w === 0 ? 'Start' : w}
          </span>
        ))}
      </div>
      {halvingWeek && (
        <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
          Dashed line marks half the starting field, crossed in Week {halvingWeek}.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Chalk — has following the crowd worked?                             */
/* ------------------------------------------------------------------ */

export function ChalkFigure({ data }: { data: ChalkModule }) {
  const { weeks, contrarians } = data
  const top = contrarians.filter((c) => c.offChalk > 0).slice(0, 4)

  return (
    <div className="space-y-3">
      <div className="card p-4 sm:p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
          {weeks.map((w) => {
            const share = w.totalPicks > 0 ? w.count / w.totalPicks : 0
            const lost = w.outcome === 'lost'
            return (
              <div key={w.week_number}>
                <div className="flex items-baseline justify-between">
                  <span className="eyebrow" style={{ fontSize: 9 }}>Wk {w.week_number}</span>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: lost ? 'var(--red)' : w.outcome === 'won' ? 'var(--green)' : 'var(--muted)' }}
                  >
                    {lost ? '✕ lost' : w.outcome === 'won' ? '✓ won' : '—'}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <TeamChip team={w.team} size={16} />
                </div>
                <div className="mt-1.5 hint">
                  <div className="bar-track" style={{ height: 10 }}>
                    <div
                      className="bar-fill"
                      style={{ width: `${Math.max(share * 100, 4)}%`, background: lost ? 'var(--red)' : 'var(--green)' }}
                    />
                  </div>
                  <span className="hint-body">
                    {w.count} of {w.totalPicks} picks on {w.team}
                    {w.eliminated > 0 ? ` · ${w.eliminated} eliminated that week` : ''}
                  </span>
                </div>
                <p className="mt-1 tnum" style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {w.count}/{w.totalPicks} on the crowd pick
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {top.length > 0 && (
        <div className="card p-4 sm:p-5">
          <p className="eyebrow mb-3">Who leaves the crowd</p>
          <div className="space-y-2">
            {top.map((c) => (
              <div key={c.player_id} className="flex items-center gap-3">
                <span className="text-sm font-bold w-28 sm:w-40 shrink-0 truncate" style={{ color: 'var(--ink)' }}>{c.full_name}</span>
                <div className="flex-1 bar-track" style={{ height: 10 }}>
                  <div
                    className="bar-fill"
                    style={{ width: `${(c.offChalk / Math.max(c.weeks, 1)) * 100}%`, background: 'var(--dark)' }}
                  />
                </div>
                <span className="text-xs tnum w-20 sm:w-24 text-right shrink-0" style={{ color: 'var(--ink-2)' }}>
                  {c.offChalk} of {c.weeks} wks
                </span>
              </div>
            ))}
          </div>
        </div>
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
