import { useState } from 'react'
import { BookOpen, Plus, Search } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Card, PageHeader } from '../../components/ui'
import { Button, DataTable, Money, money, Note, Panel, Stat, StatusPill, Tabs, fieldClass, useAction, useDate, useDialog, useTab } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'

function loanStatus(l) {
  if (l.returnedOn) return l.fineStatus === 'due' ? 'due' : 'closed'
  return l.overdueDays > 0 ? 'overdue' : 'on_loan'
}

export default function Library() {
  const { t, showToast, lang } = useApp()
  const fmt = useDate()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const state = useApi(`/library${search ? `?q=${encodeURIComponent(search)}` : ''}`)
  const [tab, setTab] = useTab('desk')
  const [dialog, open] = useDialog()
  const [run, busy] = useAction(state.reload)
  const [desk, setDesk] = useState({ accessionNo: '', borrower: '' })
  const [back, setBack] = useState('')
  const d = state.data
  if (!d) return <Loading state={state} />
  const s = d.settings
  const issue = async (e) => {
    e.preventDefault()
    const out = await run(() => api('/library/issue', { method: 'POST', body: desk }), null)
    if (out) {
      showToast(`${t('issuedDue')} ${fmt(out.dueOn)}`)
      setDesk({ accessionNo: '', borrower: '' })
    }
  }
  const giveBack = async (e) => {
    e.preventDefault()
    const out = await run(() => api('/library/return', { method: 'POST', body: { accessionNo: back } }), null)
    if (out) {
      showToast(out.finePaise ? `${t('returnedLate')} ${out.lateDays} · ${money(out.finePaise, lang)}` : t('returnedOk'))
      setBack('')
    }
  }
  const fine = (l, action) =>
    open({
      title: `${l.title} · ${l.borrower}`,
      intro: (
        <span>
          {t('fineDue')}: <Money paise={l.finePaise} className="font-semibold text-ink" /> ({l.overdueDays || '—'} {t('daysLate')})
        </span>
      ),
      fields: action === 'waived' ? [{ key: 'reason', label: t('reasonToWaive'), required: true }] : [],
      submitLabel: action === 'paid' ? t('collectFine') : t('waiveFine'),
      onSubmit: (b) => api(`/library/loans/${l.id}/fine`, { method: 'POST', body: { action, reason: b.reason } }).then(state.reload),
    })
  const addBook = () =>
    open({
      title: t('addBook'),
      wide: true,
      initial: { language: 'en', copies: '1' },
      fields: [
        { key: 'title', label: t('bookTitle'), required: true, wide: true },
        { key: 'author', label: t('author') },
        { key: 'isbn', label: 'ISBN' },
        { key: 'language', label: t('language'), type: 'select', required: true, options: ['en', 'kn', 'hi', 'other'].map((x) => ({ value: x, label: t(`bl_${x}`) })) },
        { key: 'subject', label: t('subject') },
        { key: 'copies', label: t('copies'), type: 'number', min: 1, max: 50, required: true },
      ],
      onSubmit: (b) =>
        api('/library/books', { method: 'POST', body: b }).then((out) => {
          showToast(`${t('accessionNos')}: ${out.accessionNos.join(', ')}`)
          return state.reload()
        }),
    })
  return (
    <div>
      {dialog}
      <PageHeader
        title={t('libraryTitle')}
        subtitle={t('librarySub')}
        action={
          <Button onClick={addBook}>
            <Plus size={16} /> {t('addBook')}
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label={t('titles')} value={d.stats.titles} />
        <Stat label={t('onLoan')} value={d.stats.onLoan} />
        <Stat label={t('overdue')} value={d.stats.overdue} tone={d.stats.overdue ? 'text-rose-600' : 'text-ink'} />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'desk', label: t('issueReturn') },
          { key: 'loans', label: t('loansFines'), count: d.loans.filter((l) => l.overdueDays > 0 || l.fineStatus === 'due').length },
          { key: 'catalogue', label: t('catalogue') },
        ]}
      />
      {tab === 'desk' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-1 font-semibold text-ink">{t('issueBook')}</h2>
            <p className="mb-4 text-xs text-muted">{t('issueRules').replace('{s}', s.studentLimit).replace('{f}', s.staffLimit).replace('{d}', s.loanDays)}</p>
            <form onSubmit={issue} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t('accessionNo')}</span>
                <input value={desk.accessionNo} onChange={(e) => setDesk({ ...desk, accessionNo: e.target.value })} required placeholder="ACC-00001" className={fieldClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t('borrower')}</span>
                <input value={desk.borrower} onChange={(e) => setDesk({ ...desk, borrower: e.target.value })} required placeholder={t('borrowerHint')} className={fieldClass} />
              </label>
              <Button type="submit" busy={busy} className="w-full">
                {t('issue')}
              </Button>
            </form>
          </Card>
          <Card className="p-5">
            <h2 className="mb-1 font-semibold text-ink">{t('returnBook')}</h2>
            <p className="mb-4 text-xs text-muted">{t('fineRule').replace('{p}', s.finePerDayPaise / 100).replace('{m}', s.maxFinePaise / 100)}</p>
            <form onSubmit={giveBack} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t('accessionNo')}</span>
                <input value={back} onChange={(e) => setBack(e.target.value)} required placeholder="ACC-00001" className={fieldClass} />
              </label>
              <Button type="submit" tone="success" busy={busy} className="w-full">
                {t('markReturned')}
              </Button>
            </form>
          </Card>
        </div>
      )}
      {tab === 'loans' && (
        <Panel title={t('loansFines')}>
          <DataTable
            rows={d.loans}
            columns={[
              { key: 'title', label: t('bookTitle'), render: (l) => <span className="font-medium">{l.title} <span className="text-xs text-muted">· {l.accessionNo}</span></span> },
              { key: 'who', label: t('borrower'), render: (l) => l.borrower },
              { key: 'due', label: t('dueOn'), render: (l) => fmt(l.dueOn) },
              { key: 'fine', label: t('fine'), align: 'right', render: (l) => (l.finePaise ? <Money paise={l.finePaise} /> : '—') },
              { key: 'status', label: t('status'), render: (l) => <StatusPill status={loanStatus(l)} label={l.overdueDays > 0 && !l.returnedOn ? `${t('st_overdue')} · ${l.overdueDays}d` : undefined} /> },
              {
                key: 'act',
                label: '',
                render: (l) =>
                  l.fineStatus === 'due' ? (
                    <span className="flex justify-end gap-1">
                      <Button small onClick={() => fine(l, 'paid')}>
                        {t('collectFine')}
                      </Button>
                      <Button small tone="ghost" onClick={() => fine(l, 'waived')}>
                        {t('waiveFine')}
                      </Button>
                    </span>
                  ) : !l.returnedOn ? (
                    <span className="text-xs text-muted">{t('returnAtDesk')}</span>
                  ) : null,
              },
            ]}
          />
        </Panel>
      )}
      {tab === 'catalogue' && (
        <Panel
          title={t('catalogue')}
          action={
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setSearch(q)
              }}
              className="relative"
            >
              <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchBooks')} className="h-10 w-56 rounded-xl border border-slate-200 pl-8 pr-3 text-sm" />
            </form>
          }
        >
          <DataTable
            rows={d.books}
            columns={[
              { key: 'title', label: t('bookTitle'), render: (b) => <span className="font-medium">{b.title}</span> },
              { key: 'author', label: t('author'), render: (b) => b.author || '—' },
              { key: 'lang', label: t('language'), hideOnPhone: true, render: (b) => t(`bl_${b.language}`) },
              { key: 'avail', label: t('available'), align: 'right', render: (b) => `${b.available}/${b.copies}` },
              { key: 'copies', label: t('onShelf'), hideOnPhone: true, render: (b) => <span className="text-xs text-muted">{b.availableCopies || '—'}</span> },
            ]}
          />
        </Panel>
      )}
    </div>
  )
}

