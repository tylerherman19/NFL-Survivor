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
    subject: "Welcome to the 2026 NFL Survivor Pool - Here's Your PIN",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${LOGO_HEADER}
        <p>Hey ${name},</p>
        <p>You're officially in the 2026 NFL Survivor Pool. Let's run through the basics real quick:</p>
        <p><strong>Entry fee:</strong> $25 via Venmo to <strong>@griffinsell</strong> &mdash; please get that squared away if you haven't already. If you don't have Venmo, reach out to me at 612-790-3985 and we can find another way.</p>
        <p style="margin-bottom: 4px;"><strong>Your login:</strong> ${name}</p>
        <p style="margin-top: 0;"><strong>Your PIN:</strong> <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${esc(pin)}</span></p>
        <a href="${APP_URL}/login" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Log In &amp; Make Your Pick</a>
        <p style="margin-top: 24px;">Pick a team each week. If they win, you live to see another week. If they lose (or tie), you're out. Can't pick the same team twice. Winner takes the pot.</p>
        <p style="color: #666; font-size: 14px;">Forgot your PIN down the road? There's a reset link on the login page.</p>
        <p>Alright, good luck. Pick smart, don't overthink it, and let's have a fun season!</p>
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
    subject: `You're Rolling With ${teamName} - Week ${weekNumber}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${LOGO_HEADER}
        <p>Hey ${esc(fullName)},</p>
        <p style="font-size: 20px; font-weight: bold; color: #1a1a1a;">Pick Confirmed - ${esc(teamName)}</p>
        <p>That's your Week ${weekNumber} pick, locked in. Can change up until kickoff or Sunday 12 PM CT, whichever comes first.</p>
        <p>We'll see how it shakes out. Check back on standings to see where you're at against everyone else in the pool.</p>
        <a href="${APP_URL}" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Standings</a>
      </div>
    `,
  })
}

// `_reason` is still recorded in the DB by callers; the email itself uses one
// generic message for every elimination (game loss, tie, or missed deadline).
export async function sendEliminationEmail(
  email: string,
  _fullName: string,
  _reason: string,
  weekNumber: number
): Promise<SendResult> {
  if (!isDeliverable(email)) return { ok: true }
  return sendChecked({
    to: email,
    subject: `Tough One - You're Out Week ${weekNumber}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${LOGO_HEADER}
        <p>Your run ended this week, and that means you've been eliminated from the pool. Feel free to stick around, follow the standings, and see who else drops.</p>
        <p>Thanks for joining this year. Will be running this back for March Madness, so stay tuned.</p>
        <a href="${APP_URL}" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Standings</a>
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
    subject: `Don't Sleep On This - Week ${weekNumber} Pick Due Soon`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${LOGO_HEADER}
        <p>Hey ${esc(fullName)},</p>
        <p>You haven't made your pick yet.</p>
        <p><strong>Deadline: ${esc(deadlineStr)}</strong></p>
        <p>Get your pick in before then or you're getting an auto-pick. Nobody wants to go out like that. Take two minutes and lock it in.</p>
        <a href="${APP_URL}/pick" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Submit My Pick</a>
      </div>
    `,
  })
}
