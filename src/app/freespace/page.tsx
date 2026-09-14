import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Freespace',
  description: 'An unauthorized portfolio review.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-static'

type Entry = {
  kicker: string
  title: string
  odds: string
  legs: string[]
  placed: string
  toWin: string
  commentary: string
}

const ENTRIES: Entry[] = [
  {
    kicker: 'Parlay 1 · Same Game Parlay+',
    title: '7-leg Same Game Parlay+',
    odds: '+25009',
    legs: [
      'Ladd McConkey 1000+ regular season receiving yards (NFL Futures 2026-27)',
      'Los Angeles Chargers to win 10+ regular season games (NFL Futures 2026-27)',
      'Carolina Panthers Under 7.5 wins (NFL Futures 2026-27)',
      'Brock Bowers 1000+ regular season receiving yards (NFL Futures 2026-27)',
      'Texas Tech to win Big 12 Championship Game 2026',
      'Texas to win NCAAF FBS Championship 2026-27',
      'Gable Steveson moneyline (-1800) vs Sean Sharaf, Sat 7:40PM CT',
    ],
    placed: '$3.60',
    toWin: '$903.93',
    commentary:
      "The flagship. $3.60 at +25009 — he's risking less than a latte to win just over nine hundred bucks, and the ticket still needs the Chargers to win 10 games, which is doing a shocking amount of heavy lifting for a franchise whose idea of January football is watching it. The Carolina under is the only leg I'd defend, and that's only because it's the Panthers.",
  },
  {
    kicker: 'Parlay 2 · Same Game Parlay+',
    title: '7-leg Same Game Parlay+',
    odds: '+18117',
    legs: [
      'Ladd McConkey 1000+ regular season receiving yards (NFL Futures 2026-27)',
      'Los Angeles Chargers to win 10+ regular season games (NFL Futures 2026-27)',
      'Carolina Panthers Under 7.5 wins (NFL Futures 2026-27)',
      'Brock Bowers 1000+ regular season receiving yards (NFL Futures 2026-27)',
      'Texas Tech to win Big 12 Championship Game 2026',
      'Ohio State to win NCAAF FBS Championship 2026-27',
      'Gable Steveson moneyline (-1800) vs Sean Sharaf, Sat 7:40PM CT',
    ],
    placed: 'not visible',
    toWin: 'not visible',
    commentary:
      'Same four NFL legs, same Texas Tech, but he swapped Texas for Ohio State in the title game — a hedge in the sense that buying two lottery tickets with different numbers is a hedge. Somewhere a sportsbook risk manager saw this account and laughed.',
  },
  {
    kicker: 'Parlay 3 · Same Game Parlay+',
    title: '7-leg Same Game Parlay+',
    odds: '+4612',
    legs: [
      'Ladd McConkey 1000+ regular season receiving yards (NFL Futures 2026-27)',
      'Los Angeles Chargers to win 10+ regular season games (NFL Futures 2026-27)',
      'Carolina Panthers Under 7.5 wins (NFL Futures 2026-27)',
      'Brock Bowers 1000+ regular season receiving yards (NFL Futures 2026-27)',
      'Michigan +6.5 spread (-110) vs Oklahoma — won 17-10 ✓',
      'Gable Steveson moneyline (-1800) vs Sean Sharaf, Sat 7:40PM CT',
      'LeBron James Under 17.5 points (-130), 76ers @ Knicks, Oct 20',
    ],
    placed: '~$5.00',
    toWin: '~$235.6x',
    commentary:
      "The Michigan leg already won, which means this ticket gets to die slowly over the next five months instead of all at once. He's asking LeBron James — in the year 2026, at age 41 — to stay under 17.5 points, which is less a bet and more a prayer that Father Time finally answers the phone. The Chargers winning 10 games remains the load-bearing wall of this entire operation.",
  },
  {
    kicker: 'Parlay 4 · Same Game Parlay+',
    title: '6-leg Same Game Parlay+',
    odds: '+8472',
    legs: [
      'Ladd McConkey 1000+ regular season receiving yards (NFL Futures 2026-27)',
      'Brock Bowers 1000+ regular season receiving yards (NFL Futures 2026-27)',
      "Wan'Dale Robinson 1000+ regular season receiving yards (NFL Futures 2026-27)",
      'San Francisco 49ers to win 10+ regular season games (NFL Futures 2026-27)',
      'Gable Steveson moneyline (-1800) vs Sean Sharaf, Sat 7:40PM CT',
      'Michigan to record 8+ regular season wins 2026 (-165)',
    ],
    placed: '$11.81',
    toWin: '$1,012.36',
    commentary:
      "The biggest wager of the bunch — a full $11.81, high-roller territory — and the anchor leg is Wan'Dale Robinson going over 1,000 yards on the Titans. Wan'Dale Robinson. A thousand yards. This is the betting equivalent of building your house on a foundation of wet sand and then being surprised. Gable Steveson at -1800 is once again the designated driver of this ticket, the one responsible adult in a car full of bad decisions.",
  },
  {
    kicker: 'Parlay 5 · Straight parlay',
    title: '2-leg parlay',
    odds: '+30500',
    legs: [
      'Justin Gaethje to win in Round 4 (+3300), vs Ilia Topuria, Jun 14 — won ✓',
      'Oregon to win NCAAF FBS Championship 2026-27 (+800)',
    ],
    placed: '$2.00',
    toWin: '$612.00',
    commentary:
      "Half of this ticket has already hit — Gaethje actually did it, in Round 4, at +3300, a genuinely absurd call — and it doesn't matter at all, because the other half needs Oregon to win the national championship. This is like sinking a hole-in-one and then finding out the tournament was match play. Two dollars at +30500 is not a bet, it's a donation with extra steps.",
  },
  {
    kicker: 'PrizePicks · 5-Pick Power Play',
    title: '5-Pick Power Play',
    odds: '',
    legs: [
      'Kylian Mbappé under 0.5 goals — 0 ✓',
      'Mike Maignan over 29.5 passes attempted — 38 ✓',
      'Isabelle Harrison under 21.5 PRA — 14 ✓',
      'Michaela Onyenwere over 16.5 fantasy score — 24.5 ✓',
      'Sam LaPorta over 47.5 rec yards — 48, was in progress',
    ],
    placed: '$2.10',
    toWin: '$42',
    commentary:
      "Four of five already green, which in this account's economy qualifies as a dynasty. The entire ticket hinges on Sam LaPorta, a man who has personally ended more parlays than the injury report.",
  },
  {
    kicker: 'PrizePicks · 5-Pick Power Play',
    title: '5-Pick Power Play',
    odds: '',
    legs: [
      'Kylian Mbappé under 0.5 goals — 0 ✓',
      'Mike Maignan over 29.5 passes attempted — 38 ✓',
      'Isabelle Harrison under 21.5 PRA — 14 ✓',
      'Michaela Onyenwere over 16.5 fantasy score — 24.5 ✓',
      'Sam LaPorta over 47.5 rec yards — 48 ✓',
    ],
    placed: '$5',
    toWin: '$138',
    commentary:
      'He ran it back with the exact same five picks at more than double the stake, and this time LaPorta cooperated. Somewhere the phrase "if it ain\'t broke" is doing a lot of work, because everything else in this portfolio is very, very broke.',
  },
  {
    kicker: 'PrizePicks · 6-Pick Power Play',
    title: '6-Pick Power Play',
    odds: '',
    legs: [
      'Elly De La Cruz over 23.5 home runs — 26 ✓',
      'Jake Burger over 71.5 RBIs — 83 ✓',
      'Gavin Williams over 3.93 ERA — 3.78 (losing)',
      'Salvador Perez over 136.5 hits — 121 (losing)',
      'Justin Jefferson over 7.5 rec TDs — 2 (losing)',
      '(6th leg cut off in screenshot)',
    ],
    placed: '$9',
    toWin: '$337.50',
    commentary:
      "Betting the over on a pitcher's ERA is a special kind of self-harm — you're rooting for the man to get shelled, and he's rewarding your faith by pitching well. Gavin Williams at 3.78 is pitching like he personally read this ticket and took offense. Salvador Perez needs 136.5 hits and has 121 with the season nearly over, which is the baseball equivalent of needing a miracle. This ticket is a crime scene.",
  },
  {
    kicker: 'PrizePicks · 4-Pick Power Play',
    title: '4-Pick Power Play',
    odds: '',
    legs: [
      'Paolo Banchero over 1.5 3PTM — 4 ✓',
      'Donovan Mitchell over 0.5 points — 22 ✓',
      'Justin Jefferson over 1149.5 rec yards — 92, in progress',
      'Fernando Mendoza under 6.5 games started — 0, in progress',
    ],
    placed: '$14',
    toWin: '$140',
    commentary:
      "Two legs already cashed and the remaining two are a Vikings receiver needing 1,150 yards and a bet that Fernando Mendoza won't start 6.5 games — a line so low it's essentially a wager on whether the Raiders remember he exists. The Mendoza under is the only bet in this entire collection I'd co-sign, and that's only because I don't know who Fernando Mendoza is either.",
  },
  {
    kicker: 'PrizePicks · 4-Pick Power Play',
    title: '4-Pick Power Play',
    odds: '',
    legs: [
      'Chris Richards over 47.5 passes attempted — 76 ✓',
      'Folarin Balogun over 0.5 passes attempted — 10 ✓',
      'Sam LaPorta over 47.5 rec yards — 48 ✓',
      'Fernando Mendoza under 9.5 games started — 0, in progress',
    ],
    placed: '$9',
    toWin: '$90',
    commentary:
      'Betting Folarin Balogun to attempt half a pass is the lowest bar ever cleared in gambling history — he needed to kick the ball once and he kicked it ten times. This is the "participation trophy" of the portfolio. Everything else is fine because the bar was on the floor.',
  },
  {
    kicker: 'PrizePicks · 6-Pick Power Play',
    title: '6-Pick Power Play',
    odds: '',
    legs: [
      'Mike Evans over 6.5 rec TDs — 1, in progress',
      "Wan'Dale Robinson over 67.5 receptions — 5, in progress",
      'Baker Mayfield over 3499.5 pass yards — 216, in progress',
      'Derrick Henry over 4.5 100+ rush yard games — 1, in progress',
      'Ladd McConkey over 924.5 rec yards — 82, in progress',
      '(6th leg cut off in screenshot)',
    ],
    placed: '$9.60',
    toWin: '$360',
    commentary:
      "A six-leg season-long sweat where every single visible leg is currently losing, some of them dramatically — Wan'Dale Robinson has 5 receptions against a 67.5 line, which means he needs roughly twelve more seasons. This isn't a parlay, it's a hostage situation that resolves in January 2027. And even in the miracle scenario where it hits, inflation will have spent the last four months eating the $360 alive.",
  },
  {
    kicker: 'Kalshi · Politics',
    title: '“Who will be charged with a federal crime this year?” — No on Anthony Fauci, 1.76x',
    odds: '',
    legs: ['Cost: $22.84', 'Max payout: $40.29', 'Cash out now: $27.61 (+$4.77, +20.89%)'],
    placed: '$22.84',
    toWin: '$40.29',
    commentary:
      "The crown jewel. The single green number in the entire account. He bet $22.84 that the government won't charge an 85-year-old immunologist and he's up 20% — this is the Warren Buffett trade of the portfolio, and it only exists because someone needed one respectable line item for the audit. Cash it out, frame the $4.77, retire.",
  },
]

