import crypto from 'node:crypto'

// Time-based one-time passwords (RFC 6238), compatible with Google
// Authenticator, Microsoft Authenticator and similar apps.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP = 30

export function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(str) {
  const clean = str.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch)
    if (i < 0) throw new Error('bad base32')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export const newSecret = () => base32Encode(crypto.randomBytes(20))

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP)

export function codeAt(secret, step) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 15
  const n = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1e6
  return String(n).padStart(6, '0')
}

// Returns the matched time step (to block reuse of the same code), or null.
// Accepts one step of clock drift either way.
export function verify(secret, code, { lastStep = null, now = Date.now() } = {}) {
  const clean = String(code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return null
  const step = currentStep(now)
  for (const s of [step, step - 1, step + 1]) {
    if (lastStep !== null && s <= lastStep) continue
    const expected = codeAt(secret, s)
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return s
  }
  return null
}

export const otpauthUri = (secret, account, issuer = 'VidyaNexus') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&period=${STEP}&digits=6&algorithm=SHA1`
