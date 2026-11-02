import { useState } from 'react'
import { BadgeCheck, Eye, EyeOff, Info, Megaphone, Wallet } from 'lucide-react'
import { useApp } from '../AppContext'
import { Card, PageHeader } from '../components/ui'
import { dateLabel, relativeTime } from '../lib/dates'
import { Loading, rupees, useApi } from './admin/Admin'

// Simple, phone-friendly self-service for non-teaching employees (and teachers).
export default function StaffHome() {
  const { t, tr, lang, user, workspace } = useApp()
  const state = useApi('/staff/me')
  const [showPay, setShowPay] = useState(false)
  const d = state.data
  if (!d) return <Loading state={state} />
  const e = d.employee
  return (
    <div className="max-w-3xl">
      <PageHeader title={`${t('myWork')} · ${tr(user.firstName)}`} subtitle={workspace?.school ? `${tr(workspace.roleLabel)} · ${tr(workspace.school.name)}` : ''} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
            <BadgeCheck size={18} className="text-brand-600" /> {t('myDetails')}
          </h2>
          {e ? (
            <dl className="space-y-2 text-sm">
              {[
                [t('employeeNo'), e.employeeNo],
                [t('designation'), tr(e.designation)],
                [t('department'), e.department ? tr(e.department) : '—'],
                [t('joinedOn'), e.joinedOn ? tr(dateLabel(e.joinedOn, { day: 'numeric', month: 'short', year: 'numeric' })) : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted">{t('nothingYet')}</p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 flex items-center justify-between gap-2 font-semibold text-ink">
            <span className="flex items-center gap-2">
              <Wallet size={18} className="text-brand-600" /> {t('myPay')}
            </span>
            {d.pay && (
              <button onClick={() => setShowPay((s) => !s)} className="flex items-center gap-1 text-xs font-medium text-brand-600" aria-pressed={showPay}>
                {showPay ? <EyeOff size={14} /> : <Eye size={14} />} {showPay ? t('hide') : t('show')}
              </button>
            )}
          </h2>
          {d.pay ? (
            <>
              <p className="text-2xl font-bold text-ink">{showPay ? rupees(d.pay.monthlyGrossPaise, lang) : '₹ ••••••'}</p>
              <p className="text-xs text-muted">
                {t('monthlyPay')} · {t('effectiveFrom')} {tr(dateLabel(d.pay.from, { day: 'numeric', month: 'short', year: 'numeric' }))}
              </p>
              <p className="mt-2 text-xs text-muted">
                {t('bankAccount')}: •••• {d.pay.bankLast4}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">{t('nothingYet')}</p>
          )}
        </Card>
      </div>
      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-muted">
        <Info size={16} className="mt-0.5 shrink-0" /> {t('selfServiceNext')}
      </p>
      <Card className="mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
          <Megaphone size={18} className="text-brand-600" /> {t('schoolNotices')}
        </h2>
        {d.announcements.length ? (
          <ul className="space-y-3 text-sm">
            {d.announcements.map((a) => (
              <li key={a.id}>
                <p className="font-medium text-ink">{tr(a.title)}</p>
                <p className="text-muted">{tr(a.body)}</p>
                <p className="text-xs text-slate-400">{tr(relativeTime(a.createdAt))}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('nothingYet')}</p>
        )}
      </Card>
    </div>
  )
}
