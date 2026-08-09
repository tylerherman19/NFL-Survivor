'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CONFIRM_PHRASE = 'RESET POOL'

export default function ResetPoolButton() {
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleReset() {
    if (typed !== CONFIRM_PHRASE) return
    if (!confirm('This permanently deletes every player, week, game, and pick in production. There is no undo. Proceed?')) return
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin/reset-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage('✅ Pool reset to zero.')
        setTyped('')
        router.refresh()
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch {
      setMessage('Server error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-red-600 bg-red-950/30 p-4 space-y-3">
      <p className="text-sm font-semibold text-red-300">⚠ Reset Pool to Zero</p>
      <p className="text-xs text-slate-400">
        Permanently deletes every player, week, game, and pick in production. Use this to clear a preseason trial
        before real signups start. Cannot be undone.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Type "${CONFIRM_PHRASE}" to enable`}
          className="w-64 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
        />
        <button
          onClick={handleReset}
          disabled={typed !== CONFIRM_PHRASE || loading}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40 transition-colors"
        >
          {loading ? 'Resetting…' : 'Reset Pool'}
        </button>
      </div>
      {message && (
        <p className={`text-xs ${message.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{message}</p>
      )}
    </div>
  )
}
