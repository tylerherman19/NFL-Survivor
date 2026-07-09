import Link from 'next/link'
import SweatBoard from './SweatBoard'

export const metadata = { title: 'Sweat Board — NFL Survivor Pool' }

export default function LivePage() {
  return (
    <div style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <header style={{ background: 'var(--dark)' }}>
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-display text-white text-lg tracking-wider">NFL SURVIVOR POOL</Link>
          <Link href="/" className="text-xs tracking-widest uppercase text-gray-400 hover:text-white transition-colors">← Standings</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16">
        <SweatBoard />
      </main>
    </div>
  )
}
