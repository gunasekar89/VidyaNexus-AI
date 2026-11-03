import { useState } from 'react'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Modal, PageHeader } from '../../components/ui'
import { ActButton, Button, DataTable, Money, Note, Panel, Stat, StatusPill, Tabs, fieldClass, toPaise, useDate, useDialog, useTab } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'

function Summary({ perms }) {
  const { t } = useApp()
  const state = useApi('/accounts/summary')
  const [dialog, open] = useDialog()
  const s = state.data
  if (!s) return <Loading state={state} />
  const lock = () =>
    open({
      title: t('lockMonth'),
      intro: t('lockNote'),
      fields: [{ key: 'month', label: t('month'), type: 'month', required: true }],
      onSubmit: (b) => api('/accounts/locks', { method: 'POST', body: b }).then(state.reload),
    })
  return (
    <div className="space-y-4">
      {dialog}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('income')} value={<Money paise={s.incomePaise} />} tone="text-emerald-600" />
        <Stat label={t('expenses')} value={<Money paise={s.expensePaise} />} />
        <Stat label={t('cashAndBank')} value={<Money paise={s.cashPaise + s.bankPaise} />} hint={<>{t('cash')}: <Money paise={s.cashPaise} /></>} />
        <Stat label={t('feesReceivable')} value={<Money paise={s.receivablePaise} />} />
        <Stat label={t('advancesHeld')} value={<Money paise={s.advancePaise} />} />
        <Stat label={t('payables')} value={<Money paise={s.payablePaise} />} />
        <Stat label={t('journals')} value={s.journals} hint={s.pendingDrafts ? `${s.pendingDrafts} ${t('awaitingApproval')}` : ''} />
        <Stat label={t('booksBalance')} value={s.balanced ? t('yes') : t('no')} tone={s.balanced ? 'text-emerald-600' : 'text-rose-600'} />
      </div>
      <Panel
        title={t('periodLocks')}
        action={
          perms.has('accounts.post') && (
            <Button small onClick={lock}>
              <Lock size={14} /> {t('lockMonth')}
            </Button>
          )
        }
      >
        <ul className="divide-y divide-slate-50 text-sm">
          {s.locks.map((m) => (
            <li key={m} className="flex items-center justify-between px-5 py-2.5">
              <span>{m}</span>
              {perms.has('accounts.approve') && (
                <ActButton path={`/accounts/locks/${m}`} method="DELETE" reload={state.reload} tone="danger" confirm="confirmUnlock">
                  {t('unlock')}
                </ActButton>
              )}
            </li>
          ))}
          {!s.locks.length && <li className="px-5 py-3 text-muted">{t('noLocks')}</li>}
        </ul>
      </Panel>
      <p className="text-xs text-muted">{t('accountsNote')}</p>
    </div>
  )
}

function TrialBalance() {
  const { t, tr } = useApp()
  const state = useApi('/accounts/trial-balance')
  const d = state.data
  if (!d) return <Loading state={state} />
  return (
    <Panel title={`${t('trialBalance')} · ${d.to}`} action={<StatusPill status={d.balanced ? 'ok' : 'failed'} label={d.balanced ? t('balanced') : t('notBalanced')} />}>
      <DataTable
        rowKey="code"
        rows={[...d.lines, { code: 'total', name: { en: t('total'), kn: t('total') }, debitPaise: d.totals.debitPaise, creditPaise: d.totals.creditPaise, total: true }]}
        columns={[
          { key: 'code', label: t('code'), render: (r) => (r.total ? '' : r.code) },
          { key: 'name', label: t('account'), render: (r) => <span className={r.total ? 'font-bold' : ''}>{tr(r.name)}</span> },
          { key: 'dr', label: t('debit'), align: 'right', render: (r) => (r.debitPaise ? <Money paise={r.debitPaise} decimals className={r.total ? 'font-bold' : ''} /> : '') },
          { key: 'cr', label: t('credit'), align: 'right', render: (r) => (r.creditPaise ? <Money paise={r.creditPaise} decimals className={r.total ? 'font-bold' : ''} /> : '') },
        ]}
      />
    </Panel>
  )
}

