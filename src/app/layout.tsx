import type { Metadata, Viewport } from 'next'
import { Anton } from 'next/font/google'
import './globals.css'

const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton' })

export const metadata: Metadata = {
  title: 'NFL Survivor Pool',
  description: "Pick one team per week. One loss and you're out.",
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={anton.variable}>
      <body className="min-h-full antialiased">
        {children}
      </body>
    </html>
  )
}
