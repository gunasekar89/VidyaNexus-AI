import { useEffect, useState } from 'react'
import { Award, CalendarCheck, ClipboardList, FileText, Megaphone, ShieldCheck } from 'lucide-react'
import { useApp } from '../AppContext'
import { Avatar } from '../components/Layout'
import { Card, PageHeader, Pill } from '../components/ui'
import { addDays, dateLabel, isoDate } from '../lib/dates'
import { Loading, useApi } from './admin/Admin'
import { subjectById } from '../../shared/catalog'

function Section({ icon: Icon, title, children }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
        <Icon size={18} className="text-brand-600" /> {title}
      </h2>
      {children}
    </Card>
  )
}

function Empty() {
  const { t } = useApp()
  return <p className="text-sm text-muted">{t('nothingYet')}</p>
}

function ChildView({ child }) {
  const { t, tr } = useApp()
  const state = useApi(`/family/children/${child.id}`)
  const d = state.data
  if (!d) return <Loading state={state} />
  if (!d.enrolled) return <Card className="p-5 text-sm text-muted">{t('notEnrolled')}</Card>
  const since = addDays(isoDate(), -30)
  const recent = Object.entries(d.attendance).filter(([date, s]) => date >= since && s !== 'H')
  const present = recent.filter(([, s]) => s === 'P').length
  const pct = recent.length ? Math.round((present / recent.length) * 100) : null
  const todo = d.homework.filter((h) => !h.done && h.dueDate >= isoDate())
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section icon={CalendarCheck} title={t('attendance30')}>
        {pct === null ? (
          <Empty />
        ) : (
          <p className="text-3xl font-bold text-ink">
            {pct}% <span className="text-sm font-normal text-muted">({present}/{recent.length})</span>
          </p>
        )}
      </Section>
      <Section icon={ClipboardList} title={t('upcomingExamsT')}>
        {d.exams.length ? (
          <ul className="space-y-2 text-sm">
            {d.exams.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span>
                  {tr(subjectById[e.subject]?.name)} · {tr(e.name)}
                </span>
                <span className="text-muted">{tr(dateLabel(e.date, { weekday: 'short', day: 'numeric', month: 'short' }))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>
      <Section icon={FileText} title={t('homeworkToDo')}>
        {todo.length ? (
          <ul className="space-y-2 text-sm">
            {todo.map((h) => (
              <li key={h.id} className="flex justify-between gap-3">
                <span>{tr(h.title)}</span>
                <span className="text-muted">{tr(dateLabel(h.dueDate))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>
      <Section icon={ClipboardList} title={t('recentMarks')}>
        {d.results.length ? (
          <ul className="space-y-2 text-sm">
            {d.results.slice(0, 6).map((r) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span>
                  {tr(subjectById[r.subject]?.name)} · {tr(r.name)}
                </span>
                <span className="font-semibold text-ink">
                  {r.score}/{r.max}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>
      <Section icon={Award} title={t('awardsT')}>
        {d.awards.length ? (
          <ul className="space-y-2 text-sm">
            {d.awards.slice(0, 5).map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span>{tr(a.title)}</span>
                <span className="text-muted">{tr(dateLabel(a.date, { month: 'short', year: 'numeric' }))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>
      <Section icon={Megaphone} title={t('announcements')}>
        {d.announcements.length ? (
          <ul className="space-y-3 text-sm">
            {d.announcements.slice(0, 4).map((a) => (
              <li key={a.id}>
                <p className="font-medium text-ink">{tr(a.title)}</p>
                <p className="text-muted">{tr(a.body)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>
    </div>
  )
}

// Parent home: only children with a verified, active link to this account.
export default function Family() {
  const { t, tr, user, workspace } = useApp()
  const state = useApi('/family/children')
  const [selected, setSelected] = useState(null)
  const children = state.data?.children
  useEffect(() => {
    if (children?.length && !children.some((c) => c.id === selected)) setSelected(children[0].id)
  }, [children, selected])
  if (!children) return <Loading state={state} />
  const child = children.find((c) => c.id === selected)
  return (
    <div>
      <PageHeader title={`${t('namaskara')}, ${tr(user.firstName)}`} subtitle={workspace?.school ? tr(workspace.school.name) : ''} />
      {!children.length ? (
        <Card className="p-6 text-sm text-muted">{t('noChildren')}</Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3" role="tablist" aria-label={t('yourChildren')}>
            {children.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === selected}
                onClick={() => setSelected(c.id)}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left ${c.id === selected ? 'border-brand-200 bg-brand-50' : 'border-slate-100 bg-white'}`}
              >
                <Avatar className="h-10 w-10" user={{ name: c.name }} />
                <span>
                  <span className="block font-semibold text-ink">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {c.section ? tr(c.section) : '—'} · {t(`rel_${c.relationship}`)}
                  </span>
                </span>
                {c.canPickup && (
                  <span title={t('pickupApproved')} className="ml-2">
                    <Pill tone="green">
                      <ShieldCheck size={12} className="mr-1" /> {t('pickupApproved')}
                    </Pill>
                  </span>
                )}
              </button>
            ))}
          </div>
          {child && <ChildView key={child.id} child={child} />}
        </>
      )}
    </div>
  )
}