function Journals({ perms }) {
  const { t, tr } = useApp()
  const fmt = useDate()
  const [account, setAccount] = useState('')
  const chart = useApi('/accounts/chart')
  const state = useApi(`/accounts/journals${account ? `?account=${account}` : ''}`)
  const [dialog, open] = useDialog()
  const [openId, setOpenId] = useState(null)
  const j = state.data?.journals.find((x) => x.id === openId)
  return (
    <Panel
      title={t('journals')}
      action={
        <select value={account} onChange={(e) => setAccount(e.target.value)} className={`${fieldClass} w-auto`}>
          <option value="">{t('allAccounts')}</option>
          {(chart.data?.accounts ?? []).map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} · {tr(a.name)}
            </option>
          ))}
        </select>
      }
    >
      {dialog}
      {!state.data ? (
        <Loading state={state} />
      ) : (
        <DataTable
          rows={state.data.journals}
          onRowClick={(r) => setOpenId(r.id)}
          columns={[
            { key: 'number', label: t('number'), render: (r) => <span className="font-medium">{r.number}</span> },
            { key: 'date', label: t('date'), render: (r) => fmt(r.date) },
            { key: 'narration', label: t('narration'), render: (r) => r.narration },
            { key: 'source', label: t('source'), render: (r) => t(`js_${r.source}`), hideOnPhone: true },
            { key: 'amount', label: t('amount'), align: 'right', render: (r) => <Money paise={r.lines.reduce((a, l) => a + l.debitPaise, 0)} decimals /> },
          ]}
        />
      )}
      {j && (
        <Modal open onClose={() => setOpenId(null)} title={j.number} wide>
          <p className="mb-1 text-sm text-ink">{j.narration}</p>
          <p className="mb-3 text-xs text-muted">
            {fmt(j.date)} · {t(`js_${j.source}`)} · {t('preparedBy')}: {j.preparedBy || t('system')}
            {j.approvedBy ? ` · ${t('approvedBy')}: ${j.approvedBy}` : ''}
          </p>
          <DataTable
            rowKey="code"
            rows={j.lines.map((l, i) => ({ ...l, code: `${l.code}-${i}`, acct: l.code }))}
            columns={[
              { key: 'acct', label: t('account'), render: (r) => `${r.acct} · ${tr(r.name)}` },
              { key: 'dr', label: t('debit'), align: 'right', render: (r) => (r.debitPaise ? <Money paise={r.debitPaise} decimals /> : '') },
              { key: 'cr', label: t('credit'), align: 'right', render: (r) => (r.creditPaise ? <Money paise={r.creditPaise} decimals /> : '') },
            ]}
          />
          {j.reversed && <p className="mt-3 text-sm text-muted">{t('alreadyReversed')}</p>}
          {perms.has('accounts.post') && !j.reversed && j.source !== 'reversal' && (
            <div className="mt-4 flex justify-end">
              <Button
                tone="danger"
                onClick={() =>
                  open({
                    title: `${t('reverse')} ${j.number}`,
                    intro: t('reverseNote'),
                    fields: [{ key: 'reason', label: t('reason'), type: 'textarea', required: true }],
                    onSubmit: (b) =>
                      api(`/accounts/journals/${j.id}/reverse`, { method: 'POST', body: b }).then(() => {
                        setOpenId(null)
                        return state.reload()
                      }),
                  })
                }
              >
                {t('requestReversal')}
              </Button>
            </div>
          )}
        </Modal>
      )}
    </Panel>
  )
}

function LinesEditor({ accounts, lines, setLines }) {
  const { t, tr } = useApp()
  const set = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
  const dr = lines.reduce((a, l) => a + (toPaise(l.debit) || 0), 0)
  const cr = lines.reduce((a, l) => a + (toPaise(l.credit) || 0), 0)
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_5.5rem_5.5rem_auto] gap-2">
          <select value={l.account} onChange={(e) => set(i, 'account', e.target.value)} className={fieldClass} required>
            <option value="">{t('account')}</option>
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} · {tr(a.name)}
              </option>
            ))}
          </select>
          <input value={l.debit} onChange={(e) => set(i, 'debit', e.target.value)} placeholder={t('debit')} inputMode="decimal" className={fieldClass} />
          <input value={l.credit} onChange={(e) => set(i, 'credit', e.target.value)} placeholder={t('credit')} inputMode="decimal" className={fieldClass} />
          <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="px-1 text-slate-400 hover:text-rose-500" aria-label={t('remove')}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between text-xs">
        <button type="button" onClick={() => setLines([...lines, { account: '', debit: '', credit: '' }])} className="font-semibold text-brand-600">
          + {t('addLine')}
        </button>
        <span className={dr === cr && dr > 0 ? 'text-emerald-600' : 'text-rose-600'}>
          {t('debit')} <Money paise={dr} decimals /> · {t('credit')} <Money paise={cr} decimals />
        </span>
      </div>
    </div>
  )
}

