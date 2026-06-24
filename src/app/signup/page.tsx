'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [venmo, setVenmo] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          venmo: venmo.trim() || undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Signup failed')
        return
      }

      setDone(true)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <p className="text-5xl">🎉</p>
          <h1 className="text-2xl font-bold text-white">You&apos;re signed up!</h1>
          <p className="text-slate-300">
            Check your email — your 6-digit PIN is on its way. You&apos;ll need it to log in and submit picks each week.
          </p>
          <p className="text-slate-400 text-sm">
            Don&apos;t forget to Venmo <strong className="text-white">@griffinsell</strong> $25 to secure your spot.
          </p>
          <Link
            href="/login"
            className="inline-block mt-4 rounded-lg bg-green-600 px-6 py-2.5 font-semibold text-white hover:bg-green-500 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-4xl mb-3">🏈</p>
          <h1 className="text-2xl font-bold text-white">Join the Survivor Pool</h1>
          <p className="text-slate-400 mt-1 text-sm">$25 entry via Venmo to @griffinsell</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Full Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. John Smith"
              required
              autoComplete="name"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-white placeholder-slate-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-white placeholder-slate-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <p className="text-xs text-slate-500 mt-1">Your PIN will be sent here.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Phone <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(608) 555-1234"
              autoComplete="tel"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-white placeholder-slate-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Venmo Handle <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={venmo}
              onChange={(e) => setVenmo(e.target.value)}
              placeholder="@yourhandle"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-white placeholder-slate-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-600 py-2.5 font-semibold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating account…' : 'Sign Up & Get My PIN'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <p className="text-sm text-slate-400">
            Already have an account?{' '}
            <Link href="/login" className="text-green-400 hover:text-green-300 underline">
              Log in
            </Link>
          </p>
          <Link href="/" className="block text-sm text-slate-500 hover:text-slate-300">
            ← Back to standings
          </Link>
        </div>
      </div>
    </div>
  )
}
