'use client'

import { useState } from 'react'
import Link from 'next/link'
import LogoMark from './LogoMark'

const BASE_NAV_LINKS = [
  { label: 'Standings', href: '/#standings' },
  { label: 'Rules', href: '/#rules' },
  { label: 'Pick Grid', href: '/grid' },
  { label: 'Schedule', href: '/schedule' },
  { label: 'Sweat Board', href: '/live' },
  { label: 'Log In', href: '/login' },
]

function RedButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-display text-sm tracking-wider px-4 py-2 text-white"
      style={{ background: 'var(--red)' }}
    >
      {children}
    </Link>
  )
}

export default function SiteHeader({ seasonStarted = false }: { seasonStarted?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)
  // Sign Up only makes sense before the season's first game — signups close
  // for good once it kicks off (enforced server-side too, this just matches).
  const showSignUp = !seasonStarted

  return (
    <header style={{ background: 'var(--dark)' }}>
      <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
        <LogoMark size={44} />

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-6">
          {BASE_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ))}
          {showSignUp && <RedButton href="/signup">SIGN UP</RedButton>}
          <RedButton href="/pick">SUBMIT PICK</RedButton>
        </nav>

        {/* Mobile: SUBMIT PICK button + hamburger */}
        <div className="sm:hidden flex items-center gap-3">
          <RedButton href="/pick">SUBMIT PICK</RedButton>
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
            {BASE_NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="py-3 text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {showSignUp && (
              <Link
                href="/signup"
                className="py-3 text-xs tracking-widest uppercase font-bold transition-colors"
                style={{ color: 'var(--red)' }}
                onClick={() => setMenuOpen(false)}
              >
                Sign Up
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}
