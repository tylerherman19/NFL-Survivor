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
        body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), phone: phone.trim() || undefined, venmo: venmo.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Signup failed'); return }
      setDone(true)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>
      <header style={{ background: 'var(--dark)' }}>
        <div className="mx-auto max-w-5xl px-4 py-4">
          <Link href="/" className="font-display text-white text-lg tracking-wider">NFL SURVIVOR POOL</Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {done ? (
            <div className="text-center space-y-4">
              <p className="font-display text-5xl" style={{ color: 'var(--green)' }}>YOU&apos;RE IN!</p>
              <p className="text-sm" style={{ color: 'var(--dark)' }}>
                Check your email — your 6-digit PIN is on its way. You&apos;ll need it to log in and submit picks each week.
              </p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Don&apos;t forget to Venmo <strong style={{ color: 'var(--dark)' }}>@griffinsell</strong> $25 to lock in your spot.
              </p>
              <Link
                href="/login"
                className="inline-block font-display tracking-wider text-white px-6 py-3 mt-2"
                style={{ background: 'var(--red)' }}
              >
                LOG IN →
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-display text-5xl mb-1" style={{ color: 'var(--dark)' }}>JOIN THE POOL</h1>
              <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>$25 entry via Venmo to @griffinsell.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {[
                  { label: 'Full Name', type: 'text', val: fullName, set: setFullName, placeholder: 'e.g. John Smith', required: true, autoComplete: 'name' },
                  { label: 'Email', type: 'email', val: email, set: setEmail, placeholder: 'you@example.com', required: true, autoComplete: 'email', note: 'Your PIN will be sent here.' },
                  { label: 'Phone (optional)', type: 'tel', val: phone, set: setPhone, placeholder: '(608) 555-1234', required: false, autoComplete: 'tel' },
                  { label: 'Venmo Handle (optional)', type: 'text', val: venmo, set: setVenmo, placeholder: '@yourhandle', required: false },
                ].map(({ label, type, val, set, placeholder, required, autoComplete, note }) => (
                  <div key={label}>
                    <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--dark)' }}>{label}</label>
                    <input
                      type={type}
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      placeholder={placeholder}
                      required={required}
                      autoComplete={autoComplete}
                      className="w-full border px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
                      style={{ borderColor: 'var(--border)', color: 'var(--dark)' }}
                    />
                    {note && <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{note}</p>}
                  </div>
                ))}

                {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full font-display tracking-wider text-white py-3 disabled:opacity-50"
                  style={{ background: 'var(--red)' }}
                >
                  {loading ? 'SIGNING UP…' : 'SIGN UP & GET MY PIN'}
                </button>
              </form>

              <div className="mt-6 text-center space-y-2">
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Already have an account?{' '}
                  <Link href="/login" className="underline" style={{ color: 'var(--dark)' }}>Log in</Link>
                </p>
                <Link href="/" className="block text-xs tracking-widest uppercase" style={{ color: 'var(--muted)' }}>← Standings</Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