export default function FreespacePage() {
  return (
    <main
      style={{
        background: 'var(--cream)',
        color: 'var(--ink)',
        minHeight: '100vh',
      }}
    >
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '56px 20px 96px' }}>
        <p className="eyebrow" style={{ color: 'var(--red)' }}>
          Freespace · An unauthorized portfolio review
        </p>
        <h1
          className="font-display"
          style={{ fontSize: 'clamp(2.1rem, 6vw, 3.6rem)', lineHeight: 1.04, margin: '14px 0 12px' }}
        >
          Local Man Builds Entire Financial Future on Ladd McConkey&rsquo;s Hamstrings
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 17,
            lineHeight: 1.55,
            color: 'var(--ink-2)',
            margin: '0 0 8px',
          }}
        >
          A friend placed these bets. None of the long shots will hit. They are stupid bets. This is
          the record.
        </p>

        {ENTRIES.map((e) => (
          <article key={e.kicker + e.title} className="card" style={{ padding: 24, marginTop: 20 }}>
            <p className="eyebrow" style={{ color: 'var(--muted)' }}>
              {e.kicker}
            </p>
            <h2
              className="font-display"
              style={{ fontSize: '1.45rem', lineHeight: 1.15, margin: '8px 0 14px' }}
            >
              {e.title}{' '}
              {e.odds && (
                <span className="tnum" style={{ color: 'var(--red)' }}>
                  {e.odds}
                </span>
              )}
            </h2>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.6 }}>
              {e.legs.map((leg) => (
                <li key={leg} style={{ marginBottom: 4 }}>
                  {leg}
                </li>
              ))}
            </ul>
            <p className="tnum" style={{ fontSize: 14, fontWeight: 700, margin: '14px 0 0' }}>
              Placed: {e.placed} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>·</span> To
              win: {e.toWin}
            </p>
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 16,
                lineHeight: 1.6,
                color: 'var(--ink-2)',
                borderTop: '1px solid var(--border)',
                marginTop: 14,
                paddingTop: 14,
                marginBottom: 0,
              }}
            >
              {e.commentary}
            </p>
          </article>
        ))}

        <p
          style={{
            marginTop: 40,
            fontSize: 13,
            color: 'var(--muted)',
            textAlign: 'center',
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
          }}
        >
          You didn&rsquo;t find this page. This page doesn&rsquo;t exist.
        </p>
      </div>
    </main>
  )
}
