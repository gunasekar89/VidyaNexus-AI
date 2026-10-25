import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../AppContext'
import { monthlyHistory, monthView } from '../lib/attendance'
import { Card, PageHeader } from '../components/ui'
import { ProgressRing } from '../components/dashboard'

const tone = {
  P: 'bg-emerald-500 text-white',
  A: 'bg-rose-500 text-white',
  H: 'bg-amber-100 text-amber-700',
  W: 'bg-slate-100 text-slate-400',
  '': 'bg-white text-slate-400 border border-slate-100',
}

export default function Attendance() {
  const { t, tr, lang, data } = useApp()
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const isCurrent = cursor.y === now.getFullYear() && cursor.m === now.getMonth()
  const month = monthView(data.attendance, cursor.y, cursor.m)
  const history = monthlyHistory(data.attendance)
  const move = (n) => setCursor(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }))
  const legend = [
    { key: 'P', label: t('present'), count: month.present },
    { key: 'A', label: t('absent'), count: month.absent },
    { key: 'H', label: t('holiday'), count: month.holidays },
    { key: 'W', label: t('weekend') },
  ]
  // Sunday-first initials, e.g. S M T W T F S.
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 8, 1 + i).toLocaleDateString(lang === 'kn' ? 'kn-IN' : 'en-IN', { weekday: 'narrow' }))

  return (
    <div>
      <PageHeader title={t('attendance')} subtitle={tr(month.label)} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card className="flex flex-col items-center p-6">
          <ProgressRing value={month.pct ?? 0} label={month.pct === null ? '—' : undefined} size={170} stroke={14} sub={isCurrent ? t('thisMonth') : tr(month.label)} />
          <div className="mt-6 grid w-full grid-cols-3 gap-3 text-center">
            {legend.slice(0, 3).map((l) => (
              <div key={l.key} className="rounded-xl bg-slate-50 p-3">
                <div className="text-2xl font-bold text-ink">{l.count}</div>
                <div className="text-xs text-muted">{l.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 w-full">
            <h3 className="mb-3 text-sm font-semibold text-ink">{t('monthlyTrend')}</h3>
            <div className="flex h-32 items-end justify-between gap-3">
              {history.map((m) => (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[11px] text-muted">{m.pct === null ? '—' : `${m.pct}%`}</span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-emerald-500 to-emerald-300"
                    style={{ height: `${Math.max(((m.pct ?? 70) - 70) * 3, 4)}px` }}
                  />
                  <span className="text-xs text-muted">{tr(m.month)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-ink">{tr(month.label)}</h2>
            <div className="flex gap-1">
              <button onClick={() => move(-1)} className="rounded-lg p-1.5 text-muted hover:bg-slate-100" aria-label={t('previous')}>
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => move(1)} disabled={isCurrent} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 disabled:opacity-30" aria-label={t('next')}>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center">
            {weekdays.map((d, i) => (
              <div key={i} className="text-xs font-semibold text-muted">
                {d}
              </div>
            ))}
            {Array.from({ length: month.firstWeekday }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {month.days.map((d, i) => (
              <div key={i} className={`flex aspect-square items-center justify-center rounded-xl text-sm font-medium ${tone[d]}`}>
                {i + 1}
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-4">
            {legend.map((l) => (
              <span key={l.key} className="flex items-center gap-2 text-xs text-muted">
                <span className={`h-3 w-3 rounded ${tone[l.key]}`} /> {l.label}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
