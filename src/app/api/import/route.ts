import { NextRequest, NextResponse } from 'next/server'
import { getDb, isTestMode } from '@/lib/testMode'
import { getAdminSession } from '@/lib/session'
import { generatePin, hashPin } from '@/lib/pin'
import { sendWelcomeEmail } from '@/lib/email'

interface CSVRow {
  full_name: string
  phone: string
  email: string
  venmo_handle: string
  paid: boolean
}

function parseCSV(csv: string): CSVRow[] {
  const lines = csv.trim().split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return []

  // Skip header row
  const rows = lines.slice(1)
  return rows.map((line) => {
    // Simple CSV parse (handles unquoted fields)
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const [full_name = '', phone = '', email = '', venmo_handle = '', paidStr = ''] = cols
    const paid =
      paidStr.toLowerCase() === 'yes' ||
      paidStr.toLowerCase() === 'true' ||
      paidStr === '1'
    return { full_name, phone, email: email.toLowerCase(), venmo_handle, paid }
  }).filter((r) => r.full_name && r.email)
}

export async function POST(req: NextRequest) {
  const isAdmin = await getAdminSession()
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { csv } = await req.json()
    if (!csv) return NextResponse.json({ error: 'No CSV provided' }, { status: 400 })

    const rows = parseCSV(csv)
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid rows found. Check CSV format.' }, { status: 400 })
    }

    const supabase = await getDb()
    // Sandbox test users may share one email, so dedupe on name (the login
    // key) there; production keeps matching on email.
    const dedupeColumn = (await isTestMode()) ? 'full_name' : 'email'

    let count = 0
    let skipped = 0
    const errors: string[] = []

    for (const row of rows) {
      try {
        // Check if player already exists — never overwrite their PIN or send
        // a new welcome email. limit(1) instead of single(): single() errors
        // on multiple matches, which would read as "not found" and duplicate.
        const { data: existing } = await supabase
          .from('players')
          .select('id')
          .ilike(dedupeColumn, dedupeColumn === 'email' ? row.email : row.full_name)
          .limit(1)

        if (existing && existing.length > 0) {
          skipped++
          continue
        }

        const pin = generatePin()
        const pin_hash = await hashPin(pin)

        const { error } = await supabase.from('players').insert({
          full_name: row.full_name,
          phone: row.phone || null,
          email: row.email,
          venmo_handle: row.venmo_handle || null,
          paid: row.paid,
          status: 'alive',
          pin_hash,
        })

        if (error) {
          errors.push(`${row.full_name}: ${error.message}`)
          continue
        }

        await sendWelcomeEmail(row.email, row.full_name, pin)
        count++
      } catch {
        errors.push(`${row.full_name}: unexpected error`)
      }
    }

    return NextResponse.json({
      ok: true,
      count,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('import error', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
