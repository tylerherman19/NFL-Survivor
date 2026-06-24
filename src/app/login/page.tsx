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

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      router.push('/pick')
      router.refresh()
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
          <p className="text-4xl mb-3">🏈</p>
          <h1 className="text-2xl font-bold text-white">NFL Survivor Pool</h1>
          <p className="text-slate-400 mt-1 text-sm">Log in to submit your weekly pick</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Full Name
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
            <label className="block text-sm font-medium text-slate-300 mb-1.5">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="6-digit PIN from your welcome email"
              required
              maxLength={6}
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
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-3">
          <Link
            href="/forgot-pin"
            className="block text-sm text-slate-400 hover:text-slate-200 underline"
          >
            Forgot your PIN?
          </Link>
          <p className="text-sm text-slate-400">
            New to the pool?{' '}
            <Link href="/signup" className="text-green-400 hover:text-green-300 underline">
              Sign up here
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-300">
            ← Back to standings
          </Link>
        </div>
      </div>
    </div>
  )
}
