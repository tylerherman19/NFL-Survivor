import Link from 'next/link'
import LogoMark from '@/app/components/LogoMark'
import { hasSeasonStarted } from '@/lib/season'
import SignupForm from './SignupForm'

// Re-check every 60s (matches the homepage) so this doesn't freeze at
// whatever hasSeasonStarted() returned at build time — it has to flip to
// closed shortly after kickoff, not stay stuck open for the page's lifetime.
export const revalidate = 60

export default async function SignupPage() {
  const seasonStarted = await hasSeasonStarted()

  if (seasonStarted) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>
        <header style={{ background: 'var(--dark)' }}>
          <div className="mx-auto max-w-5xl px-4 py-4">
            <Link href="/">
              <LogoMark size={44} />
            </Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm card p-6 sm:p-8 text-center space-y-4">
            <p className="font-display text-4xl" style={{ color: 'var(--dark)' }}>SIGNUPS ARE CLOSED</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              The season has started, so new entries aren&apos;t accepted anymore. Already signed up?
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
