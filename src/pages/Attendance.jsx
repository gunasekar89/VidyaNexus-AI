import { useApp } from '../AppContext'
import { attendanceHistory, attendanceMonth } from '../data/mock'
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
  const { t, tr } = useApp()
  const days = attendanceMonth.days
  const present = days.filter((d) => d === 'P').length
  const absent = days.filter((d) => d === 'A').length
  const holidays = days.filter((d) => d === 'H').length
  const legend = [
    { key: 'P', label: t('present'), count: present },
    { key: 'A', label: t('absent'), count: absent },
    { key: 'H', label: t('holiday'), count: holidays },
    { key: 'W', label: t('weekend') },
  ]

  return (
    <div>
      <PageHeader title={t('attendance')} subtitle={tr(attendanceMonth.label)} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card className="flex flex-col items-center p-6">
          <ProgressRing value={92} size={170} stroke={14} sub={t('thisMonth')} />
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
              {attendanceHistory.map((m) => (
                <div key={m.month.en} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[11px] text-muted">{m.pct}%</span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-emerald-500 to-emerald-300"
                    style={{ height: `${(m.pct - 70) * 3}px` }}
                  />
                  <span className="text-xs text-muted">{tr(m.month)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-ink">{tr(attendanceMonth.label)}</h2>
          <div className="grid grid-cols-7 gap-2 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="text-xs font-semibold text-muted">
                {d}
              </div>
            ))}
            {Array.from({ length: attendanceMonth.firstWeekday }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {days.map((d, i) => (
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
