import Link from 'next/link'
import LogoMark from '@/app/components/LogoMark'
import { haveSignupsClosed } from '@/lib/season'
import SignupForm from './SignupForm'

// Re-check every 60s (matches the homepage) so this doesn't freeze at
// whatever haveSignupsClosed() returned at build time — it has to flip to
// closed shortly after the Week 1 deadline, not stay stuck open for the
// page's lifetime.
export const revalidate = 60

export default async function SignupPage() {
  const signupsClosed = await haveSignupsClosed()

  if (signupsClosed) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>
        <header style={{ background: 'var(--dark)' }}>
          <div className="mx-auto max-w-5xl px-4 py-4">
            <Link href="/" className="flex items-center gap-3 font-display text-white text-xl tracking-wider">
              <LogoMark size={64} />
              NFL SURVIVOR
            </Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm card p-6 sm:p-8 text-center space-y-4">
            <p className="font-display text-4xl" style={{ color: 'var(--dark)' }}>SIGNUPS ARE CLOSED</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Week 1 picks have locked, so new entries aren&apos;t accepted anymore. Already signed up?
            </p>
            <Link href="/login" className="btn-primary inline-block font-display tracking-wider px-6 py-3">
              LOG IN
            </Link>
            <Link href="/" className="block eyebrow" style={{ color: 'var(--muted)' }}>Standings</Link>
          </div>
        </main>
      </div>
    )
  }

  return <SignupForm />
}
