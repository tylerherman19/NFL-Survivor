import { NextRequest, NextResponse, after } from 'next/server'
import { getDb } from '@/lib/testMode'
import { generatePin, hashPin } from '@/lib/pin'
import { sendWelcomeEmail } from '@/lib/email'
import { checkRateLimit, getIP } from '@/lib/rateLimit'
import { escapeIlike } from '@/lib/api'
import { haveSignupsClosed } from '@/lib/season'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  try {
    // Enforced server-side, not just hidden in the UI — the whole point is to
    // stop late signups once Week 1's picks have locked.
    if (await haveSignupsClosed()) {
      return NextResponse.json({ error: 'Signups are closed — Week 1 picks have locked.' }, { status: 403 })
    }

    const ip = await getIP()
    const { allowed } = await checkRateLimit(`signup:${ip}`, 5, 60 * 60)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many signups from this device. Try again in an hour.' },
        { status: 429 }
      )
    }

    const { full_name, email, phone, venmo } = await req.json()

    if (!full_name?.trim() || !email?.trim() || !phone?.trim() || !venmo?.trim()) {
      return NextResponse.json({ error: 'Name, email, phone, and Venmo handle are required' }, { status: 400 })
    }

    const name = full_name.trim()
    const emailLower = email.trim().toLowerCase()

    if (name.length > 80) {
      return NextResponse.json({ error: 'Name too long (max 80 characters)' }, { status: 400 })
    }
    if (emailLower.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (phone && phone.length > 20) {
      return NextResponse.json({ error: 'Phone number too long' }, { status: 400 })
    }
    if (venmo && venmo.length > 50) {
      return NextResponse.json({ error: 'Venmo handle too long' }, { status: 400 })
    }

    const supabase = await getDb()

    // Check for duplicate email. .limit(1) + maybeSingle() instead of
    // .single() — .single() errors out (leaving data undefined) when more
    // than one row matches, which would let a case-variant duplicate slip
    // past this check.
    const { data: byEmail } = await supabase
      .from('players')
      .select('id')
      .ilike('email', escapeIlike(emailLower))
      .limit(1)
      .maybeSingle()

    if (byEmail) {
      return NextResponse.json(
        { error: 'An account with that email already exists. Check your inbox for your PIN, or use "Forgot PIN" on the login page.' },
        { status: 409 }
      )
    }

    // Check for duplicate name (login key)
    const { data: byName } = await supabase
      .from('players')
      .select('id')
      .ilike('full_name', escapeIlike(name))
      .limit(1)
      .maybeSingle()

    if (byName) {
      return NextResponse.json(
        { error: 'Someone with that name is already signed up. If this is you, use "Forgot PIN" on the login page.' },
        { status: 409 }
      )
    }

    const pin = generatePin()
    const pinHash = await hashPin(pin)

    const { error: insertError } = await supabase.from('players').insert({
      full_name: name,
      email: emailLower,
      phone: phone?.trim() || null,
      venmo_handle: venmo?.trim() || null,
      pin_hash: pinHash,
      paid: false,
      status: 'alive',
    })

    if (insertError) {
      // 23505 = unique violation. Two requests can both pass the dup-checks
      // above before either commits (e.g. a double-tap submit) and then race
      // on the DB's unique email/name constraint — report that as a normal
      // "already exists" case instead of a generic 500.
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'An account with that email or name already exists. Use "Forgot PIN" on the login page.' },
          { status: 409 }
        )
      }
      console.error('signup insert error', insertError)
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
    }

    // Send the welcome email after the response goes out instead of
    // awaiting it here. Resend is a third network hop with no timeout of
    // its own; awaiting it kept the signup request open long enough to hit
    // the platform's function timeout on a slow send, which returns a
    // non-JSON error page and shows the client's generic catch-all message.
    // Failures are logged to the audit trail instead of surfaced inline —
    // the player can always use "Forgot PIN" to recover.
    after(async () => {
      const emailResult = await sendWelcomeEmail(emailLower, name, pin)
      if (!emailResult.ok) {
        await logAudit(supabase, {
          event_type: 'welcome-email-failed',
          actor: 'system',
          player_id: null,
          player_name: name,
          message: `Welcome email failed to send to ${emailLower}`,
          details: { error: emailResult.error },
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('signup error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
