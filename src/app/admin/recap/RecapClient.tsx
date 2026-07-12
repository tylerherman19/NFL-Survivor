'use client'

import { useState } from 'react'

interface Props {
  weekNumber: number
  recapText: string
}

export default function RecapClient({ weekNumber, recapText }: Props) {
  const [copied, setCopied] = useState(false)

  async function copyToClipboard() {
    await navigator.clipboard.writeText(recapText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Week {weekNumber} recap — copy and paste into GroupMe.
      </p>
      <div className="relative">
        <pre className="card p-4 text-sm whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-[600px]" style={{ color: 'var(--dark)' }}>
          {recapText || 'No data yet — enter results first.'}
        </pre>
        {recapText && (
          <button
            onClick={copyToClipboard}
            className="absolute top-3 right-3 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{ background: 'var(--dark)', color: '#fff' }}
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
}
