'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPinPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await fetch('/api/forgot-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      setSent(true)
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
          <h1 className="font-display text-5xl mb-1" style={{ color: 'var(--dark)' }}>FORGOT PIN?</h1>
          <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>Enter your email and we&apos;ll send a reset link.</p>

          {sent ? (
            <div className="border p-6 text-center" style={{ borderColor: 'var(--border)' }}>
              <p className="font-bold" style={{ color: 'var(--dark)' }}>Check your email</p>
              <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
                If that email is in our system, a PIN reset link is on its way. It expires in 1 hour.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--dark)' }}>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full border px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
                  style={{ borderColor: 'var(--border)', color: 'var(--dark)' }}
                />
              </div>
              {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full font-display tracking-wider text-white py-3 disabled:opacity-50"
                style={{ background: 'var(--red)' }}
              >
                {loading ? 'SENDING…' : 'SEND RESET LINK'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link href="/login" className="text-xs tracking-widest uppercase underline" style={{ color: 'var(--muted)' }}>← Back to Login</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