function Drafts() {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi('/accounts/drafts')
  const [dialog, open] = useDialog()
  const d = state.data
  if (!d) return <Loading state={state} />
  const newDraft = () => {
    let lines = [
      { account: '', debit: '', credit: '' },
      { account: '', debit: '', credit: '' },
    ]
    open({
      title: t('newJournal'),
      intro: t('makerChecker'),
      wide: true,
      initial: { lines },
      fields: [
        { key: 'date', label: t('date'), type: 'date' },
        { key: 'narration', label: t('narration'), required: true },
        {
          key: 'lines',
          label: t('lines'),
          type: 'custom',
          wide: true,
          render: (form, set) => (
            <LinesEditor
              accounts={d.accounts}
              lines={form.lines}
              setLines={(v) => {
                lines = v
                set('lines', v)
              }}
            />
          ),
        },
      ],
      onSubmit: (b, form) =>
        api('/accounts/drafts', {
          method: 'POST',
          body: {
            date: b.date || undefined,
            narration: b.narration,
            lines: form.lines.map((l) => ({ account: l.account, debitPaise: toPaise(l.debit) || 0, creditPaise: toPaise(l.credit) || 0 })),
          },
        }).then(state.reload),
    })
  }
  return (
    <Panel
      title={t('manualJournals')}
      action={
        d.canPost && (
          <Button small onClick={newDraft}>
            <Plus size={14} /> {t('newJournal')}
          </Button>
        )
      }
    >
      {dialog}
      <DataTable
        rows={d.drafts}
        columns={[
          { key: 'date', label: t('date'), render: (r) => fmt(r.date) },
          { key: 'narration', label: t('narration'), render: (r) => <span className="font-medium">{r.narration}</span> },
          { key: 'amount', label: t('amount'), align: 'right', render: (r) => <Money paise={r.lines.reduce((a, l) => a + (l.debit ?? 0), 0)} decimals /> },
          { key: 'by', label: t('preparedBy'), render: (r) => r.preparedBy },
          {
            key: 'status',
            label: t('status'),
            render: (r) =>
              r.status === 'pending' && d.canApprove && !r.mine ? (
                <div className="flex justify-end gap-1">
                  <ActButton path={`/accounts/drafts/${r.id}/decide`} body={{ approve: true, version: r.version }} reload={state.reload} tone="success" okKey="approved">
                    {t('approvePost')}
                  </ActButton>
                  <ActButton path={`/accounts/drafts/${r.id}/decide`} body={{ approve: false, version: r.version }} reload={state.reload} tone="danger" okKey="rejected">
                    {t('reject')}
                  </ActButton>
                </div>
              ) : (
                <StatusPill status={r.status} label={r.status === 'pending' && r.mine ? t('waitingForOther') : undefined} />
              ),
          },
        ]}
      />
    </Panel>
  )
}

function Chart() {
  const { t, tr } = useApp()
  const state = useApi('/accounts/chart')
  if (!state.data) return <Loading state={state} />
  return (
    <Panel title={t('chartOfAccounts')}>
      <DataTable
        rowKey="code"
        rows={state.data.accounts}
        columns={[
          { key: 'code', label: t('code') },
          { key: 'name', label: t('account'), render: (r) => tr(r.name) },
          { key: 'type', label: t('type'), render: (r) => t(`at_${r.type}`) },
          { key: 'bal', label: t('balance'), align: 'right', render: (r) => <Money paise={r.balancePaise} decimals /> },
        ]}
      />
    </Panel>
  )
}

export default function Accounts() {
  const { t, workspace } = useApp()
  const perms = new Set(workspace?.permissions ?? [])
  const [tab, setTab] = useTab('summary')
  const Body = { summary: Summary, trial: TrialBalance, journals: Journals, drafts: Drafts, chart: Chart }[tab] ?? Summary
  return (
    <div>
      <PageHeader title={t('accountsTitle')} subtitle={t('accountsSubtitle')} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'summary', label: t('overview') },
          { key: 'trial', label: t('trialBalance') },
          { key: 'journals', label: t('journals') },
          { key: 'drafts', label: t('manualJournals') },
          { key: 'chart', label: t('chartOfAccounts') },
        ]}
      />
      <Body perms={perms} />
      <div className="mt-4">
        <Note tone="blue">{t('notAccountingAdvice')}</Note>
      </div>
    </div>
  )
}
