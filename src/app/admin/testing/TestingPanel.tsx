'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SandboxSnapshot } from './page'

// Amber matches the TEST MODE banner — the sandbox's signature color.
const AMBER = '#b45309'

export default function TestingPanel({
  testMode,
  snapshot,
  inviteToken,
}: {
  testMode: boolean
  snapshot: SandboxSnapshot
  inviteToken: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seedUsers, setSeedUsers] = useState(8)

  async function callTestMode(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/test-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Request failed')
        return null
      }
      return data
    } catch {
      setError('Network error')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function runCron(label: string, path: string) {
    setBusy(path)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(path)
      const data = await res.json()
      if (!res.ok) setError(data.error || `${label} failed`)
      else setMessage(`${label}: ${JSON.stringify(data.results ?? data.grading ?? data.message ?? data)}`)
    } catch {
      setError('Network error')
    } finally {
      setBusy(null)
      router.refresh()
    }
  }

  // Origin is only known in the browser — null on the server snapshot avoids
  // a hydration mismatch.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => null
  )
  const inviteUrl =
    inviteToken && origin ? `${origin}/api/test-mode/join?token=${encodeURIComponent(inviteToken)}` : null

  const secondaryButton = 'card px-4 py-2 text-sm font-semibold transition-colors hover:border-[var(--border-strong)]'

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="card p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-bold" style={{ color: 'var(--dark)' }}>
            Status:{' '}
            {testMode ? (
              <span style={{ color: AMBER }}>ENABLED — this browser is in the sandbox</span>
            ) : (
              <span style={{ color: 'var(--muted)' }}>off — this browser sees production</span>
            )}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Applies only to browsers holding the testing cookie. Closing the browser exits automatically.
          </p>
        </div>
        <button
          onClick={async () => {
            const data = await callTestMode(testMode ? 'disable' : 'enable')
            if (data) router.refresh()
          }}
          disabled={busy !== null}
          className="rounded-lg px-5 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-50"
          style={{ background: testMode ? 'var(--muted)' : AMBER }}
        >
          {busy === 'enable' || busy === 'disable'
            ? 'Working…'
            : testMode
            ? 'Exit Testing Mode'
            : 'Enter Testing Mode'}
        </button>
      </div>

      {(message || error) && (
        <div
          className="card p-4 text-sm break-all"
          style={
            error
              ? { borderColor: 'var(--red)', background: 'var(--red-tint)', color: 'var(--red)' }
              : { borderColor: 'var(--green)', background: 'var(--green-tint)', color: 'var(--green)' }
          }
        >
          {error || message}
        </div>
      )}

      {testMode && !snapshot.ok && (
        <div className="card p-5 space-y-2" style={{ borderColor: 'var(--red)', background: 'var(--red-tint)' }}>
          <p className="font-bold" style={{ color: 'var(--red)' }}>Sandbox database is not reachable</p>
          <p className="text-sm" style={{ color: 'var(--dark)' }}>{snapshot.error}</p>
          <ol className="list-decimal pl-5 text-sm space-y-1" style={{ color: 'var(--dark)' }}>
            <li>Run <code className="font-mono" style={{ color: AMBER }}>supabase/migrations/004_testing_sandbox.sql</code> in the Supabase SQL editor.</li>
            <li>In Supabase: Settings → API → Exposed schemas → add <code className="font-mono" style={{ color: AMBER }}>sandbox</code>.</li>
          </ol>
        </div>
      )}

      {testMode && snapshot.ok && (
        <>
          {/* Sandbox state */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Test Players" value={snapshot.players.length} />
            <Stat
              label="Active Week"
              value={snapshot.activeWeek ? `Wk ${snapshot.activeWeek.week_number}` : '—'}
            />
            <Stat label="Games" value={snapshot.gameCount} />
            <Stat label="Picks" value={snapshot.pickCount} />
          </div>

          {/* Seed / reset */}
          <div className="card p-5 space-y-4">
            <p className="eyebrow">Sandbox Data</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm" style={{ color: 'var(--dark)' }}>
                Test users:{' '}
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={seedUsers}
                  onChange={(e) => setSeedUsers(Number(e.target.value))}
                  className="field w-16 px-2 py-1"
                  style={{ color: 'var(--dark)' }}
                />
              </label>
              <button
                onClick={async () => {
                  const data = await callTestMode('seed', { users: seedUsers })
                  if (data) {
                    setMessage(
                      `Seeded: ${data.created_users} new test users (PIN ${data.pin}), Week ${data.week_number} with ${data.games} games.`
                    )
                    router.refresh()
                  }
                }}
                disabled={busy !== null}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: 'var(--green)' }}
              >
                {busy === 'seed' ? 'Seeding…' : 'Seed Test Week + Users'}
              </button>
              <button
                onClick={async () => {
                  if (!confirm('Delete ALL sandbox data (players, weeks, games, picks)? Production is untouched.')) return
                  const data = await callTestMode('reset')
                  if (data) {
                    setMessage('Sandbox wiped clean.')
                    router.refresh()
                  }
                }}
                disabled={busy !== null}
                className="rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-tint)' }}
              >
                {busy === 'reset' ? 'Resetting…' : 'Reset Sandbox'}
              </button>
            </div>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Seeding creates test users (login with their name + PIN <span className="font-mono font-bold" style={{ color: 'var(--dark)' }}>1234</span>)
              and a one-week slate anchored on next Sunday: a locked Thursday game, three Sunday games, SNF and MNF.
              Prefer your own slate? Build it in{' '}
              <Link href="/admin/schedule" className="underline font-semibold" style={{ color: 'var(--dark)' }}>Schedule</Link> — while testing mode is
              on, every admin page edits the sandbox.
            </p>
          </div>

          {/* Test users */}
          {snapshot.players.length > 0 && (
            <div className="card p-5">
              <p className="eyebrow mb-3">Test Users ({snapshot.players.length})</p>
              <div className="flex flex-wrap gap-2">
                {snapshot.players.map((p) => (
                  <span
                    key={p.id}
                    className={`pill ${p.status === 'alive' ? 'pill-alive' : 'pill-out'}`}
                    style={p.status === 'alive' ? undefined : { textDecoration: 'line-through' }}
                  >
                    {p.full_name}
                  </span>
                ))}
              </div>
              <p className="text-sm mt-3" style={{ color: 'var(--muted)' }}>
                Add more via <Link href="/admin/players" className="underline font-semibold" style={{ color: 'var(--dark)' }}>Manage Players</Link> (CSV
                import), the public <Link href="/signup" className="underline font-semibold" style={{ color: 'var(--dark)' }}>signup form</Link>, or
                another seed run.
              </p>
            </div>
          )}

          {/* Simulate cron jobs */}
          <div className="card p-5 space-y-3">
            <p className="eyebrow">Simulate Scheduled Jobs</p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => runCron('Auto-assign', '/api/cron/auto-assign')}
                disabled={busy !== null}
                className={secondaryButton}
                style={{ color: 'var(--dark)' }}
              >
                {busy === '/api/cron/auto-assign' ? 'Running…' : 'Run Auto-Assign'}
              </button>
              <button
                onClick={() => runCron('Result sync', '/api/cron/sync-results')}
                disabled={busy !== null}
                className={secondaryButton}
                style={{ color: 'var(--dark)' }}
              >
                {busy === '/api/cron/sync-results' ? 'Running…' : 'Run ESPN Result Sync'}
              </button>
            </div>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              These hit the same endpoints Vercel Cron does, but run against the sandbox. Auto-assign only acts once
              the Sunday deadline has passed; result sync only matches games that exist on the real ESPN scoreboard —
              for made-up matchups enter results by hand in{' '}
              <Link href="/admin/results" className="underline font-semibold" style={{ color: 'var(--dark)' }}>Results</Link>.
            </p>
          </div>

          {/* Invite link */}
          {inviteUrl && (
            <div className="card p-5 space-y-2">
              <p className="eyebrow">Invite a Tester</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Opening this link puts that device into the sandbox (no admin access). Valid for 7 days.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded px-3 py-2 text-xs font-mono" style={{ background: 'var(--surface-sunken)', color: AMBER }}>{inviteUrl}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl)
                    setMessage('Invite link copied.')
                  }}
                  className="rounded-md px-3 py-2 text-xs font-semibold text-white"
                  style={{ background: 'var(--dark)' }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Shortcuts */}
          <div className="card p-5">
            <p className="eyebrow mb-3">Test the Full Flow</p>
            <div className="flex flex-wrap gap-3 text-sm">
              {(
                [
                  ['/', 'Standings'],
                  ['/login', 'Player Login'],
                  ['/pick', 'Submit Pick'],
                  ['/grid', 'Pick Grid'],
                  ['/live', 'Sweat Board'],
                  ['/admin/schedule', 'Schedule'],
                  ['/admin/results', 'Results'],
                  ['/admin/players', 'Players'],
                  ['/admin/recap', 'Recap'],
                ] as [string, string][]
              ).map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className={secondaryButton}
                  style={{ color: 'var(--dark)' }}
                >
                  {label} →
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4 text-center">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-3xl leading-none tnum" style={{ color: 'var(--dark)' }}>{value}</p>
    </div>
  )
}
