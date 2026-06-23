import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'

// Generate a random 6-digit numeric PIN
export function generatePin(): string {
  const buf = randomBytes(3)
  // Convert 3 bytes to a number 0-16777215, modulo 900000 + 100000 = 6 digits guaranteed
  const num = (buf[0] * 65536 + buf[1] * 256 + buf[2]) % 900000 + 100000
  return num.toString()
}

// Hash a PIN using bcrypt
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 12)
}

// Verify a PIN against a hash
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash)
}

// Generate a URL-safe reset token
export function generateResetToken(): string {
  return randomBytes(32).toString('hex')
}
