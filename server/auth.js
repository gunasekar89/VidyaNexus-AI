import crypto from 'node:crypto'
import { one, run } from './db.js'

const SESSION_DAYS = 30
export const COOKIE = 'vn_session'

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  const [, salt, hash] = stored.split(':')
  const candidate = crypto.scryptSync(password, salt, 64)
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'))
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString()
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, expires)
  return { token, expires }
}

export const destroySession = (token) => run('DELETE FROM sessions WHERE token = ?', token)

function readCookie(req, name) {
  const header = req.headers.cookie || ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

export function setSessionCookie(res, { token, expires }) {
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expires).toUTCString()}${secure}`,
  )
}

export const clearSessionCookie = (res) => res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)

// Attaches req.user (or leaves it undefined) from the session cookie.
export function loadUser(req, _res, next) {
  const token = readCookie(req, COOKIE)
  if (token) {
    const row = one(
      `SELECT u.*, s.token FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
      token,
      new Date().toISOString(),
    )
    if (row) req.user = row
  }
  next()
}

export const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'auth.required' }))
export const requireRole = (role) => (req, res, next) =>
  !req.user ? res.status(401).json({ error: 'auth.required' }) : req.user.role !== role ? res.status(403).json({ error: 'auth.forbidden' }) : next()

// Small in-memory limiter, enough to slow down password guessing and protect the AI budget.
export function rateLimit({ windowMs, max, key = (req) => req.ip }) {
  const hits = new Map()
  return (req, res, next) => {
    const k = key(req)
    const now = Date.now()
    const list = (hits.get(k) || []).filter((t) => now - t < windowMs)
    if (list.length >= max) return res.status(429).json({ error: 'rate.limited' })
    list.push(now)
    hits.set(k, list)
    next()
  }
}

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.name,
    firstName: { en: u.first_name_en, kn: u.first_name_kn },
    className: { en: u.class_name_en, kn: u.class_name_kn },
    school: { en: u.school_en, kn: u.school_kn },
    rollNo: u.roll_no,
    guardian: u.guardian,
    phone: u.phone,
    avatar: u.avatar,
    lang: u.lang,
  }
}
