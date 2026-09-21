import Link from 'next/link'
import Image from 'next/image'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; done?: string | string[] }>
}) {
  const query = await searchParams
  const token = typeof query.token === 'string' ? query.token : ''
  const done = query.done === '1'
  const valid = token ? Boolean(await verifyUnsubscribeToken(token)) : false

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="card mx-auto max-w-lg p-8 text-center space-y-5">
        <Image src="/logo.png" width={72} height={72} alt="Pick and Pray" className="mx-auto rounded-full" />
        <h1 className="font-display text-4xl" style={{ color: 'var(--dark)' }}>
          {done ? 'EMAILS TURNED OFF' : 'EMAIL PREFERENCES'}
        </h1>

        {done ? (
          <p style={{ color: 'var(--muted)' }}>
            You will no longer receive pool broadcasts, pick confirmations, reminders, or elimination emails.
            You can still request a PIN email if you need to log in.
          </p>
        ) : valid ? (
          <>
            <p style={{ color: 'var(--muted)' }}>
              Stop pool broadcasts, pick confirmations, reminders, and elimination emails?
              You can still request a PIN email if you need to log in.
            </p>
            <form action="/api/unsubscribe" method="post">
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="btn-primary px-6 py-3 font-semibold">
                Unsubscribe me
              </button>
            </form>
          </>
        ) : (
          <p style={{ color: 'var(--red)' }}>
            This unsubscribe link is invalid. Contact the pool administrator to change your email preference.
          </p>
        )}

        <Link href="/" className="inline-block text-sm underline" style={{ color: 'var(--muted)' }}>
          Return to Pick and Pray
        </Link>
      </div>
    </main>
  )
}
