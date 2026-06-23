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
      const res = await fetch('/api/forgot-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })

      if (res.ok) {
        setSent(true)
      } else {
        // Don't reveal whether email exists — always show "sent" message
        setSent(true)
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Forgot Your PIN?</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Enter the email you signed up with and we&apos;ll send a reset link.
          </p>
        </div>

        {sent ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6 text-center">
            <p className="text-3xl mb-3">📧</p>
            <p className="text-white font-semibold">Check your email</p>
            <p className="text-slate-400 text-sm mt-2">
              If that email is in our system, a PIN reset link is on its way. It expires in 1 hour.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
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
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm text-slate-400 hover:text-slate-200 underline">
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
