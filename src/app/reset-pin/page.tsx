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
    if (!/^\d{6}$/.test(pin)) { setError('PIN must be exactly 6 digits'); return }
    if (pin !== confirmPin) { setError('PINs do not match'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/reset-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Reset failed'); return }
      setSuccess(true)
      setTimeout(() => router.push('/login'), 2500)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) return (
    <div className="text-center">
      <p className="text-sm" style={{ color: 'var(--red)' }}>Invalid reset link. Please request a new one.</p>
      <Link href="/forgot-pin" className="mt-4 block text-xs tracking-widest uppercase underline" style={{ color: 'var(--muted)' }}>Request new link</Link>
    </div>
  )

  if (success) return (
    <div className="text-center">
      <p className="font-display text-5xl" style={{ color: 'var(--green)' }}>PIN SET!</p>
      <p className="text-sm mt-3" style={{ color: 'var(--muted)' }}>Redirecting to login…</p>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {[
        { label: 'New PIN', val: pin, set: setPin },
        { label: 'Confirm New PIN', val: confirmPin, set: setConfirmPin },
      ].map(({ label, val, set }) => (
        <div key={label}>
          <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--dark)' }}>{label}</label>
          <input
            type="password"
            inputMode="numeric"
            value={val}
            onChange={(e) => set(e.target.value)}
            placeholder="6 digits"
            maxLength={6}
            required
            className="w-full border px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
            style={{ borderColor: 'var(--border)', color: 'var(--dark)' }}
          />
        </div>
      ))}
      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full font-display tracking-wider text-white py-3 disabled:opacity-50"
        style={{ background: 'var(--red)' }}
      >
        {loading ? 'SAVING…' : 'SET NEW PIN'}
      </button>
    </form>
  )
}

export default function ResetPinPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--cream)' }}>
      <header style={{ background: 'var(--dark)' }}>
        <div className="mx-auto max-w-5xl px-4 py-4">
          <Link href="/" className="font-display text-white text-lg tracking-wider">NFL SURVIVOR POOL</Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-5xl mb-1" style={{ color: 'var(--dark)' }}>SET NEW PIN</h1>
          <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>Choose a 6-digit number you&apos;ll remember.</p>
          <Suspense fallback={<p className="text-sm" style={{ color: 'var(--muted)' }}>Loading…</p>}>
            <ResetForm />
          </Suspense>
          <div className="mt-6 text-center">
            <Link href="/login" className="text-xs tracking-widest uppercase underline" style={{ color: 'var(--muted)' }}>Back to Login</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
