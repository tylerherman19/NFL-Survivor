'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SandboxSnapshot } from './page'

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

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-white">
            Status:{' '}
            {testMode ? (
              <span className="text-amber-400">ENABLED — this browser is in the sandbox</span>
            ) : (
              <span className="text-slate-400">off — this browser sees production</span>
            )}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            Applies only to browsers holding the testing cookie. Closing the browser exits automatically.
          </p>
        </div>
        <button
          onClick={async () => {
            const data = await callTestMode(testMode ? 'disable' : 'enable')
            if (data) router.refresh()
          }}
          disabled={busy !== null}
          className={`rounded-lg px-5 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-50 ${
            testMode ? 'bg-slate-600 hover:bg-slate-500' : 'bg-amber-600 hover:bg-amber-500'
          }`}
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
          className={`rounded-xl border p-4 text-sm break-all ${
            error ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-green-500/40 bg-green-500/10 text-green-300'
          }`}
        >
          {error || message}
        </div>
      )}

      {testMode && !snapshot.ok && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 space-y-2">
          <p className="font-semibold text-red-300">Sandbox database is not reachable</p>
          <p className="text-slate-300 text-sm">{snapshot.error}</p>
          <ol className="list-decimal pl-5 text-sm text-slate-300 space-y-1">
            <li>Run <code className="text-amber-300">supabase/migrations/004_testing_sandbox.sql</code> in the Supabase SQL editor.</li>
            <li>In Supabase: Settings → API → Exposed schemas → add <code className="text-amber-300">sandbox</code>.</li>
          </ol>
        </div>
      )}

      {testMode && snapshot.ok && (
        <>
          {/* Sandbox state */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Test Players" value={snapshot.players.length} />
            <Stat
              label="Active Week"
              value={snapshot.activeWeek ? `Wk ${snapshot.activeWeek.week_number}` : '—'}
            />
            <Stat label="Games" value={snapshot.gameCount} />
            <Stat label="Picks" value={snapshot.pickCount} />
          </div>

          {/* Seed / reset */}
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 space-y-4">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Sandbox Data</p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-300">
                Test users:{' '}
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={seedUsers}
                  onChange={(e) => setSeedUsers(Number(e.target.value))}
                  className="w-16 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white"
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
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 transition-colors disabled:opacity-50"
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
                className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {busy === 'reset' ? 'Resetting…' : 'Reset Sandbox'}
              </button>
            </div>
            <p className="text-slate-400 text-sm">
              Seeding creates test users (login with their name + PIN <span className="font-mono text-white">1234</span>)
              and a one-week slate anchored on next Sunday: a locked Thursday game, three Sunday games, SNF and MNF.
              Prefer your own slate? Build it in{' '}
              <Link href="/admin/schedule" className="text-blue-400 underline">Schedule</Link> — while testing mode is
              on, every admin page edits the sandbox.
            </p>
          </div>

          {/* Test users */}
          {snapshot.players.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">
                Test Users ({snapshot.players.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {snapshot.players.map((p) => (
                  <span
                    key={p.id}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      p.status === 'alive'
                        ? 'border-green-500/40 bg-green-500/10 text-green-300'
                        : 'border-red-500/40 bg-red-500/10 text-red-300 line-through'
                    }`}
                  >
                    {p.full_name}
                  </span>
                ))}
              </div>
              <p className="text-slate-400 text-sm mt-3">
                Add more via <Link href="/admin/players" className="text-blue-400 underline">Manage Players</Link> (CSV
                import), the public <Link href="/signup" className="text-blue-400 underline">signup form</Link>, or
                another seed run.
              </p>
            </div>
          )}

          {/* Simulate cron jobs */}
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 space-y-3">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Simulate Scheduled Jobs</p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => runCron('Auto-assign', '/api/cron/auto-assign')}
                disabled={busy !== null}
                className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                {busy === '/api/cron/auto-assign' ? 'Running…' : 'Run Auto-Assign'}
              </button>
              <button
                onClick={() => runCron('Result sync', '/api/cron/sync-results')}
                disabled={busy !== null}
                className="rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                {busy === '/api/cron/sync-results' ? 'Running…' : 'Run ESPN Result Sync'}
              </button>
            </div>
            <p className="text-slate-400 text-sm">
              These hit the same endpoints Vercel Cron does, but run against the sandbox. Auto-assign only acts once
              the SNF kickoff has passed; result sync only matches games that exist on the real ESPN scoreboard —
              for made-up matchups enter results by hand in{' '}
              <Link href="/admin/results" className="text-blue-400 underline">Results</Link>.
            </p>
          </div>

          {/* Invite link */}
          {inviteUrl && (
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 space-y-2">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Invite a Tester</p>
              <p className="text-slate-400 text-sm">
                Opening this link puts that device into the sandbox (no admin access). Valid for 7 days.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded bg-slate-900 px-3 py-2 text-xs text-amber-300">{inviteUrl}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl)
                    setMessage('Invite link copied.')
                  }}
                  className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-600 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Shortcuts */}
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">Test the Full Flow</p>
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
                  className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 font-semibold text-white hover:bg-slate-600 transition-colors"
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
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-center">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  )
}
