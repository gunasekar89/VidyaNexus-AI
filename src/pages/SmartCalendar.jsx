import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../AppContext'
import { subjectById, timetable, weekSchedule } from '../data/mock'
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

// October 2024 events, keyed by day of month.
const events = {
  10: { en: 'Dasara holidays begin', kn: 'ದಸರಾ ರಜೆ ಆರಂಭ', tone: 'bg-rose-100 text-rose-600' },
  12: { en: 'English Essay due', kn: 'ಇಂಗ್ಲಿಷ್ ಪ್ರಬಂಧ', tone: 'bg-emerald-100 text-emerald-700' },
  15: { en: 'SS Project due', kn: 'ಸಮಾಜ ಯೋಜನೆ', tone: 'bg-amber-100 text-amber-700' },
  19: { en: 'Parent–Teacher Meeting', kn: 'ಪೋಷಕ–ಶಿಕ್ಷಕ ಸಭೆ', tone: 'bg-violet-100 text-violet-700' },
  25: { en: 'Science Fair registration', kn: 'ವಿಜ್ಞಾನ ಮೇಳ ನೋಂದಣಿ', tone: 'bg-sky-100 text-sky-700' },
  31: { en: 'Maths Unit Test', kn: 'ಗಣಿತ ಘಟಕ ಪರೀಕ್ಷೆ', tone: 'bg-blue-100 text-blue-700' },
}

export default function SmartCalendar() {
  const { t, tr } = useApp()
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
        <Card className="p-4">
          <h2 className="mb-3 font-semibold text-ink">{tr({ en: 'October 2024', kn: 'ಅಕ್ಟೋಬರ್ 2024' })}</h2>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
            {Array.from({ length: 2 }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {Array.from({ length: 31 }, (_, i) => {
              const day = i + 1
              const ev = events[day]
              return (
                <div key={day} className="min-h-[64px] rounded-xl border border-slate-100 p-1.5 text-left md:min-h-[86px]">
                  <span className="text-xs font-semibold text-ink">{day}</span>
                  {ev && <span className={`mt-1 block rounded-md px-1.5 py-1 text-[10px] leading-tight md:text-[11px] ${ev.tone}`}>{tr(ev)}</span>}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
