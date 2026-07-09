'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      router.push('/admin')
      router.refresh()
    } catch {
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--dark)' }}>
      <div className="w-full max-w-sm">
        <h1 className="font-display text-5xl text-white mb-1">ADMIN</h1>
        <p className="text-xs tracking-widest uppercase mb-8" style={{ color: '#666' }}>NFL Survivor Pool</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold tracking-widest uppercase mb-2 text-white">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm focus:outline-none"
              style={{ background: '#2a2a2a', color: 'white', border: '1px solid #333' }}
            />
          </div>
          {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full font-display tracking-wider text-white py-3 disabled:opacity-50"
            style={{ background: 'var(--red)' }}
          >
            {loading ? 'LOGGING IN…' : 'LOG IN →'}
          </button>
        </form>
        <Link
          href="/#standings"
          className="mt-6 inline-block text-xs tracking-widest uppercase transition-colors"
          style={{ color: '#666' }}
        >
          ← Standings
        </Link>
      </div>
    </div>
  )
}
