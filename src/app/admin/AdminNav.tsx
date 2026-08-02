'use client'

import { useState } from 'react'
import Link from 'next/link'
import AdminLogoutButton from './AdminLogoutButton'

const LINKS: [string, string][] = [
  ['/admin', 'Dashboard'],
  ['/admin/schedule', 'Schedule'],
  ['/admin/results', 'Results'],
  ['/admin/players', 'Players'],
  ['/admin/recap', 'Recap'],
  ['/admin/history', 'History'],
  ['/admin/email', 'Email'],
]

export default function AdminNav({ testMode }: { testMode: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav style={{ background: 'var(--dark)' }}>
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
        <span className="font-display text-white tracking-wider text-sm">ADMIN</span>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-5">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="text-xs tracking-widest uppercase hover:text-white transition-colors" style={{ color: '#888' }}>
              {label}
            </Link>
          ))}
          <Link href="/admin/testing" className="text-xs tracking-widest uppercase transition-colors" style={{ color: testMode ? '#fbbf24' : '#888' }}>
            Testing{testMode ? ' ●' : ''}
          </Link>
        </div>
        <div className="hidden sm:block ml-auto">
          <AdminLogoutButton />
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="sm:hidden flex flex-col gap-1 p-2 ml-auto"
        >
          <span className="w-6 h-0.5 bg-gray-400"></span>
          <span className="w-6 h-0.5 bg-gray-400"></span>
          <span className="w-6 h-0.5 bg-gray-400"></span>
        </button>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="sm:hidden" style={{ background: 'var(--dark)' }}>
          <div className="mx-auto max-w-6xl px-4 py-2 flex flex-col">
            {LINKS.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="py-3 text-xs tracking-widest uppercase hover:text-white transition-colors"
                style={{ color: '#888' }}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/admin/testing"
              className="py-3 text-xs tracking-widest uppercase transition-colors"
              style={{ color: testMode ? '#fbbf24' : '#888' }}
              onClick={() => setMenuOpen(false)}
            >
              Testing{testMode ? ' ●' : ''}
            </Link>
            <div className="py-3">
              <AdminLogoutButton />
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
