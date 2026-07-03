'use client'

import { useState } from 'react'

type Audience = 'all' | 'alive' | 'unpicked'

interface Props {
  counts: { all: number; alive: number; unpicked: number | null }
  weekNumber: number | null
}

export default function BroadcastForm({ counts, weekNumber }: Props) {
  const [audience, setAudience] = useState<Audience>('alive')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')

  const audienceCount =
    audience === 'all' ? counts.all : audience === 'alive' ? counts.alive : counts.unpicked ?? 0

  async function handleSend() {
    if (!subject.trim() || !message.trim()) {
      setStatus('Error: subject and message are both required.')
      return
    }
    if (!confirm(`Send this email to ${audienceCount} player${audienceCount === 1 ? '' : 's'}? This cannot be undone.`)) return

    setSending(true)
    setStatus('Sending… this can take a minute for large audiences.')
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim(), audience }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus(`✅ Sent to ${data.sent}/${data.total} players${data.failures ? ` — failed: ${data.failures.join(', ')}` : ''}`)
        setSubject('')
        setMessage('')
      } else {
        setStatus(`Error: ${data.error}`)
      }
    } catch {
      setStatus('Server error. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-5 space-y-4">
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 mb-1.5">
          Audience
        </label>
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value as Audience)}
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          <option value="alive">Alive players ({counts.alive})</option>
          <option value="all">All players ({counts.all})</option>
          <option value="unpicked" disabled={counts.unpicked === null}>
            {counts.unpicked === null
              ? 'No pick yet — needs an active week'
              : `No Week ${weekNumber} pick yet (${counts.unpicked})`}
          </option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 mb-1.5">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={150}
          placeholder="e.g. Week 5 picks due Sunday at noon!"
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 mb-1.5">
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={8}
          maxLength={5000}
          placeholder={'Reminder: get your picks in before Sunday 12 PM CT.\n\nStandings: https://…'}
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
        <p className="mt-1 text-xs text-slate-500">
          Each email opens with &ldquo;Hey &lt;first name&gt;,&rdquo; automatically.
        </p>
      </div>

      <button
        onClick={handleSend}
        disabled={sending || audienceCount === 0 || !subject.trim() || !message.trim()}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
      >
        {sending ? 'Sending…' : `Send to ${audienceCount} player${audienceCount === 1 ? '' : 's'} →`}
      </button>

      {status && (
        <p className={`text-sm ${status.startsWith('✅') ? 'text-green-400' : status.startsWith('Sending') ? 'text-slate-400' : 'text-red-400'}`}>
          {status}
        </p>
      )}
    </div>
  )
}
