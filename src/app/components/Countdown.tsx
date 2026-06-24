'use client'

import { useEffect, useState } from 'react'

export default function Countdown({ deadline }: { deadline: string }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    function update() {
      const diff = new Date(deadline).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('Deadline passed'); return }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      if (days > 0) setTimeLeft(`${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''} remaining`)
      else if (hours > 0) setTimeLeft(`${hours} hr ${minutes} min remaining`)
      else setTimeLeft(`${minutes}m ${seconds}s remaining`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [deadline])

  return <p className="italic text-sm" style={{ color: 'var(--muted)' }}>{timeLeft}</p>
}
