import { useState } from 'react'
import { useApp } from '../AppContext'
import { announcements } from '../data/mock'
import { Card, PageHeader } from '../components/ui'
import { AnnouncementIcon } from '../components/dashboard'

export default function AnnouncementsPage() {
  const { t, tr } = useApp()
  const [filter, setFilter] = useState('all')
  const filters = [
    { key: 'all', label: t('all') },
    { key: 'important', label: t('important') },
    { key: 'event', label: t('events') },
    { key: 'holiday', label: t('holidays') },
    { key: 'library', label: t('library') },
  ]
  const list = announcements.filter((a) => (filter === 'all' ? true : filter === 'important' ? a.important : a.category === filter))

  return (
    <div>
      <PageHeader title={t('schoolAnnouncements')} />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${filter === f.key ? 'bg-brand-600 text-white' : 'bg-white text-muted shadow-card'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {list.map((a) => (
          <Card key={a.id} className="flex items-start gap-4 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50">
              <AnnouncementIcon name={a.icon} size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-ink">{tr(a.title)}</h2>
                {a.important && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-600">{t('important')}</span>}
              </div>
              <p className="mt-1 text-sm text-muted">{tr(a.body)}</p>
            </div>
            <span className="shrink-0 text-xs text-muted">{tr(a.time)}</span>
          </Card>
        ))}
      </div>
    </div>
  )
}
