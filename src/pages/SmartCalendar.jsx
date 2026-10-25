import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../AppContext'
import { dateLabel, isoDate } from '../lib/dates'
import { timetable, weekSchedule } from '../../shared/catalog'
import { Card, PageHeader } from '../components/ui'

const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayNames = {
  Mon: { en: 'Monday', kn: 'ಸೋಮವಾರ' },
  Tue: { en: 'Tuesday', kn: 'ಮಂಗಳವಾರ' },
  Wed: { en: 'Wednesday', kn: 'ಬುಧವಾರ' },
  Thu: { en: 'Thursday', kn: 'ಗುರುವಾರ' },
  Fri: { en: 'Friday', kn: 'ಶುಕ್ರವಾರ' },
  Sat: { en: 'Saturday', kn: 'ಶನಿವಾರ' },
}

const cellTone = {
  mathematics: 'bg-orange-50 text-orange-700 border-orange-100',
  science: 'bg-sky-50 text-sky-700 border-sky-100',
  english: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  'social-science': 'bg-amber-50 text-amber-700 border-amber-100',
  kannada: 'bg-pink-50 text-pink-700 border-pink-100',
  'computer-science': 'bg-violet-50 text-violet-700 border-violet-100',
}

// Month events come from real homework due dates, exams and dated announcements.
function useMonthEvents() {
  const { data, subjectById } = useApp()
  const events = {}
  const add = (date, ev) => (events[date] ??= []).push(ev)
  for (const h of data.homework) add(h.dueDate, { ...h.title, tone: h.done ? 'bg-slate-100 text-slate-500 line-through' : 'bg-emerald-100 text-emerald-700', to: '/homework' })
  for (const e of data.exams) {
    const name = subjectById[e.subject]?.name
    add(e.date, { en: `${name?.en} ${e.name.en}`, kn: `${name?.kn} ${e.name.kn}`, tone: 'bg-blue-100 text-blue-700', to: '/tests' })
  }
  for (const a of data.announcements) {
    if (a.eventDate) add(a.eventDate, { ...a.title, tone: a.category === 'holiday' ? 'bg-rose-100 text-rose-600' : 'bg-violet-100 text-violet-700', to: '/announcements' })
  }
  return events
}

function MonthView() {
  const { t, tr, lang } = useApp()
  const events = useMonthEvents()
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const first = new Date(cursor.y, cursor.m, 1)
  const count = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const todayIso = isoDate()
  const move = (n) => setCursor(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }))
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 8, 1 + i).toLocaleDateString(lang === 'kn' ? 'kn-IN' : 'en-IN', { weekday: 'short' }))

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-ink">{tr(dateLabel(first, { month: 'long', year: 'numeric' }))}</h2>
        <div className="flex gap-1">
          <button onClick={() => move(-1)} className="rounded-lg p-1.5 text-muted hover:bg-slate-100" aria-label={t('previous')}>
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => move(1)} className="rounded-lg p-1.5 text-muted hover:bg-slate-100" aria-label={t('next')}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted">
        {weekdays.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
        {Array.from({ length: first.getDay() }, (_, i) => (
          <div key={`b${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const day = i + 1
          const date = isoDate(new Date(cursor.y, cursor.m, day))
          const list = events[date] ?? []
          return (
            <div
              key={day}
              className={`min-h-[64px] rounded-xl border p-1.5 text-left md:min-h-[86px] ${date === todayIso ? 'border-brand-500 bg-brand-50/50' : 'border-slate-100'}`}
            >
              <span className={`text-xs font-semibold ${date === todayIso ? 'text-brand-700' : 'text-ink'}`}>{day}</span>
              {list.slice(0, 2).map((ev, j) => (
                <Link key={j} to={ev.to} className={`mt-1 block truncate rounded-md px-1.5 py-1 text-[10px] leading-tight md:text-[11px] ${ev.tone}`} title={tr(ev)}>
                  {tr(ev)}
                </Link>
              ))}
              {list.length > 2 && <span className="mt-0.5 block text-[10px] text-muted">+{list.length - 2}</span>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export default function SmartCalendar() {
  const { t, tr, subjectById } = useApp()
  const [view, setView] = useState('week')
  const todayIdx = Math.min(Math.max(new Date().getDay() - 1, 0), 5)
  const [mobileDay, setMobileDay] = useState(dayKeys[todayIdx])

  return (
    <div>
      <PageHeader
        title={t('smartCalendar')}
        subtitle={t('todaysTimetable')}
        action={
          <div className="flex rounded-xl bg-white p-1 shadow-card">
            {['week', 'month'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium ${view === v ? 'bg-brand-600 text-white' : 'text-muted'}`}
              >
                {t(v)}
              </button>
            ))}
          </div>
        }
      />

      {view === 'week' ? (
        <>
          {/* Desktop: full week grid */}
          <Card className="hidden overflow-x-auto p-4 md:block">
            <table className="w-full border-separate border-spacing-1.5 text-sm">
              <thead>
                <tr>
                  <th className="w-28" />
                  {dayKeys.map((d, i) => (
                    <th key={d} className={`rounded-lg py-2 font-semibold ${i === todayIdx ? 'bg-brand-600 text-white' : 'text-ink'}`}>
                      {tr(dayNames[d])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timetable.map((slot, p) => (
                  <tr key={slot.start}>
                    <td className="whitespace-nowrap pr-2 text-xs text-muted">
                      {slot.start} – {slot.end}
                    </td>
                    {dayKeys.map((d) => {
                      const sid = weekSchedule[d][p]
                      if (!sid) return <td key={d} className="rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400">—</td>
                      return (
                        <td key={d}>
                          <Link to={`/subjects/${sid}`} className={`block rounded-lg border px-3 py-2.5 font-medium hover:shadow-card ${cellTone[sid]}`}>
                            {tr(subjectById[sid].name)}
                            <span className="block text-[11px] font-normal opacity-70">{tr(slot.room)}</span>
                          </Link>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile: day picker + list */}
          <div className="md:hidden">
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {dayKeys.map((d) => (
                <button
                  key={d}
                  onClick={() => setMobileDay(d)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${mobileDay === d ? 'bg-brand-600 text-white' : 'bg-white text-muted shadow-card'}`}
                >
                  {tr(dayNames[d]).slice(0, 3)}
                </button>
              ))}
            </div>
            <Card className="divide-y divide-slate-100 p-2">
              {timetable.map((slot, p) => {
                const sid = weekSchedule[mobileDay][p]
                return (
                  <div key={slot.start} className="flex items-center gap-3 px-2 py-3">
                    <span className="w-24 text-xs text-muted">
                      {slot.start} – {slot.end}
                    </span>
                    {sid ? (
                      <Link to={`/subjects/${sid}`} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${cellTone[sid]}`}>
                        {tr(subjectById[sid].name)}
                      </Link>
                    ) : (
                      <span className="flex-1 text-sm text-slate-400">{t('free')}</span>
                    )}
                  </div>
                )
              })}
            </Card>
          </div>
        </>
      ) : (
        <MonthView />
      )}
    </div>
  )
}
