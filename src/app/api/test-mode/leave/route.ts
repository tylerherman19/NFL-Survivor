import { NextRequest, NextResponse } from 'next/server'
import { draftMode } from 'next/headers'
import { clearTestModeCookie } from '@/lib/testMode'

// Exit the sandbox for this browser (linked from the TEST MODE banner).
// No auth needed: it only clears the caller's own cookies.
export async function GET(req: NextRequest) {
  const draft = await draftMode()
  draft.disable()
  await clearTestModeCookie()
  return NextResponse.redirect(new URL('/', req.url))
}
