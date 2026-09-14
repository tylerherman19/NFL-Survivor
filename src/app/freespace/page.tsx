import type { Metadata } from 'next'
import Link from 'next/link'
import styles from './freespace.module.css'

export const metadata: Metadata = {
  title: 'Free Space Futures',
  description: "A running audit of one friend's boldest bets, worst ideas, and occasional miracles.",
  robots: { index: false, follow: false },
}

export const dynamic = 'force-static'

type Ticket = {
  book: 'FANDUEL' | 'PRIZEPICKS' | 'KALSHI'
  title: string
  odds?: string
  legs: string[]
  placed: string
  toWin: string
  note: string
  status: 'OPEN' | 'WON' | 'UP'
  tag?: string
  winner?: number
  warning?: number
}

const tickets: Ticket[] = [
  {
    book: 'FANDUEL', title: 'Parlay 1 - 7-leg Same Game Parlay+', odds: '+25009', placed: '$3.60', toWin: '$903.93', status: 'OPEN', tag: 'THE FLAGSHIP',
    legs: ['Ladd McConkey 1000+ receiving yards (NFL 2026-27)', 'Chargers to win 10+ regular season games (NFL 2026-27)', 'Panthers under 7.5 wins (NFL 2026-27)', 'Brock Bowers 1000+ receiving yards (NFL 2026-27)', 'Texas Tech to win Big 12 Championship (2026)', 'Texas to win NCAAF FBS Championship (2026-27)', 'Gable Steveson moneyline (-1800) vs Sean Sharaf'],
    note: "The flagship. He's risking less than a latte to win just over nine hundred bucks, and the ticket still needs the Chargers to win 10 games, which is doing a shocking amount of heavy lifting for a franchise whose idea of January football is watching it.",
  },
  {
    book: 'FANDUEL', title: 'Parlay 2 - 7-leg Same Game Parlay+', odds: '+18117', placed: 'Not visible', toWin: 'Not visible', status: 'OPEN',
    legs: ['Ladd McConkey 1000+ receiving yards (NFL 2026-27)', 'Chargers to win 10+ regular season games (NFL 2026-27)', 'Panthers under 7.5 wins (NFL 2026-27)', 'Brock Bowers 1000+ receiving yards (NFL 2026-27)', 'Texas Tech to win Big 12 Championship (2026)', 'Ohio State to win NCAAF FBS Championship (2026-27)', 'Gable Steveson moneyline (-1800) vs Sean Sharaf'],
    note: 'Same four NFL legs, same Texas Tech, but Texas became Ohio State in the title game - a hedge in the sense that buying two lottery tickets with different numbers is a hedge.',
  },
  {
    book: 'FANDUEL', title: 'Parlay 3 - 7-leg Same Game Parlay+', odds: '+4612', placed: '~$5.00', toWin: '~$235.6x', status: 'OPEN', winner: 4,
    legs: ['Ladd McConkey 1000+ receiving yards (NFL 2026-27)', 'Chargers to win 10+ regular season games (NFL 2026-27)', 'Panthers under 7.5 wins (NFL 2026-27)', 'Brock Bowers 1000+ receiving yards (NFL 2026-27)', 'Michigan +6.5 vs Oklahoma - won 17-10', 'Gable Steveson moneyline (-1800) vs Sean Sharaf', 'LeBron James under 17.5 points, 76ers @ Knicks'],
    note: "The Michigan leg already won, which means this ticket gets to die slowly over the next five months instead of all at once. The Chargers winning 10 games remains the load-bearing wall of this entire operation.",
  },
  {
    book: 'FANDUEL', title: 'Parlay 4 - 6-leg Same Game Parlay+', odds: '+8472', placed: '$11.81', toWin: '$1,012.36', status: 'OPEN', tag: 'HIGH-ROLLER TERRITORY', warning: 2,
    legs: ['Ladd McConkey 1000+ receiving yards (NFL 2026-27)', 'Brock Bowers 1000+ receiving yards (NFL 2026-27)', "Wan'Dale Robinson 1000+ receiving yards (NFL 2026-27)", '49ers to win 10+ regular season games', 'Gable Steveson moneyline (-1800) vs Sean Sharaf', 'Michigan to record 8+ regular season wins (2026)'],
    note: "The biggest wager of the bunch - a full $11.81, high-roller territory - and the anchor leg is Wan'Dale Robinson going over 1,000 yards. This is the betting equivalent of building your house on a foundation of wet sand.",
  },
  {
    book: 'FANDUEL', title: 'Parlay 5 - 2-leg parlay', odds: '+30500', placed: '$2.00', toWin: '$612.00', status: 'OPEN', winner: 0,
    legs: ['Justin Gaethje to win in Round 4 (+3300) vs Ilia Topuria - won', 'Oregon to win NCAAF FBS Championship (2026-27)'],
    note: "Half of this ticket has already hit - Gaethje actually did it, in Round 4, at +3300 - and it doesn't matter at all, because the other half needs Oregon to win the national championship. Two dollars at +30500 is not a bet; it's a donation with extra steps.",
  },
  {
    book: 'PRIZEPICKS', title: '5-Pick Power Play', placed: '$2.10', toWin: '$42.00', status: 'OPEN', winner: 3,
    legs: ['Kylian Mbappe under 0.5 goals - 0', 'Mike Maignan over 29.5 passes - 38', 'Isabelle Harrison under 21.5 PRA - 14', 'Michaela Onyenwere over 16.5 fantasy score - 24.5', 'Sam LaPorta over 47.5 receiving yards - 48, in progress'],
    note: "Four of five already green, which in this account's economy qualifies as a dynasty. The entire ticket hinges on Sam LaPorta, a man who has personally ended more parlays than the injury report.",
  },
  {
    book: 'PRIZEPICKS', title: '5-Pick Power Play', placed: '$5.00', toWin: '$138.00', status: 'WON', winner: 4,
    legs: ['Kylian Mbappe under 0.5 goals - 0', 'Mike Maignan over 29.5 passes - 38', 'Isabelle Harrison under 21.5 PRA - 14', 'Michaela Onyenwere over 16.5 fantasy score - 24.5', 'Sam LaPorta over 47.5 receiving yards - 48'],
    note: "He ran it back with the exact same five picks at more than double the stake, and this time LaPorta cooperated. Somewhere the phrase 'if it ain't broke' is doing a lot of work.",
  },
  {
    book: 'PRIZEPICKS', title: '6-Pick Power Play', placed: '$9.00', toWin: '$337.50', status: 'OPEN', winner: 0,
    legs: ['Elly De La Cruz over 23.5 home runs - 26', 'Jake Burger over 71.5 RBIs - 83', 'Gavin Williams over 3.93 ERA - 3.78', 'Salvador Perez over 136.5 hits - 121', 'Justin Jefferson over 7.5 receiving TDs - 2', 'Sixth leg cut off in source screenshot'],
    note: "Betting the over on a pitcher's ERA is a special kind of self-harm. Gavin Williams at 3.78 is pitching like he personally read this ticket and took offense. This ticket is a crime scene.",
  },
  {
    book: 'PRIZEPICKS', title: '4-Pick Power Play', placed: '$14.00', toWin: '$140.00', status: 'OPEN', winner: 1,
    legs: ['Paolo Banchero over 1.5 3PTM - 4', 'Donovan Mitchell over 0.5 points - 22', 'Justin Jefferson over 1149.5 receiving yards - in progress', 'Fernando Mendoza under 6.5 games started - in progress'],
    note: "Two legs already cashed. The Mendoza under is the only bet in this entire collection I'd co-sign, and that's only because I don't know who Fernando Mendoza is either.",
  },
  {
    book: 'PRIZEPICKS', title: '4-Pick Power Play', placed: '$9.00', toWin: '$90.00', status: 'OPEN', winner: 2,
    legs: ['Chris Richards over 47.5 passes - 76', 'Folarin Balogun over 0.5 passes - 10', 'Sam LaPorta over 47.5 receiving yards - 48', 'Fernando Mendoza under 9.5 games started - in progress'],
    note: "Betting Folarin Balogun to attempt half a pass is the lowest bar ever cleared in gambling history. This is the participation trophy of the portfolio.",
  },
  {
    book: 'PRIZEPICKS', title: '6-Pick Power Play', placed: '$9.60', toWin: '$360.00', status: 'OPEN',
    legs: ['Mike Evans over 6.5 receiving TDs', "Wan'Dale Robinson over 67.5 receptions", 'Baker Mayfield over 3499.5 passing yards', 'Derrick Henry over 4.5 100-yard rushing games', 'Ladd McConkey over 924.5 receiving yards', 'Sixth leg cut off in source screenshot'],
    note: "A six-leg season-long sweat where every visible leg is currently losing. This isn't a parlay; it's a hostage situation that resolves in January 2027.",
  },
  {
    book: 'KALSHI', title: 'Who will be charged with a federal crime this year?', placed: '$22.84', toWin: '$40.29', status: 'UP', tag: 'THE WARREN BUFFETT TRADE', winner: 0,
    legs: ['No on Anthony Fauci', 'Cost: $22.84', 'Cash out: $27.61 (+$4.77, +20.89%)'],
    note: "The crown jewel. He bet $22.84 that the government won't charge an 85-year-old immunologist and he's up 20% - the Warren Buffett trade of the portfolio. Cash it out, frame the $4.77, retire.",
  },
]

