import { Resend } from 'resend'
import { NFL_TEAM_NAMES } from '@/types'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

const FROM_EMAIL = 'NFL Survivor Pool <onboarding@resend.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nfl-survivor.vercel.app'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Internal/test accounts (including sandbox test users) carry fake addresses
// that would bounce — never hand them to Resend.
function isDeliverable(email: string): boolean {
  return !email.endsWith('@nflsurvivor.internal')
}

export async function sendWelcomeEmail(
  email: string,
  fullName: string,
  pin: string
): Promise<void> {
  if (!isDeliverable(email)) return
  const name = esc(fullName)
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "You're in the NFL Survivor Pool! Here's your PIN",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Welcome to the NFL Survivor Pool!</h2>
        <p>Hey ${name},</p>
        <p>You've been added to the pool. Here's everything you need to know:</p>
        <ul>
          <li><strong>Entry fee:</strong> $25 via Venmo to @griffinsell before Week 1</li>
          <li><strong>Your login name:</strong> ${name}</li>
          <li><strong>Your PIN:</strong> <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${esc(pin)}</span></li>
        </ul>
        <p>Save that PIN — you'll need it every week to submit your pick. It won't be shown again.</p>
        <a href="${APP_URL}/login" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Log In &amp; Make Your Pick</a>
        <p style="margin-top: 24px; color: #666; font-size: 14px;">Can't remember your PIN? Use the "Forgot PIN" link on the login page to get a reset email.</p>
      </div>
    `,
  })
}

export async function sendPickConfirmationEmail(
  email: string,
  fullName: string,
  teamAbbr: string,
  weekNumber: number,
  deadlineStr: string
): Promise<void> {
  if (!isDeliverable(email)) return
  const teamName = NFL_TEAM_NAMES[teamAbbr] || teamAbbr
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Pick confirmed: ${teamName} — Week ${weekNumber}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Pick Confirmed ✓</h2>
        <p>Hey ${esc(fullName)},</p>
        <p>Your Week ${weekNumber} pick is locked in:</p>
        <div style="background: #f0fdf4; border: 2px solid #16a34a; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
          <div style="font-size: 32px; font-weight: bold; color: #15803d;">${esc(teamName)}</div>
          <div style="color: #666; font-size: 14px; margin-top: 4px;">${esc(teamAbbr)}</div>
        </div>
        <p>Good luck! Results are posted on the app after games conclude.</p>
        <a href="${APP_URL}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Standings</a>
      </div>
    `,
  })
}

export async function sendEliminationEmail(
  email: string,
  fullName: string,
  reason: string,
  weekNumber: number
): Promise<void> {
  if (!isDeliverable(email)) return
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `You've been eliminated — Week ${weekNumber}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Eliminated — Week ${weekNumber}</h2>
        <p>Hey ${esc(fullName)},</p>
        <p>Unfortunately, you've been eliminated from the pool:</p>
        <div style="background: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; color: #991b1b;">${esc(reason)}</p>
        </div>
        <p>You can still follow along on the public dashboard!</p>
        <a href="${APP_URL}" style="display: inline-block; background: #6b7280; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Standings</a>
      </div>
    `,
  })
}

export async function sendPinResetEmail(
  email: string,
  fullName: string,
  resetToken: string
): Promise<void> {
  if (!isDeliverable(email)) return
  const resetUrl = `${APP_URL}/reset-pin?token=${encodeURIComponent(resetToken)}`
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: 'NFL Survivor Pool — Reset your PIN',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Reset Your PIN</h2>
        <p>Hey ${esc(fullName)},</p>
        <p>Click the button below to set a new PIN. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Reset My PIN</a>
        <p style="margin-top: 24px; color: #666; font-size: 14px;">If you didn't request this, ignore this email — your PIN hasn't changed.</p>
      </div>
    `,
  })
}

export async function sendReminderEmail(
  email: string,
  fullName: string,
  weekNumber: number,
  deadlineStr: string
): Promise<void> {
  if (!isDeliverable(email)) return
  await getResend().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Reminder: Week ${weekNumber} pick deadline approaching`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #d97706;">&#9200; Pick Reminder</h2>
        <p>Hey ${esc(fullName)},</p>
        <p>You haven't submitted your Week ${weekNumber} pick yet!</p>
        <p><strong>Deadline: ${esc(deadlineStr)}</strong></p>
        <p>Miss the deadline and you'll be auto-assigned or eliminated.</p>
        <a href="${APP_URL}/pick" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Submit My Pick</a>
      </div>
    `,
  })
}
