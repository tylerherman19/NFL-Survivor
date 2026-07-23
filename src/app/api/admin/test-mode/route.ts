import { NextRequest, NextResponse } from 'next/server'
import { draftMode } from 'next/headers'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { requireAdmin } from '@/lib/api'
import { isTestMode, setTestModeCookie, clearTestModeCookie } from '@/lib/testMode'
import { sandboxSupabase } from '@/lib/supabase'
import { hashPin } from '@/lib/pin'

const CHICAGO_TZ = 'America/Chicago'

// Every seeded test user logs in with this PIN (sandbox-only accounts).
const TEST_USER_PIN = '1234'

// A one-week slate spread across the survivor deadline rules: a Thursday game
// (locks at kickoff), three Sunday-slot games (lock Sunday 12 PM CT), SNF and
// MNF (auto-assign fallbacks). 12 distinct teams, so seeded players have
// plenty of untouched teams for multi-week testing.
const TEST_SLATE = [
  { away: 'DAL', home: 'PHI', day: 'thursday', offsetDays: -3, hour: 19, minute: 15, snf: false, mnf: false },
  { away: 'GB', home: 'CHI', day: 'sunday', offsetDays: 0, hour: 12, minute: 0, snf: false, mnf: false },
  { away: 'DET', home: 'MIN', day: 'sunday', offsetDays: 0, hour: 15, minute: 25, snf: false, mnf: false },
  { away: 'SF', home: 'LAR', day: 'sunday', offsetDays: 0, hour: 15, minute: 25, snf: false, mnf: false },
  { away: 'KC', home: 'BUF', day: 'sunday', offsetDays: 0, hour: 19, minute: 20, snf: true, mnf: false },
  { away: 'NYJ', home: 'MIA', day: 'monday', offsetDays: 1, hour: 19, minute: 15, snf: false, mnf: true },
] as const

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin()
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()
    const action = body?.action

    if (action === 'enable') {
      const draft = await draftMode()
      draft.enable()
      await setTestModeCookie()
      return NextResponse.json({ ok: true, testMode: true })
    }

    if (action === 'disable') {
      const draft = await draftMode()
      draft.disable()
      await clearTestModeCookie()
      return NextResponse.json({ ok: true, testMode: false })
    }

    // seed / reset mutate the sandbox — refuse unless this browser is
    // actually in test mode, so a stray call can never look like it worked
    // while the admin is staring at production data.
    if (!(await isTestMode())) {
      return NextResponse.json(
        { error: 'Testing mode is not enabled in this browser' },
        { status: 400 }
      )
    }

    if (action === 'reset') {
      // Order matters only for clarity — FKs cascade from weeks/players.
      const tables = ['picks', 'games', 'weeks', 'players'] as const
      for (const table of tables) {
        const { error } = await sandboxSupabase.from(table).delete().not('id', 'is', null)
        if (error) return NextResponse.json({ error: `Failed to clear ${table}: ${error.message}` }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'seed') {
      const requested = Number(body?.users)
      const userCount = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 0), 30) : 8

      // --- Test users ---
      const { data: existingPlayers, error: playersErr } = await sandboxSupabase
        .from('players')
        .select('email')
      if (playersErr) {
        return NextResponse.json(
          { error: `Sandbox unreachable: ${playersErr.message}. Run supabase/migrations/004_testing_sandbox.sql and 007_sandbox_expose.sql in the Supabase SQL editor.` },
          { status: 500 }
        )
      }
      const existingEmails = new Set((existingPlayers || []).map((p: { email: string }) => p.email))

      // One bcrypt hash shared by all seeded users — they're throwaway
      // sandbox accounts and hashing 30 PINs at cost 12 is needlessly slow.
      const pinHash = await hashPin(TEST_USER_PIN)
      const newUsers = []
      for (let i = 1; i <= userCount; i++) {
        const email = `test.player${i}@nflsurvivor.internal`
        if (existingEmails.has(email)) continue
        newUsers.push({
          full_name: `Test Player ${i}`,
          email,
          pin_hash: pinHash,
          paid: true,
          status: 'alive',
        })
      }
      if (newUsers.length > 0) {
        const { error } = await sandboxSupabase.from('players').insert(newUsers)
        if (error) return NextResponse.json({ error: `Failed to create test users: ${error.message}` }, { status: 500 })
      }

      // --- Test week + schedule ---
      const { data: weeks } = await sandboxSupabase
        .from('weeks')
        .select('week_number, season_year')
        .order('week_number', { ascending: false })
        .limit(1)
      const latest = weeks?.[0]
      const seasonYear = latest?.season_year ?? new Date().getFullYear()
      const weekNumber = (latest?.week_number ?? 0) + 1

      await sandboxSupabase.from('weeks').update({ is_active: false }).gt('week_number', 0)
      const { data: newWeek, error: weekErr } = await sandboxSupabase
        .from('weeks')
        .insert({ week_number: weekNumber, season_year: seasonYear, is_active: true })
        .select('id')
        .single()
      if (weekErr || !newWeek) {
        return NextResponse.json({ error: `Failed to create test week: ${weekErr?.message}` }, { status: 500 })
      }

      // Anchor the slate on the next Sunday (CT) so the Sunday 12 PM deadline
      // is genuinely upcoming; the Thursday game lands in the past, which
      // exercises the locked-at-kickoff path.
      const nowCt = toZonedTime(new Date(), CHICAGO_TZ)
      const daysToSunday = (7 - nowCt.getDay()) % 7 || 7
      const games = TEST_SLATE.map((g) => {
        const kickoffCt = new Date(nowCt)
        kickoffCt.setDate(nowCt.getDate() + daysToSunday + g.offsetDays)
        kickoffCt.setHours(g.hour, g.minute, 0, 0)
        return {
          week_id: newWeek.id,
          home_team: g.home,
          away_team: g.away,
          game_day: g.day,
          kickoff_central: fromZonedTime(kickoffCt, CHICAGO_TZ).toISOString(),
          is_snf: g.snf,
          is_mnf: g.mnf,
          result: 'pending',
        }
      })
      const { error: gamesErr } = await sandboxSupabase.from('games').insert(games)
      if (gamesErr) {
        return NextResponse.json({ error: `Failed to create test games: ${gamesErr.message}` }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        created_users: newUsers.length,
        week_number: weekNumber,
        games: games.length,
        pin: TEST_USER_PIN,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('test-mode error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
