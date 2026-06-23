'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function ResetForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 digits')
      return
    }
    if (pin !== confirmPin) {
      setError('PINs do not match')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/reset-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Reset failed')
        return
      }

      setSuccess(true)
      setTimeout(() => router.push('/login'), 2500)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-red-400">Invalid reset link. Please request a new one.</p>
        <Link href="/forgot-pin" className="mt-4 block text-green-400 underline">
          Request new link
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div className="text-center">
        <p className="text-3xl mb-3">✅</p>
        <p className="text-white font-semibold">PIN updated!</p>
        <p className="text-slate-400 text-sm mt-2">Redirecting to login…</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">New PIN</label>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="6 digits"
          maxLength={6}
          pattern="\d{6}"
          required
          className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-white placeholder-slate-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Confirm New PIN
        </label>
        <input
          type="password"
          inputMode="numeric"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          placeholder="6 digits again"
          maxLength={6}
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
        {loading ? 'Saving…' : 'Set New PIN'}
      </button>
    </form>
  )
}

export default function ResetPinPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Set a New PIN</h1>
          <p className="text-slate-400 mt-1 text-sm">Choose a 6-digit number you&apos;ll remember.</p>
        </div>
        <Suspense fallback={<p className="text-slate-400 text-center">Loading…</p>}>
          <ResetForm />
        </Suspense>
        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm text-slate-400 hover:text-slate-200 underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
