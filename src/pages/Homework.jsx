import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useApp } from '../AppContext'
import { Card, PageHeader, SubjectIcon } from '../components/ui'
import { DuePill } from '../components/dashboard'

export default function Homework() {
  const { t, tr, homework, toggleHomework, showToast, subjectById } = useApp()
  const [filter, setFilter] = useState('pending')
  const filters = [
    { key: 'pending', label: t('pending'), count: homework.filter((h) => !h.done).length },
    { key: 'today', label: t('dueToday'), count: homework.filter((h) => !h.done && h.due === 'today').length },
    { key: 'done', label: t('done'), count: homework.filter((h) => h.done).length },
    { key: 'all', label: t('all'), count: homework.length },
  ]
  const list = homework.filter((h) =>
    filter === 'all' ? true : filter === 'done' ? h.done : filter === 'today' ? !h.done && h.due === 'today' : !h.done,
  )

  return (
    <div>
      <PageHeader title={t('homework')} subtitle={t('upcomingTasks')} />
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${
              filter === f.key ? 'bg-brand-600 text-white' : 'bg-white text-muted shadow-card'
            }`}
          >
            {f.label}
            <span className={`rounded-full px-1.5 text-xs ${filter === f.key ? 'bg-white/20' : 'bg-slate-100'}`}>{f.count}</span>
          </button>
        ))}
      </div>
      <Card className="divide-y divide-slate-100">
        {list.length === 0 && <p className="p-8 text-center text-sm text-muted">🎉 {t('noNotifications')}</p>}
        {list.map((h) => {
          const s = subjectById[h.subject]
          return (
            <div key={h.id} className="flex items-center gap-4 p-4">
              <button
                onClick={() => {
                  toggleHomework(h.id)
                  if (!h.done) showToast(`✅ ${tr(h.title)}`)
                }}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition ${
                  h.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-brand-500'
                }`}
                aria-label={h.done ? t('markUndone') : t('markDone')}
              >
                {h.done && <Check size={14} strokeWidth={3} />}
              </button>
              <Link to={`/subjects/${s.id}`} className="hidden sm:block">
                <SubjectIcon subject={s} size="sm" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className={`text-[15px] font-medium ${h.done ? 'text-slate-400 line-through' : 'text-ink'}`}>{tr(h.title)}</div>
                <div className="text-sm text-muted">
                  {tr(h.detail)} · {tr(s.name)}
                </div>
              </div>
              <DuePill item={h} />
            </div>
          )
        })}
      </Card>
    </div>
  )
}
