'use client'

import { useEffect, useState } from 'react'

export default function Countdown({ deadline }: { deadline: string }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    function update() {
      const diff = new Date(deadline).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('Deadline passed')
        return
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`)
      } else {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [deadline])

  return (
    <p className="text-2xl font-bold font-mono text-amber-300 tracking-widest">{timeLeft}</p>
  )
}
