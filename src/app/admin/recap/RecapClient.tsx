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
      <p className="text-slate-400 text-sm">
        Week {weekNumber} recap — copy and paste into GroupMe.
      </p>
      <div className="relative">
        <pre className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-[600px]">
          {recapText || 'No data yet — enter results first.'}
        </pre>
        {recapText && (
          <button
            onClick={copyToClipboard}
            className="absolute top-3 right-3 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
}
