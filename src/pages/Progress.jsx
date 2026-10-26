import { useApp } from '../AppContext'
import { earnedBadges, studyStreak } from '../lib/achievements'
import { addDays, dateLabel, isoDate } from '../lib/dates'
import { Card, PageHeader, ProgressBar, SubjectIcon } from '../components/ui'
import BadgeGrid from '../components/BadgeGrid'

export default function Progress() {
  const { t, tr, data, subjects } = useApp()
  const byDate = Object.fromEntries(data.studyLog.map((d) => [d.date, d.minutes]))
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(isoDate(), i - 6)
    return { date, mins: byDate[date] ?? 0, day: dateLabel(date, { weekday: 'short' }) }
  })
  const results = data.results
  const avg = results.length ? Math.round(results.reduce((sum, r) => sum + (r.score / r.max) * 100, 0) / results.length) : null
  const totalMins = week.reduce((sum, d) => sum + d.mins, 0)
  const maxMins = Math.max(1, ...week.map((d) => d.mins))
  const overall = subjects.length ? Math.round(subjects.reduce((sum, s) => sum + s.progress, 0) / subjects.length) : 0
  const streak = studyStreak(data.studyLog)
  const earned = earnedBadges(data)

  const kpis = [
    { label: t('overall'), value: `${overall}%`, tone: 'text-brand-700' },
    { label: t('averageScore'), value: avg === null ? '—' : `${avg}%`, tone: 'text-emerald-600' },
    { label: t('studyTime'), value: `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`, tone: 'text-violet-600' },
    { label: t('streak'), value: `${streak}${streak ? ' 🔥' : ''}`, tone: 'text-orange-500' },
  ]

  return (
    <div>
      <PageHeader title={t('progress')} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-xs text-muted">{k.label}</div>
            <div className={`mt-1 text-2xl font-bold ${k.tone}`}>{k.value}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-ink">{t('subjectProgress')}</h2>
          <div className="space-y-4">
            {subjects.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <SubjectIcon subject={s} size="sm" />
                <span className="w-32 shrink-0 truncate text-sm text-ink">{tr(s.name)}</span>
                <ProgressBar value={s.progress} />
                <span className="w-10 text-right text-sm text-ink">{s.progress}%</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-ink">
            {t('studyTime')} <span className="text-sm font-normal text-muted">({totalMins} {t('minutes')})</span>
          </h2>
          <div className="flex h-48 items-end justify-between gap-3">
            {week.map((d) => (
              <div key={d.date} className="group flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] text-muted opacity-0 transition group-hover:opacity-100">{d.mins}</span>
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-violet-400 transition group-hover:from-brand-700"
                  style={{ height: `${Math.max((d.mins / maxMins) * 150, 3)}px` }}
                />
                <span className="text-xs text-muted">{tr(d.day)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{t('studyTimeNote')}</p>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-ink">{t('badges')}</h2>
          <BadgeGrid earned={earned} />
        </Card>
      </div>
    </div>
  )
}
