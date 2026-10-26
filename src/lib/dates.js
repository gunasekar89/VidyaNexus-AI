// Date helpers. Dates from the API are 'YYYY-MM-DD' strings; labels are built
// in both languages at once so components can keep using tr({ en, kn }).
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

export const daysBetween = (from, to) => Math.round((parseDate(to) - parseDate(from)) / 864e5)

const locales = { en: 'en-IN', kn: 'kn-IN' }

export function dateLabel(s, options = { day: 'numeric', month: 'short' }) {
  const d = typeof s === 'string' ? parseDate(s) : s
  return {
    en: d.toLocaleDateString(locales.en, options),
    kn: d.toLocaleDateString(locales.kn, options),
  }
}

export function relativeTime(iso, now = Date.now()) {
  const secs = (new Date(iso).getTime() - now) / 1000
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  const [unit, size] = units.find(([, size]) => Math.abs(secs) >= size) ?? ['minute', 60]
  const value = Math.round(secs / size)
  const fmt = (l) => new Intl.RelativeTimeFormat(locales[l], { numeric: 'auto' }).format(value, unit)
  return { en: fmt('en'), kn: fmt('kn') }
}

// Monday-first week key used by the timetable ('Mon' … 'Sat'; null on Sunday).
const dayKeys = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const weekdayKey = (d = new Date()) => (d.getDay() === 0 ? null : dayKeys[d.getDay()])
