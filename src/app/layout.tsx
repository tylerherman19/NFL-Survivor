import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NFL Survivor Pool',
  description: "Pick one team per week. One loss and you're out.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-900 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  )
}
