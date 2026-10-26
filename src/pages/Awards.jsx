import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useApp } from '../AppContext'
import { awardCategories, awardLevels, awardMedals, badges } from '../../shared/catalog'
import { earnedBadges } from '../lib/achievements'
import { dateLabel } from '../lib/dates'
import { Card, PageHeader } from '../components/ui'
import BadgeGrid from '../components/BadgeGrid'

const medalStyle = {
  gold: 'from-amber-100 to-yellow-50 ring-amber-200',
  silver: 'from-slate-100 to-white ring-slate-200',
  bronze: 'from-orange-100 to-amber-50 ring-orange-200',
  special: 'from-violet-100 to-brand-50 ring-violet-200',
  participation: 'from-sky-100 to-white ring-sky-200',
}

const levelOrder = Object.keys(awardLevels)

function AwardCard({ award }) {
  const { tr } = useApp()
  const medal = awardMedals[award.medal] ?? awardMedals.special
  const category = awardCategories[award.category] ?? awardCategories.other
  return (
    <Card className="flex gap-4 p-5">
      <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-4xl ring-1 ${medalStyle[award.medal] ?? medalStyle.special}`}>
        {medal.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-ink">{tr(award.title)}</div>
        <div className="text-sm font-medium text-brand-700">{tr(medal)}</div>
        {tr(award.note) && <p className="mt-1 text-sm text-muted">{tr(award.note)}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
            {category.icon} {tr(category)}
          </span>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700">{tr(awardLevels[award.level])}</span>
          <span className="flex items-center gap-1 text-muted">
            <CalendarDays size={13} /> {tr(dateLabel(award.date, { day: 'numeric', month: 'short', year: 'numeric' }))}
          </span>
        </div>
      </div>
    </Card>
  )
}

export default function Awards() {
  const { t, tr, data } = useApp()
  const [filter, setFilter] = useState('all')
  const awards = data.awards
  const list = filter === 'all' ? awards : awards.filter((a) => a.category === filter)
  const earned = earnedBadges(data)
  const earnedCount = badges.filter((b) => earned[b.id]).length
  const highest = awards.reduce((best, a) => (levelOrder.indexOf(a.level) > levelOrder.indexOf(best) ? a.level : best), null)

  const kpis = [
    { label: t('totalAwards'), value: awards.length, tone: 'text-brand-700' },
    { label: t('firstPlaces'), value: awards.filter((a) => a.medal === 'gold').length, tone: 'text-amber-500' },
    { label: t('highestLevel'), value: highest ? tr(awardLevels[highest]) : '—', tone: 'text-emerald-600' },
    { label: t('badgesEarned'), value: `${earnedCount}/${badges.length}`, tone: 'text-violet-600' },
  ]
  const filters = ['all', ...Object.keys(awardCategories).filter((c) => awards.some((a) => a.category === c))]

  return (
    <div>
      <PageHeader title={t('awardsTitle')} subtitle={t('awardsSubtitle')} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-xs text-muted">{k.label}</div>
            <div className={`mt-1 text-2xl font-bold ${k.tone}`}>{k.value}</div>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-ink">{t('schoolAwards')}</h2>
      {awards.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${filter === f ? 'bg-brand-600 text-white' : 'bg-white text-muted shadow-card'}`}
            >
              {f === 'all' ? t('all') : `${awardCategories[f].icon} ${tr(awardCategories[f])}`}
            </button>
          ))}
        </div>
      )}
      {awards.length === 0 && <Card className="mb-6 p-8 text-center text-sm text-muted">{t('noAwards')}</Card>}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        {list.map((a) => (
          <AwardCard key={a.id} award={a} />
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-ink">{t('badges')}</h2>
      <Card className="p-5">
        <BadgeGrid earned={earned} />
      </Card>
    </div>
  )
}