const allocation = [['NFL', 58], ['NCAAF', 23], ['NBA', 6], ['MLB', 6], ['UFC', 3], ['Soccer', 3], ['Political', 3]] as const

function TicketCard({ ticket, index }: { ticket: Ticket; index: number }) {
  return (
    <article className={`${styles.ticket} ${ticket.book === 'KALSHI' ? styles.kalshi : ''}`}>
      <div className={styles.ticketHead}>
        <span className={styles.number}>#{index + 1}</span>
        <strong className={styles.book}>{ticket.book}</strong>
        <div className={styles.ticketTitle}>
          <strong>{ticket.title}</strong>
          <span>Placed: <b>{ticket.placed}</b><i />To win: <b>{ticket.toWin}</b></span>
        </div>
        {ticket.tag && <span className={styles.tag}>{ticket.tag}</span>}
        {ticket.odds && <strong className={styles.odds}>{ticket.odds}</strong>}
        <span className={`${styles.status} ${ticket.status !== 'OPEN' ? styles.goodStatus : ''}`}>{ticket.status}</span>
      </div>
      <ul className={styles.legs}>
        {ticket.legs.map((leg, legIndex) => (
          <li key={leg} className={ticket.warning === legIndex ? styles.warning : ticket.winner === legIndex || ticket.status === 'WON' ? styles.winner : ''}>
            <span className={styles.check}>{ticket.winner === legIndex || ticket.status === 'WON' ? 'OK' : ticket.warning === legIndex ? '!' : ''}</span>{leg}
          </li>
        ))}
      </ul>
      <p className={styles.note}><b>Analyst Note:</b> {ticket.note}</p>
    </article>
  )
}

