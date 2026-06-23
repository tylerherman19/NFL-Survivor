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
      className="text-sm text-slate-400 hover:text-white transition-colors"
    >
      Log out
    </button>
  )
}
