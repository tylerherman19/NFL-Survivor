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
      <div className="w-full max-w-sm rounded-xl p-8" style={{ background: 'var(--dark-2)', boxShadow: 'var(--shadow-md)' }}>
        <h1 className="font-display text-5xl text-white mb-1">ADMIN</h1>
        <p className="eyebrow mb-7" style={{ color: '#777' }}>NFL Survivor Pool</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="eyebrow block mb-2 text-white">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              className="w-full px-3.5 py-2.5 text-sm rounded-md focus:outline-none"
              style={{ background: '#1a1a1a', color: 'white', border: '1px solid #3a3a3a' }}
            />
          </div>
          {error && <p className="text-sm rounded-md px-3 py-2" style={{ color: '#ff8a7a', background: 'rgba(192,57,43,0.18)' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full font-display tracking-wider py-3"
          >
            {loading ? 'LOGGING IN…' : 'LOG IN →'}
          </button>
        </form>
        <Link
          href="/#standings"
          className="mt-6 inline-block eyebrow transition-colors hover:text-white"
          style={{ color: '#777' }}
        >
          ← Standings
        </Link>
      </div>
    </div>
  )
}