export default function FreespacePage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href="/" className={styles.brand}>Pick &amp; Pray</Link>
          <nav aria-label="Site navigation"><Link href="/">Survivor</Link><Link href="/pick">Picks</Link><Link href="/grid">Leaderboards</Link><Link href="/live">Analysis</Link><span className={styles.active}>FREESPACE</span></nav>
          <span className={styles.search}>Search bets, teams, or pain...</span>
        </div>
      </header>

      <div className={styles.wrap}>
        <section className={styles.hero}>
          <p className={styles.kicker}>FREESPACE // A PORTFOLIO OF QUESTIONABLE DECISIONS</p>
          <h1>Free Space Futures</h1>
          <p>A donation to the house</p>
        </section>

        <section className={styles.stats} aria-label="Portfolio summary">
          <div><span>Total staked</span><strong>$93.95</strong><small>About the cost of a nice dinner. For a worse outcome.</small></div>
          <div><span>Potential payout</span><strong>$3,436.42</strong><small>A life-changing number. In theory.</small></div>
          <div><span>Open tickets</span><strong>10</strong><small>Still alive, unfortunately.</small></div>
          <div><span>Winning tickets</span><strong>2</strong><small>A small miracle.</small></div>
          <div className={styles.redStat}><span>Portfolio grade</span><strong>F-</strong><small>Exceptional commitment to bad process.</small></div>
          <div className={`${styles.redStat} ${styles.indexStat}`}><span>Bad bet index</span><strong>94<em>/100</em></strong><div className={styles.meter}><i /></div><small>Higher numbers are worse. Impressive.</small></div>
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.feed}>
            <div className={styles.feedTabs}><b>All Bets (12)</b><span>Open (10)</span><span>Won (2)</span><span>Lost (0)</span><small>Sort by: <b>Most Recent</b></small></div>
            <div className={styles.ticketStack}>{tickets.map((ticket, index) => <TicketCard key={`${ticket.book}-${index}`} ticket={ticket} index={index} />)}</div>
          </section>

          <aside className={styles.sidebar}>
            <section><h2>Portfolio autopsy</h2><p className={styles.subhead}>Key findings from a comprehensive study in degeneracy.</p>
              <dl className={styles.autopsy}><div><dt>Most overexposed athlete</dt><dd>Wan&apos;Dale Robinson <small>3 bets</small></dd></div><div><dt>Load-bearing franchise</dt><dd>Los Angeles Chargers <small>3 bets</small></dd></div><div><dt>Largest single stake</dt><dd>$22.84 <small>Kalshi (Fauci)</small></dd></div><div><dt>Most repeated concept</dt><dd>Season-long overs <small>You love a long shot.</small></dd></div></dl>
            </section>
            <section><h2>Portfolio allocation (by sport)</h2><div className={styles.bars}>{allocation.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}%</b><i><em style={{ width: `${value}%` }} /></i></div>)}</div><p className={styles.scribble}>ALL ROADS<br />LEAD TO<br />FOOTBALL<br />FUTURES.</p></section>
            <section><h2>Worst ideas, ranked</h2><p className={styles.subhead}>A masterclass in poor market efficiency.</p><ol className={styles.ranking}><li><b>Wan&apos;Dale Robinson 1000+ receiving yards</b><span>TITANS, REALLY?</span></li><li><b>Chargers to win 10+ games</b><span>JANUARY WHO?</span></li><li><b>Oregon to win national championship</b><span>TWO DOLLARS TO DREAM</span></li><li><b>Texas Tech/Texas/Ohio State title hedges</b><span>HEDGE FUND (BUT DUMB)</span></li><li><b>LeBron under 17.5 points (age 41)</b><span>PRAY HARDER</span></li></ol></section>
            <section className={styles.verdict}><h2>Final verdict</h2><strong>A beautiful mind.<br />A catastrophic strategy.</strong><p>An extraordinary collection of hope, recency bias, and season-long delusion. May your next bet be slightly less insane.</p></section>
          </aside>
        </div>
        <footer className={styles.footer}>You didn&apos;t find this page. This page doesn&apos;t exist.</footer>
      </div>
    </main>
  )
}
