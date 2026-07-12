'use client'

import { useRouter } from 'next/navigation'

export default function AdminLogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/admin', { method: 'DELETE' })
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs tracking-widest uppercase transition-colors hover:text-white"
      style={{ color: '#888' }}
    >
      Log out
    </button>
  )
}
