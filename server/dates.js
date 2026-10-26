// Dates are stored as plain 'YYYY-MM-DD' strings in the server's local time
// zone (set TZ=Asia/Kolkata in production).
const pad = (n) => String(n).padStart(2, '0')

export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s, n) {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

// Weeks start on Monday.
export function weekStart(s = isoDate()) {
  const d = parseDate(s)
  return addDays(s, -((d.getDay() + 6) % 7))
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDate(s).getTime())
