import { Resend } from 'resend'
import { NFL_TEAM_NAMES } from '@/types'

let _resend: Resend | null = null
export function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export const FROM_EMAIL = 'Griffin Sell - NFL Survivor <pool@pickandpray.org>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pickandpray.org'

// Resend's free tier allows ~2 requests/sec — loops sending to many
// recipients must pace themselves with this delay between sends.
export const SEND_DELAY_MS = 600

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The Resend SDK reports failures via its `{ error }` return value — it does
// NOT throw — so every sender below checks it and reports back. Callers must
// look at `ok` (and count failures) instead of assuming a resolved promise
// means the email was delivered.
export interface SendResult {
  ok: boolean
  error?: string
}

const LOGO_HEADER = `
  <table role="presentation" align="center" style="margin: 0 auto 20px;" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding-right: 12px;"><img src="${APP_URL}/logo.png" width="64" height="64" alt="Pick and Pray" style="border-radius: 50%; display: block;" /></td>
      <td style="font-family: Arial, Helvetica, sans-serif; font-weight: 900; font-size: 22px; letter-spacing: 1px; color: #1a1a1a; white-space: nowrap;">NFL SURVIVOR</td>
    </tr>
  </table>
`

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Internal/test accounts (including sandbox test users) carry fake addresses
// that would bounce — never hand them to Resend.
export function isDeliverable(email: string): boolean {
  return !email.endsWith('@nflsurvivor.internal')
}

async function sendChecked(payload: {
  to: string
  subject: string
  html: string
}): Promise<SendResult> {
  const { error } = await getResend().emails.send({ from: FROM_EMAIL, ...payload })
  if (error) {
    console.error(`Email to ${payload.to} failed ("${payload.subject}"):`, error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function sendWelcomeEmail(
  email: string,
  fullName: string,
  pin: string
): Promise<SendResult> {
  if (!isDeliverable(email)) return { ok: true }
  const name = esc(fullName)
  return sendChecked({
    to: email,
    subject: "Welcome to the 2026 NFL Survivor Pool — You're In!",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${LOGO_HEADER}
        <p>Hey ${name}, welcome to the 2026 NFL Survivor Pool!</p>
        <p>Entry: $25 &mdash; If you haven&rsquo;t already, please Venmo @griffinsell before Week 1.</p>
        <p style="margin-bottom: 4px;">Your login name: ${name}</p>
        <p style="margin-top: 0;">Your PIN: ${esc(pin)} &mdash; save that PIN, you&rsquo;ll need it every week to submit your pick.</p>
        <a href="${APP_URL}/login" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Log In &amp; Make Your Pick</a>
        <p>Join the GroupMe chat here: <a href="https://groupme.com/join_group/116696794/alYOgDf2">https://groupme.com/join_group/116696794/alYOgDf2</a></p>
        <p>Rules (quick hits):</p>
        <ul>
          <li>Choose one NFL team to win each week</li>
          <li>No repeats; you can&rsquo;t use the same team twice</li>
          <li>Win and advance; lose or tie and you&rsquo;re out</li>
          <li>Deadlines: Wed-Sat games lock at kickoff; all other picks lock Sunday at 12PM CT</li>
          <li>Missed pick: SNF away team OR MNF away team if SNF team was already used. If both already used, you&rsquo;re eliminated.</li>
        </ul>
        <p>Last survivor wins the pot. If multiple survivors remain at the end, the entire pot is split amongst those people. My phone number is 612-790-3985 and email is griffin.sell@icloud.com. Please reach out with any questions!</p>
        <p>Can&rsquo;t remember your PIN? Use the &ldquo;Forgot PIN&rdquo; link on the login page to get a reset email.</p>
        <p>Good luck,</p>
        <p>Griffin Sell</p>
      </div>
    `,
  })
}

export async function sendPickConfirmationEmail(
  email: string,
  fullName: string,
  teamAbbr: string,
  weekNumber: number
): Promise<SendResult> {
  if (!isDeliverable(email)) return { ok: true }
  const teamName = NFL_TEAM_NAMES[teamAbbr] || teamAbbr
  return sendChecked({
    to: email,
    subject: `You're Rolling With ${teamName} — Week ${weekNumber}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${LOGO_HEADER}
        <p>Hey ${esc(fullName)},</p>
        <p>You&rsquo;re locked in with ${esc(teamName)} for Week ${weekNumber}. You can still change it up until kickoff or Sunday at 12PM CT, whichever comes first. Let&rsquo;s see how it shakes out.</p>
        <a href="${APP_URL}" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Standings</a>
        <p style="margin-top: 24px;">Best of luck,</p>
        <p>Griffin Sell</p>
      </div>
    `,
  })
}

// `teamAbbr` is null for a missed-deadline elimination (no team was picked).
export async function sendEliminationEmail(
  email: string,
  fullName: string,
  teamAbbr: string | null,
  weekNumber: number
): Promise<SendResult> {
  if (!isDeliverable(email)) return { ok: true }
  const teamName = teamAbbr ? NFL_TEAM_NAMES[teamAbbr] || teamAbbr : null
  const outcome = teamName
    ? `Well&hellip; ${esc(teamName)} came up short.`
    : `Well&hellip; you missed the deadline.`
  return sendChecked({
    to: email,
    subject: `Tough One — You're Out Week ${weekNumber}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${LOGO_HEADER}
        <p>Hey ${esc(fullName)},</p>
        <p>${outcome} You&rsquo;ve been eliminated from the pool. Feel free to stick around, follow the standings, and enjoy watching until a winner is crowned.</p>
        <p>Thanks for playing this year. Will be running it back for March Madness, so stay tuned!</p>
        <a href="${APP_URL}" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Standings</a>
        <p style="margin-top: 24px;">All the best,</p>
        <p>Griffin Sell</p>
      </div>
    `,
  })
}

export async function sendPinResetEmail(
  email: string,
  fullName: string,
  resetToken: string
): Promise<SendResult> {
  if (!isDeliverable(email)) return { ok: true }
  const resetUrl = `${APP_URL}/reset-pin?token=${encodeURIComponent(resetToken)}`
  return sendChecked({
    to: email,
    subject: 'Reset Your PIN',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${LOGO_HEADER}
        <p>Hey ${esc(fullName)},</p>
        <p>Click below to reset your PIN.</p>
        <a href="${resetUrl}" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Reset My PIN</a>
        <p style="margin-top: 24px; color: #666; font-size: 14px;">Heads up, this link expires in 1 hour. If you didn't request this, no worries, just ignore the email.</p>
      </div>
    `,
  })
}

export async function sendReminderEmail(
  email: string,
  fullName: string,
  weekNumber: number,
  deadlineStr: string
): Promise<SendResult> {
  if (!isDeliverable(email)) return { ok: true }
  return sendChecked({
    to: email,
    subject: `Don't Sleep On This — Week ${weekNumber} Pick Due Soon`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${LOGO_HEADER}
        <p>Hey ${esc(fullName)},</p>
        <p>Still waiting on your pick...</p>
        <p>Deadline: ${esc(deadlineStr)}</p>
        <p>Get your pick in before then or you&rsquo;ll get auto-picked. Take two minutes and lock it in.</p>
        <a href="${APP_URL}/pick" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Submit My Pick</a>
        <p style="margin-top: 24px;">Good luck,</p>
        <p>Griffin Sell</p>
      </div>
    `,
  })
}