// A student's own loans, or a parent's view of their children's.
export function MyLibrary() {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi('/me/library')
  const d = state.data
  if (!d) return <Loading state={state} />
  return (
    <div>
      <PageHeader title={t('libraryTitle')} subtitle={t('myLibrarySub')} />
      <Note tone="blue">{t('fineRule').replace('{p}', d.settings.finePerDayPaise / 100).replace('{m}', d.settings.maxFinePaise / 100)}</Note>
      <div className="mt-4 space-y-3">
        {!d.loans.length && (
          <Card className="flex items-center gap-3 p-6 text-sm text-muted">
            <BookOpen size={18} /> {t('noBooksOut')}
          </Card>
        )}
        {d.loans.map((l) => (
          <Card key={l.id} className="flex items-start justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-ink">{l.title}</p>
              <p className="text-xs text-muted">
                {l.author} · {l.borrower}
              </p>
              <p className="mt-1 text-xs text-muted">
                {l.returnedOn ? `${t('returnedOn')} ${fmt(l.returnedOn)}` : `${t('dueOn')} ${fmt(l.dueOn)}`}
              </p>
            </div>
            <div className="text-right">
              <StatusPill status={loanStatus(l)} />
              {l.finePaise > 0 && (
                <p className="mt-1 text-xs text-rose-600">
                  {t('fine')}: <Money paise={l.finePaise} />
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
