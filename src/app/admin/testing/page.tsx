import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { isTestMode, createTestInviteToken } from '@/lib/testMode'
import { sandboxSupabase } from '@/lib/supabase'
import TestingPanel from './TestingPanel'

export interface SandboxSnapshot {
  ok: boolean
  error: string | null
  players: { id: string; full_name: string; email: string; status: string }[]
  activeWeek: { week_number: number; season_year: number } | null
  gameCount: number
  pickCount: number
}

async function getSandboxSnapshot(): Promise<SandboxSnapshot> {
  const empty = { players: [], activeWeek: null, gameCount: 0, pickCount: 0 }
  try {
    const { data: players, error } = await sandboxSupabase
      .from('players')
      .select('id, full_name, email, status')
      .order('full_name')
    // Surface schema-setup problems (missing migration / unexposed schema)
    // right in the panel instead of failing silently everywhere.
    if (error) return { ok: false, error: error.message, ...empty }

    const [{ data: week }, { count: gameCount }, { count: pickCount }] = await Promise.all([
      sandboxSupabase.from('weeks').select('week_number, season_year').eq('is_active', true).single(),
      sandboxSupabase.from('games').select('id', { count: 'exact', head: true }),
      sandboxSupabase.from('picks').select('id', { count: 'exact', head: true }),
    ])

    return {
      ok: true,
      error: null,
      players: players || [],
      activeWeek: week ?? null,
      gameCount: gameCount ?? 0,
      pickCount: pickCount ?? 0,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sandbox unreachable', ...empty }
  }
}

export default async function TestingPage() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) redirect('/admin/login')

  const testMode = await isTestMode()
  // The panel only renders sandbox state while testing mode is on — skip the
  // four sandbox queries otherwise.
  const snapshot: SandboxSnapshot = testMode
    ? await getSandboxSnapshot()
    : { ok: true, error: null, players: [], activeWeek: null, gameCount: 0, pickCount: 0 }
  const inviteToken = testMode ? await createTestInviteToken() : null

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">🧪 Testing Mode</h1>
        <p className="text-slate-400 mt-1">
          A black-box sandbox: separate players, schedule, picks, and results living in their own
          database schema. While enabled, this browser sees the entire site — picks, standings,
          grading, auto-assign, everything — running against sandbox data. Other visitors are unaffected.
        </p>
      </div>
      <TestingPanel testMode={testMode} snapshot={snapshot} inviteToken={inviteToken} />
    </div>
  )
}
