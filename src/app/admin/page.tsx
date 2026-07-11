import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { getDb } from '@/lib/testMode'
import { NFL_TEAM_NAMES } from '@/types'
import Link from 'next/link'
import AdvanceWeekButton from './AdvanceWeekButton'
import SetActiveWeek from './SetActiveWeek'

export default async function AdminDashboard() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')
  const supabase = await getDb()

  const [{ data: week }, { data: players }, { data: allWeeks }] = await Promise.all([
    supabase.from('weeks').select('*').eq('is_active', true).single(),
    supabase.from('players').select('id, full_name, email, status, paid'),
    supabase.from('weeks').select('id, week_number, season_year, is_active').order('week_number'),
  ])

  const alive = players?.filter((p: { status: string }) => p.status === 'alive') || []
  const paid = players?.filter((p: { paid: boolean }) => p.paid) || []

  // Internal test accounts shouldn't clutter chase lists
  const realPlayers = (players || []).filter(
    (p: { email: string }) => !p.email?.endsWith('@nflsurvivor.internal')
  )
  const unpaidPlayers = realPlayers.filter((p: { paid: boolean }) => !p.paid)

  let pickCount = 0
  let pickDistribution: { team: string; count: number; pct: number }[] = []
  let notPickedYet: string[] = []
  let games: { id: string; home_team: string; away_team: string; result: string; game_day: string }[] = []

  if (week) {
    const [{ data: picks }, { data: gamesData }] = await Promise.all([
      supabase.from('picks').select('player_id, team').eq('week_id', week.id),
      supabase.from('games').select('id, home_team, away_team, result, game_day').eq('week_id', week.id).order('kickoff_central'),
    ])
    games = gamesData || []
    const picksData = picks || []
    pickCount = picksData.length

    const countByTeam: Record<string, number> = {}
    for (const p of picksData) {
      countByTeam[p.team] = (countByTeam[p.team] || 0) + 1
    }
    pickDistribution = Object.entries(countByTeam)
      .map(([team, count]) => ({ team, count, pct: pickCount > 0 ? (count / pickCount) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)

    const pickedIds = new Set(picksData.map((p: { player_id: string }) => p.player_id))
    notPickedYet = realPlayers
      .filter((p: { id: string; status: string }) => p.status === 'alive' && !pickedIds.has(p.id))
      .map((p: { full_name: string }) => p.full_name)
      .sort()
  }

  const gradedCount = games.filter((g) => g.result !== 'pending').length

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div>
        <h1 className="font-display text-5xl leading-none" style={{ color: 'var(--dark)' }}>ADMIN DASHBOARD</h1>
        {week && (
          <p className="mt-2 eyebrow">
            Active: Week {week.week_number} · Season {week.season_year}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Players" value={players?.length || 0} />
        <StatCard label="Paid" value={`${paid.length}/${players?.length || 0}`} />
        <StatCard label="Still Alive" value={alive.length} accent="var(--green)" />
        <StatCard label="Picks This Week" value={`${pickCount}/${alive.length}`} />
      </div>

      {!week && (
        <div className="card p-4" style={{ borderColor: 'var(--red)', background: 'var(--red-tint)' }}>
          <p className="font-bold text-sm" style={{ color: 'var(--red)' }}>No active week set.</p>
          <p className="text-sm mt-1" style={{ color: 'var(--dark)' }}>
            Go to <Link href="/admin/schedule" className="underline font-semibold">Schedule</Link> to create Week 1 and add games.
          </p>
        </div>
      )}
      {week && <AdvanceWeekButton currentWeekNumber={week.week_number} seasonYear={week.season_year} />}

      {week && (
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Pick distribution */}
          <div className="card p-4">
            <p className="eyebrow mb-3">Week {week.week_number} Pick Distribution</p>
            {pickDistribution.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No picks yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {pickDistribution.map(({ team, count, pct }) => (
                    <tr key={team} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-1.5">
                        <span className="font-mono font-bold" style={{ color: 'var(--dark)' }}>{team}</span>
                        <span className="ml-2 text-xs hidden sm:inline" style={{ color: 'var(--muted)' }}>{NFL_TEAM_NAMES[team]}</span>
                      </td>
                      <td className="py-1.5 text-right tnum" style={{ color: 'var(--dark)' }}>{count}</td>
                      <td className="py-1.5 text-right w-16 tnum" style={{ color: 'var(--muted)' }}>{pct.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Missing picks */}
          <div className="card p-4">
            <p className="eyebrow mb-3">Haven&apos;t Picked Yet ({notPickedYet.length})</p>
            {notPickedYet.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--green)' }}>Everyone alive has picked. 🎉</p>
            ) : (
              <>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--dark)' }}>{notPickedYet.join(', ')}</p>
                <Link href="/admin/email" className="inline-block mt-3 text-xs underline font-semibold" style={{ color: 'var(--dark)' }}>
                  Email these players →
                </Link>
              </>
            )}
          </div>

          {/* Games / results status */}
          <div className="card p-4">
            <p className="eyebrow mb-3">Week {week.week_number} Games ({gradedCount}/{games.length} graded)</p>
            {games.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No games entered.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {games.map((g) => (
                  <li key={g.id} className="flex items-center justify-between">
                    <span className="font-mono" style={{ color: 'var(--dark)' }}>
                      {g.away_team} @ {g.home_team}
                    </span>
                    <ResultBadge result={g.result} home={g.home_team} away={g.away_team} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Unpaid */}
          <div className="card p-4">
            <p className="eyebrow mb-3">Unpaid Players ({unpaidPlayers.length})</p>
            {unpaidPlayers.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--green)' }}>Everyone has paid. 💰</p>
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--dark)' }}>
                {unpaidPlayers.map((p: { full_name: string }) => p.full_name).sort().join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <AdminCard
          href="/admin/schedule"
          title="📅 Enter Schedule"
          desc="Add or update this week's game slate (teams, kickoff times, SNF/MNF flags)"
        />
        <AdminCard
          href="/admin/results"
          title="🏆 Enter Results"
          desc="Enter game outcomes — the app auto-grades picks and eliminates players"
        />
        <AdminCard
          href="/admin/players"
          title="👥 Manage Players"
          desc="Import CSV, toggle paid status, regen PINs, correct eliminations, submit picks"
        />
        <AdminCard
          href="/admin/recap"
          title="📋 Weekly Recap"
          desc="Generate copy-pasteable recap text for GroupMe"
        />
        <AdminCard
          href="/admin/history"
          title="📜 Season History"
          desc="Every week's games, results, pick counts, and eliminations in one view"
        />
        <AdminCard
          href="/admin/email"
          title="✉️ Email Players"
          desc="Broadcast a message to everyone, alive players, or those missing a pick"
        />
        <AdminCard
          href="/admin/testing"
          title="🧪 Testing Mode"
          desc="Black-box sandbox with its own test users and schedule — rehearse the full game flow without touching real data"
        />
      </div>

      {/* Data export */}
      <div className="card p-4">
        <p className="eyebrow mb-1">Data Export</p>
        <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
          Pick Grid is the weekly failsafe — the full pick spread (player × week, with W/L) as a
          spreadsheet that opens straight in Excel.
        </p>
        <div className="flex flex-wrap gap-3">
          <ExportButton href="/api/admin/export?type=grid" label="⬇ Export Pick Grid (Excel)" />
          <ExportButton href="/api/admin/export?type=picks" label="⬇ Export Picks CSV" />
          <ExportButton href="/api/admin/export?type=players" label="⬇ Export Players CSV" />
        </div>
      </div>

      {allWeeks && allWeeks.length > 0 && <SetActiveWeek weeks={allWeeks} />}
    </div>
  )
}

function ExportButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="card px-4 py-2 text-sm font-semibold transition-colors hover:border-[var(--border-strong)]"
      style={{ color: 'var(--dark)' }}
    >
      {label}
    </a>
  )
}

function ResultBadge({ result, home, away }: { result: string; home: string; away: string }) {
  if (result === 'pending') return <span className="text-xs italic" style={{ color: 'var(--muted)' }}>pending</span>
  if (result === 'home_win') return <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>{home} won</span>
  if (result === 'away_win') return <span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>{away} won</span>
  return <span className="text-xs font-semibold" style={{ color: 'var(--red)' }}>tie</span>
}

function StatCard({
  label,
  value,
  accent = 'var(--dark)',
}: {
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div className="card px-4 py-4 text-center relative overflow-hidden">
      <span className="absolute left-0 top-0 h-full w-1" style={{ background: accent }} />
      <p className="font-display text-4xl leading-none tnum" style={{ color: accent }}>{value}</p>
      <p className="mt-1.5 eyebrow">{label}</p>
    </div>
  )
}

function AdminCard({
  href,
  title,
  desc,
}: {
  href: string
  title: string
  desc: string
}) {
  return (
    <Link
      href={href}
      className="card block p-5 transition-all hover:border-[var(--border-strong)] hover:shadow-md"
    >
      <p className="font-bold" style={{ color: 'var(--dark)' }}>{title}</p>
      <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{desc}</p>
    </Link>
  )
}
