import { ImageResponse } from 'next/og'

export const runtime = 'edge'

// Full "vintage badge" logo (design 1a) rendered as a real PNG — email clients
// don't reliably render SVG, so this is what src/lib/email.ts links to.
let fontDataPromise: Promise<ArrayBuffer> | null = null
function getAntonFont(): Promise<ArrayBuffer> {
  if (!fontDataPromise) {
    fontDataPromise = fetch(
      'https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf'
    ).then((res) => res.arrayBuffer())
  }
  return fontDataPromise
}

export async function GET() {
  const antonData = await getAntonFont()

  return new ImageResponse(
    (
      <div
        style={{
          width: 320,
          height: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f0ede8',
        }}
      >
        <div
          style={{
            width: 240,
            height: 240,
            borderRadius: '50%',
            border: '13px solid #1a1a1a',
            background: '#f0ede8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'Anton',
              fontSize: 46,
              lineHeight: 0.95,
              color: '#1a1a1a',
              textAlign: 'center',
              letterSpacing: 1,
            }}
          >
            PICK
          </div>
          <div
            style={{
              fontFamily: 'Anton',
              fontSize: 46,
              lineHeight: 0.95,
              color: '#1a1a1a',
              textAlign: 'center',
              letterSpacing: 1,
            }}
          >
            AND
          </div>
          <div
            style={{
              fontFamily: 'Anton',
              fontSize: 46,
              lineHeight: 0.95,
              color: '#1a1a1a',
              textAlign: 'center',
              letterSpacing: 1,
              marginBottom: 10,
            }}
          >
            PRAY
          </div>
          <div
            style={{
              width: 26,
              height: 16,
              borderRadius: '50%',
              background: '#1a1a1a',
              transform: 'rotate(45deg)',
              display: 'flex',
            }}
          />
        </div>
      </div>
    ),
    {
      width: 320,
      height: 320,
      fonts: [{ name: 'Anton', data: antonData, style: 'normal', weight: 400 }],
      headers: { 'Cache-Control': 'public, max-age=86400, immutable' },
    }
  )
}
