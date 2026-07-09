'use client'

import { useState } from 'react'
import Link from 'next/link'

const NAV_LINKS = [
  { label: 'Standings', href: '/#standings' },
  { label: 'Rules', href: '/#rules' },
  { label: 'Pick Grid', href: '/grid' },
  { label: 'Schedule', href: '/schedule' },
  { label: 'Sweat Board', href: '/live' },
  { label: 'Log In', href: '/login' },
]

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header style={{ background: 'var(--dark)' }}>
      <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
        <span className="font-display text-white text-lg tracking-wider">NFL SURVIVOR POOL</span>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/pick"
            className="font-display text-sm tracking-wider px-4 py-2 text-white"
            style={{ background: 'var(--red)' }}
          >
            SUBMIT PICK →
          </Link>
        </nav>

        {/* Mobile: SUBMIT PICK button + hamburger */}
        <div className="sm:hidden flex items-center gap-4">
          <Link
            href="/pick"
            className="font-display text-sm tracking-wider px-4 py-2 text-white"
            style={{ background: 'var(--red)' }}
          >
            SUBMIT PICK →
          </Link>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="flex flex-col gap-1 p-2"
          >
            <span className="w-6 h-0.5 bg-gray-400"></span>
            <span className="w-6 h-0.5 bg-gray-400"></span>
            <span className="w-6 h-0.5 bg-gray-400"></span>
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <nav className="sm:hidden" style={{ background: 'var(--dark)' }}>
          <div className="mx-auto max-w-5xl px-4 py-2 flex flex-col">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="py-3 text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  )
}
