import type { Metadata } from 'next'
import { Anton } from 'next/font/google'
import './globals.css'
import TestModeBanner from './components/TestModeBanner'

const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton' })

export const metadata: Metadata = {
  title: 'NFL Survivor Pool',
  description: "Pick one team per week. One loss and you're out.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={anton.variable}>
      <body className="min-h-full antialiased">
        <TestModeBanner />
        {children}
      </body>
    </html>
  )
}
