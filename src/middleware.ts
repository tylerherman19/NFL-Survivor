import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const ADMIN_COOKIE = 'survivor_admin'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === '/admin/login') return NextResponse.next()

  const token = req.cookies.get(ADMIN_COOKIE)?.value
  if (!token) {
    return NextResponse.redirect(new URL('/admin/login', req.url))
  }

  try {
    const secret = process.env.SESSION_SECRET
    if (!secret) return NextResponse.redirect(new URL('/admin/login', req.url))
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
    // A valid signature alone is insufficient: player session tokens are signed
    // with the same secret. Require the is_admin claim set only for admin sessions.
    if (payload.is_admin !== true) {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/admin/login', req.url))
  }
}

export const config = {
  matcher: ['/admin/:path*'],
}
