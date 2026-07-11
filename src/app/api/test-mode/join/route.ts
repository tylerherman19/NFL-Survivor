import { NextRequest, NextResponse } from 'next/server'
import { draftMode } from 'next/headers'
import { setTestModeCookie, verifyTestInviteToken } from '@/lib/testMode'

// Entry point for the invite link shown on /admin/testing. Lets the admin
// drop another device (a friend helping test, their own phone) into the
// sandbox without sharing admin credentials. The token is signed with
// SESSION_SECRET and expires after 7 days.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token || !(await verifyTestInviteToken(token))) {
    return NextResponse.json({ error: 'Invalid or expired testing invite link' }, { status: 403 })
  }

  const draft = await draftMode()
  draft.enable()
  await setTestModeCookie()
  return NextResponse.redirect(new URL('/', req.url))
}
