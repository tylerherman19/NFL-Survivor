'use client'

import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }
  return (
    <button onClick={handleLogout} className="text-xs tracking-widest uppercase transition-colors" style={{ color: '#888' }}>
      Log Out
    </button>
  )
}
