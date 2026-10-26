import { isoDate } from './dates'

// Builds a month of attendance cells from the student's records:
// P = present, A = absent, H = holiday, W = Sunday, '' = not marked yet / future.
export function monthView(records, year, month, today = isoDate()) {
  const count = new Date(year, month + 1, 0).getDate()
  const days = []
  for (let d = 1; d <= count; d++) {
    const date = isoDate(new Date(year, month, d))
    const status = date > today ? '' : records[date] ?? (new Date(year, month, d).getDay() === 0 ? 'W' : '')
    days.push(status)
  }
  const present = days.filter((d) => d === 'P').length
  const absent = days.filter((d) => d === 'A').length
  const holidays = days.filter((d) => d === 'H').length
  return {
    days,
    firstWeekday: new Date(year, month, 1).getDay(),
    present,
    absent,
    holidays,
    pct: present + absent ? Math.round((present / (present + absent)) * 100) : null,
    label: {
      en: new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      kn: new Date(year, month, 1).toLocaleDateString('kn-IN', { month: 'long', year: 'numeric' }),
    },
  }
}

export function currentMonthPct(records) {
  const now = new Date()
  return monthView(records, now.getFullYear(), now.getMonth()).pct
}

// Attendance % for the last n months, oldest first.
export function monthlyHistory(records, n = 5) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    const view = monthView(records, d.getFullYear(), d.getMonth())
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      month: {
        en: d.toLocaleDateString('en-IN', { month: 'short' }),
        kn: d.toLocaleDateString('kn-IN', { month: 'short' }),
      },
      pct: view.pct,
    }
  })
}
