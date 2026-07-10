'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim(), pin }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }
      router.push('/pick')
      router.refresh()
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>
      {/* Header */}
      <header style={{ background: 'var(--dark)' }}>
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-white text-lg tracking-wider">NFL SURVIVOR POOL</Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="card p-6 sm:p-8">
            <h1 className="font-display text-5xl mb-1" style={{ color: 'var(--dark)' }}>LOG IN</h1>
            <p className="text-sm mb-7" style={{ color: 'var(--muted)' }}>Enter your name and 6-digit PIN to submit your pick.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="eyebrow block mb-2" style={{ color: 'var(--dark)' }}>Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Smith"
                  required
                  autoComplete="name"
                  className="field w-full px-3.5 py-2.5 text-sm"
                  style={{ color: 'var(--dark)' }}
                />
              </div>
              <div>
                <label className="eyebrow block mb-2" style={{ color: 'var(--dark)' }}>PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="6-digit PIN from your welcome email"
                  required
                  maxLength={6}
                  className="field w-full px-3.5 py-2.5 text-sm tnum tracking-widest"
                  style={{ color: 'var(--dark)' }}
                />
              </div>

              {error && (
                <p className="text-sm rounded-md px-3 py-2" style={{ color: 'var(--red)', background: 'var(--red-tint)' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full font-display tracking-wider py-3"
              >
                {loading ? 'LOGGING IN…' : 'LOG IN'}
              </button>
            </form>
          </div>

          <div className="mt-6 space-y-2.5 text-center">
            <Link href="/forgot-pin" className="block eyebrow underline" style={{ color: 'var(--muted)' }}>
              Forgot your PIN?
            </Link>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              New to the pool?{' '}
              <Link href="/signup" className="underline" style={{ color: 'var(--dark)' }}>Sign up here</Link>
            </p>
            <Link href="/" className="block eyebrow" style={{ color: 'var(--muted)' }}>← Standings</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
