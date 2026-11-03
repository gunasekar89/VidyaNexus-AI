import { useState } from 'react'
import { BellRing, Plus, Search } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Modal, PageHeader } from '../../components/ui'
import { ActButton, Button, DataTable, Money, Note, Panel, Stat, StatusPill, Tabs, fieldClass, opts, useAction, useDate, useDialog, useTab } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'
import Receipt from './Receipt'

const METHODS = ['cash', 'upi', 'cheque', 'card', 'netbanking', 'bank_transfer']
const CONCESSIONS = ['sibling', 'scholarship', 'staff_child', 'merit', 'hardship', 'other']

function newKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function Ledger({ studentId, onClose, perms, reloadList }) {
  const { t, tr } = useApp()
  const fmt = useDate()
  const state = useApi(`/fees/students/${studentId}`)
  const setup = useApi('/fees/setup')
  const [dialog, open] = useDialog()
  const [receipt, setReceipt] = useState(null)
  const reload = async () => {
    await state.reload()
    await reloadList?.()
  }
  const d = state.data
  if (!d) return <Loading state={state} />
  const s = d.student
  const pay = () => {
    const key = newKey()
    open({
      title: `${t('recordPayment')} · ${s.name}`,
      intro: (
        <span>
          {t('dueNow')}: <Money paise={d.summary.duePaise} className="font-semibold text-ink" /> · {t('oldestFirst')}
        </span>
      ),
      initial: { method: 'cash', amountPaise: d.summary.duePaise ? String(d.summary.duePaise / 100) : '' },
      fields: [
        { key: 'amountPaise', label: t('amount'), type: 'money', required: true },
        { key: 'method', label: t('method'), type: 'select', required: true, options: opts(METHODS, t, 'pm_') },
        { key: 'reference', label: t('referenceNo'), hint: t('referenceHint'), show: (f) => f.method !== 'cash', required: true },
        { key: 'receivedOn', label: t('receivedOn'), type: 'date' },
      ],
      submitLabel: t('saveAndReceipt'),
      onSubmit: async (b) => {
        const out = await api('/fees/payments', { method: 'POST', body: { ...b, studentId: s.id, idempotencyKey: key } })
        await reload()
        setReceipt(out.paymentId)
      },
    })
  }
  const concession = () =>
    open({
      title: `${t('requestConcession')} · ${s.name}`,
      intro: t('concessionNote'),
      initial: { kind: 'sibling' },
      fields: [
        { key: 'kind', label: t('type'), type: 'select', required: true, options: opts(CONCESSIONS, t, 'conc_') },
        { key: 'percent', label: t('percent'), type: 'number', min: 1, max: 100, required: true },
        { key: 'headId', label: t('feeHead'), type: 'select', emptyLabel: t('allHeads'), options: (setup.data?.heads ?? []).map((h) => ({ value: h.id, label: tr(h.name) })) },
        { key: 'reason', label: t('reason'), type: 'textarea', required: true },
      ],
      onSubmit: (b) => api('/fees/concessions', { method: 'POST', body: { ...b, studentId: s.id, headId: b.headId ? Number(b.headId) : undefined } }).then(reload),
    })
  const charge = () =>
    open({
      title: `${t('addCharge')} · ${s.name}`,
      fields: [
        { key: 'headId', label: t('feeHead'), type: 'select', required: true, options: (setup.data?.heads ?? []).map((h) => ({ value: h.id, label: tr(h.name) })) },
        { key: 'description', label: t('description'), required: true },
        { key: 'amountPaise', label: t('amount'), type: 'money', required: true },
        { key: 'dueOn', label: t('dueOn'), type: 'date', required: true },
      ],
      onSubmit: (b) => api('/fees/demands', { method: 'POST', body: { ...b, studentId: s.id, headId: Number(b.headId) } }).then(reload),
    })
  const refund = (p) =>
    open({
      title: `${t('requestRefund')} · ${p.receiptNo}`,
      intro: (
        <span>
          {t('refundable')}: <Money paise={p.availablePaise} className="font-semibold text-ink" />
        </span>
      ),
      fields: [
        { key: 'amountPaise', label: t('amount'), type: 'money', required: true },
        { key: 'reason', label: t('reason'), type: 'textarea', required: true },
      ],
      onSubmit: (b) => api('/fees/refunds', { method: 'POST', body: { ...b, paymentId: p.id } }).then(reload),
    })
  const cancelDemand = (dm) =>
    open({
      title: `${t('cancelCharge')} · ${dm.description}`,
      intro: t('cancelChargeNote'),
      fields: [{ key: 'reason', label: t('reason'), type: 'textarea', required: true }],
      onSubmit: (b) => api(`/fees/demands/${dm.id}/cancel`, { method: 'POST', body: b }).then(reload),
    })
  const bounce = (p) =>
    open({
      title: `${t('chequeBounced')} · ${p.receiptNo}`,
      fields: [{ key: 'reason', label: t('reason'), required: true }],
      onSubmit: (b) => api(`/fees/payments/${p.id}/bounce`, { method: 'POST', body: b }).then(reload),
    })
  return (
    <Modal open onClose={onClose} title={`${s.name} · ${s.admissionNo}`} wide>
      {dialog}
      {receipt && <Receipt path={`/fees/receipts/${receipt}`} onClose={() => setReceipt(null)} />}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('billed')} value={<Money paise={d.summary.billedPaise} />} />
        <Stat label={t('paid')} value={<Money paise={d.summary.paidPaise} />} tone="text-emerald-600" />
        <Stat label={t('dueNow')} value={<Money paise={d.summary.duePaise} />} />
        <Stat label={t('overdue')} value={<Money paise={d.summary.overduePaise} />} tone={d.summary.overduePaise ? 'text-rose-600' : 'text-ink'} />
      </div>
      {d.creditPaise > 0 && (
        <Note tone="blue">
          {t('creditBalance')}: <Money paise={d.creditPaise} className="font-semibold" />
        </Note>
      )}
      <div className="my-4 flex flex-wrap gap-2">
        {perms.has('fees.collect') && <Button onClick={pay}>{t('recordPayment')}</Button>}
        {perms.has('fees.configure') && (
          <>
            <Button tone="ghost" onClick={concession}>
              {t('requestConcession')}
            </Button>
            <Button tone="ghost" onClick={charge}>
              {t('addCharge')}
            </Button>
          </>
        )}
      </div>
      <h3 className="mb-1 text-sm font-semibold text-ink">{t('charges')}</h3>
      <DataTable
        rows={d.demands}
        columns={[
          { key: 'head', label: t('feeHead'), render: (r) => `${tr(r.head)} · ${r.description}` },
          { key: 'due', label: t('dueOn'), render: (r) => fmt(r.dueOn) },
          { key: 'amount', label: t('amount'), align: 'right', render: (r) => <Money paise={r.amountPaise - r.concessionPaise} /> },
          { key: 'balance', label: t('balance'), align: 'right', render: (r) => <Money paise={Math.max(r.balancePaise, 0)} className={r.overdue ? 'text-rose-600' : ''} /> },
          { key: 'status', label: t('status'), render: (r) => <StatusPill status={r.overdue ? 'overdue' : r.status} /> },
          {
            key: 'act',
            label: '',
            render: (r) =>
              perms.has('fees.approve') && r.status !== 'cancelled' ? (
                <Button small tone="danger" onClick={() => cancelDemand(r)}>
                  {t('cancel')}
                </Button>
              ) : null,
          },
        ]}
      />
      <h3 className="mb-1 mt-5 text-sm font-semibold text-ink">{t('payments')}</h3>
      <DataTable
        rows={d.payments}
        columns={[
          { key: 'receipt', label: t('receiptNo'), render: (r) => <button className="font-medium text-brand-600 hover:underline" onClick={() => setReceipt(r.id)}>{r.receiptNo}</button> },
          { key: 'date', label: t('date'), render: (r) => fmt(r.receivedOn) },
          { key: 'method', label: t('method'), render: (r) => t(`pm_${r.method}`) },
          { key: 'amount', label: t('amount'), align: 'right', render: (r) => <Money paise={r.amountPaise} /> },
          { key: 'status', label: t('status'), render: (r) => <StatusPill status={r.status} /> },
          {
            key: 'act',
            label: '',
            render: (r) => (
              <div className="flex flex-wrap justify-end gap-1">
                {perms.has('fees.collect') && r.availablePaise > 0 && (
                  <Button small tone="ghost" onClick={() => refund(r)}>
                    {t('refund')}
                  </Button>
                )}
                {perms.has('fees.collect') && r.method === 'cheque' && r.status === 'captured' && !r.reconciled && (
                  <Button small tone="danger" onClick={() => bounce(r)}>
                    {t('bounced')}
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
      {(d.concessions.length > 0 || d.refunds.length > 0) && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-ink">{t('concessions')}</h3>
            <ul className="space-y-1 text-sm">
              {d.concessions.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>
                    {t(`conc_${c.kind}`)} {c.percent}% {c.head ? `· ${tr(c.head)}` : ''}
                  </span>
                  <StatusPill status={c.status} />
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-ink">{t('refunds')}</h3>
            <ul className="space-y-1 text-sm">
              {d.refunds.map((f) => (
                <li key={f.id} className="flex justify-between gap-2">
                  <span>
                    <Money paise={f.amountPaise} /> · {f.receiptNo}
                  </span>
                  <StatusPill status={f.status} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Overview({ perms, go }) {
  const { t } = useApp()
  const state = useApi('/fees/overview')
  const o = state.data
  if (!o) return <Loading state={state} />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('billedYear')} value={<Money paise={o.billedPaise} />} />
        <Stat label={t('collected')} value={<Money paise={o.collectedPaise} />} tone="text-emerald-600" />
        <Stat label={t('outstanding')} value={<Money paise={o.duePaise} />} />
        <Stat label={t('overdue')} value={<Money paise={o.overduePaise} />} tone="text-rose-600" hint={`${o.overdueStudents} ${t('studentsLower')}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('collectedToday')}>
          <div className="p-5">
            <p className="text-2xl font-bold text-ink">
              <Money paise={o.today.totalPaise} />
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {o.today.byMethod.map((m) => (
                <li key={m.method} className="flex justify-between">
                  <span className="text-muted">
                    {t(`pm_${m.method}`)} ({m.count})
                  </span>
                  <Money paise={m.amountPaise} />
                </li>
              ))}
              {!o.today.byMethod.length && <li className="text-muted">{t('nothingYet')}</li>}
            </ul>
          </div>
        </Panel>
        <Panel title={t('needsAttention')}>
          <ul className="divide-y divide-slate-50 text-sm">
            {[
              [t('concessions'), o.pending.concessions, 'approvals'],
              [t('refunds'), o.pending.refunds, 'approvals'],
              [t('gatewayExceptions'), o.pending.exceptions, 'exceptions'],
              [t('toReconcile'), o.pending.unreconciled, 'payments'],
            ].map(([label, n, tab]) => (
              <li key={label}>
                <button onClick={() => go(tab)} className="flex w-full justify-between px-5 py-3 text-left hover:bg-slate-50">
                  <span>{label}</span>
                  <span className={`font-semibold ${n ? 'text-rose-600' : 'text-muted'}`}>{n}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-5 pb-4 text-xs text-muted">{o.gateway === 'sandbox' ? t('gatewaySandbox') : t('gatewayLive')}</p>
        </Panel>
      </div>
      {perms.has('fees.collect') && <p className="text-xs text-muted">{t('feesHowTo')}</p>}
    </div>
  )
}

function Students({ perms }) {
  const { t, tr } = useApp()
  const [q, setQ] = useState('')
  const state = useApi(`/fees/students?q=${encodeURIComponent(q)}`)
  const [open, setOpen] = useState(null)
  return (
    <Panel
      title={t('studentAccounts')}
      action={
        <div className="relative w-full sm:w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchStudent')} className={`${fieldClass} pl-9`} />
        </div>
      }
    >
      {!state.data ? (
        <Loading state={state} />
      ) : (
        <DataTable
          rows={state.data.students}
          onRowClick={(r) => setOpen(r.id)}
          columns={[
            { key: 'name', label: t('student'), render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'section', label: t('section'), render: (r) => `${tr(r.section)} · ${r.admissionNo}` },
            { key: 'billed', label: t('billed'), align: 'right', render: (r) => <Money paise={r.billedPaise} />, hideOnPhone: true },
            { key: 'paid', label: t('paid'), align: 'right', render: (r) => <Money paise={r.paidPaise} /> },
            { key: 'due', label: t('dueNow'), align: 'right', render: (r) => <Money paise={r.duePaise} /> },
            { key: 'overdue', label: t('overdue'), align: 'right', render: (r) => (r.overduePaise ? <Money paise={r.overduePaise} className="font-semibold text-rose-600" /> : '—') },
          ]}
        />
      )}
      {open && <Ledger studentId={open} perms={perms} onClose={() => setOpen(null)} reloadList={state.reload} />}
    </Panel>
  )
}

function Payments({ perms }) {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi('/fees/payments')
  const [receipt, setReceipt] = useState(null)
  if (!state.data) return <Loading state={state} />
  return (
    <Panel title={t('recentPayments')}>
      {receipt && <Receipt path={`/fees/receipts/${receipt}`} onClose={() => setReceipt(null)} />}
      <DataTable
        rows={state.data.payments}
        columns={[
          { key: 'receipt', label: t('receiptNo'), render: (r) => <button className="font-medium text-brand-600 hover:underline" onClick={() => setReceipt(r.id)}>{r.receiptNo ?? '—'}</button> },
          { key: 'student', label: t('student'), render: (r) => r.student },
          { key: 'date', label: t('date'), render: (r) => fmt(r.receivedOn) },
          { key: 'method', label: t('method'), render: (r) => `${t(`pm_${r.method}`)}${r.reference ? ` · ${r.reference}` : ''}` },
          { key: 'amount', label: t('amount'), align: 'right', render: (r) => <Money paise={r.amountPaise} /> },
          { key: 'status', label: t('status'), render: (r) => <StatusPill status={r.status} /> },
          {
            key: 'bank',
            label: t('bank'),
            render: (r) =>
              r.status !== 'captured' ? null : r.reconciled ? (
                <StatusPill status="verified" label={t('reconciled')} />
              ) : r.method === 'cash' ? (
                <span className="text-xs text-muted">{t('cashInHand')}</span>
              ) : perms.has('accounts.post') && (r.method !== 'gateway' || r.settlement === 'settled') ? (
                <ActButton path={`/fees/payments/${r.id}/reconcile`} reload={state.reload}>
                  {t('markReconciled')}
                </ActButton>
              ) : (
                <span className="text-xs text-muted">{r.method === 'gateway' ? t(`settle_${r.settlement}`) : t('notReconciled')}</span>
              ),
          },
        ]}
      />
    </Panel>
  )
}

function Dues({ perms }) {
  const { t, tr } = useApp()
  const fmt = useDate()
  const state = useApi('/fees/dues')
  const [run, busy] = useAction(state.reload)
  if (!state.data) return <Loading state={state} />
  return (
    <Panel
      title={t('overdueAccounts')}
      action={
        perms.has('fees.collect') && (
          <Button busy={busy} onClick={() => run(() => api('/fees/reminders', { method: 'POST' }), 'remindersSent')}>
            <BellRing size={16} /> {t('sendReminders')}
          </Button>
        )
      }
    >
      <DataTable
        rows={state.data.students}
        empty={t('noOverdue')}
        columns={[
          { key: 'name', label: t('student'), render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'section', label: t('section'), render: (r) => tr(r.section) },
          { key: 'since', label: t('oldestDue'), render: (r) => fmt(r.oldestDue) },
          { key: 'd30', label: '0–30', align: 'right', render: (r) => <Money paise={r.buckets.d30} /> },
          { key: 'd60', label: '31–60', align: 'right', render: (r) => <Money paise={r.buckets.d60} /> },
          { key: 'd90', label: '61–90', align: 'right', render: (r) => <Money paise={r.buckets.d90} /> },
          { key: 'd90plus', label: '90+', align: 'right', render: (r) => <Money paise={r.buckets.d90plus} /> },
          { key: 'total', label: t('overdue'), align: 'right', render: (r) => <Money paise={r.overduePaise} className="font-semibold text-rose-600" /> },
        ]}
      />
    </Panel>
  )
}

function Approvals({ perms }) {
  const { t, tr } = useApp()
  const state = useApi('/fees/approvals')
  const [dialog, open] = useDialog()
  const d = state.data
  if (!d) return <Loading state={state} />
  const decide = (kind, r, approve) => (
    <ActButton path={`/fees/${kind}/${r.id}/decide`} body={{ approve }} reload={state.reload} tone={approve ? 'success' : 'danger'} okKey={approve ? 'approved' : 'rejected'}>
      {approve ? t('approve') : t('reject')}
    </ActButton>
  )
  const canDecide = (r) => d.canApprove && !r.mine
  const payRefund = (r) =>
    open({
      title: `${t('payRefund')} · ${r.student}`,
      fields: [{ key: 'reference', label: t('paymentReference'), required: true, hint: t('refundRefHint') }],
      onSubmit: (b) => api(`/fees/refunds/${r.id}/pay`, { method: 'POST', body: b }).then(state.reload),
    })
  return (
    <div className="space-y-4">
      {dialog}
      <Note tone="blue">{t('feeMakerChecker')}</Note>
      <Panel title={t('concessions')}>
        <DataTable
          rows={d.concessions}
          columns={[
            { key: 'student', label: t('student'), render: (r) => <span className="font-medium">{r.student}</span> },
            { key: 'what', label: t('concession'), render: (r) => `${t(`conc_${r.kind}`)} · ${r.percent}% ${r.head ? `· ${tr(r.head)}` : ''}` },
            { key: 'reason', label: t('reason'), render: (r) => <span className="text-muted">{r.reason}</span> },
            { key: 'by', label: t('requestedBy'), render: (r) => r.requestedBy, hideOnPhone: true },
            {
              key: 'act',
              label: t('status'),
              render: (r) =>
                r.status === 'pending' && canDecide(r) ? (
                  <div className="flex justify-end gap-1">
                    {decide('concessions', r, true)}
                    {decide('concessions', r, false)}
                  </div>
                ) : (
                  <StatusPill status={r.status} label={r.status === 'pending' && r.mine ? t('waitingForOther') : undefined} />
                ),
            },
          ]}
        />
      </Panel>
      <Panel title={t('refunds')}>
        <DataTable
          rows={d.refunds}
          columns={[
            { key: 'student', label: t('student'), render: (r) => <span className="font-medium">{r.student}</span> },
            { key: 'amount', label: t('amount'), render: (r) => <Money paise={r.amountPaise} /> },
            { key: 'receipt', label: t('receiptNo'), render: (r) => r.receiptNo },
            { key: 'reason', label: t('reason'), render: (r) => <span className="text-muted">{r.reason}</span> },
            {
              key: 'act',
              label: t('status'),
              render: (r) =>
                r.status === 'requested' && canDecide(r) ? (
                  <div className="flex justify-end gap-1">
                    {decide('refunds', r, true)}
                    {decide('refunds', r, false)}
                  </div>
                ) : r.status === 'approved' && perms.has('fees.collect') ? (
                  <Button small onClick={() => payRefund(r)}>
                    {t('payRefund')}
                  </Button>
                ) : (
                  <StatusPill status={r.status} label={r.status === 'requested' && r.mine ? t('waitingForOther') : undefined} />
                ),
            },
          ]}
        />
      </Panel>
    </div>
  )
}

function Setup({ perms }) {
  const { t, tr } = useApp()
  const fmt = useDate()
  const state = useApi('/fees/setup')
  const [dialog, open] = useDialog()
  const [grade, setGrade] = useState(7)
  const [run, busy] = useAction(state.reload)
  const d = state.data
  if (!d) return <Loading state={state} />
  const can = perms.has('fees.configure')
  const plan = d.plan.filter((p) => p.gradeLevel === Number(grade))
  const addHead = () =>
    open({
      title: t('addFeeHead'),
      initial: { kind: 'other' },
      fields: [
        { key: 'code', label: t('code'), required: true, placeholder: 'LAB' },
        { key: 'nameEn', label: t('nameEnglish'), required: true },
        { key: 'nameKn', label: t('nameKannada'), required: true },
        { key: 'kind', label: t('type'), type: 'select', required: true, options: opts(d.headKinds, t, 'hk_') },
        { key: 'refundable', label: t('refundableHead'), type: 'checkbox' },
      ],
      onSubmit: (b) => api('/fees/heads', { method: 'POST', body: b }).then(state.reload),
    })
  const addItem = () =>
    open({
      title: `${t('addPlanItem')} · ${t('grade')} ${grade}`,
      initial: { installmentNo: 1 },
      fields: [
        { key: 'headId', label: t('feeHead'), type: 'select', required: true, options: d.heads.map((h) => ({ value: h.id, label: tr(h.name) })) },
        { key: 'installmentNo', label: t('instalment'), type: 'number', min: 1, max: 12, required: true },
        { key: 'label', label: t('label'), placeholder: 'Term 1' },
        { key: 'dueOn', label: t('dueOn'), type: 'date', required: true },
        { key: 'amountPaise', label: t('amount'), type: 'money', required: true },
      ],
      onSubmit: (b) => api('/fees/plan', { method: 'POST', body: { ...b, headId: Number(b.headId), gradeLevel: Number(grade) } }).then(state.reload),
    })
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      {dialog}
      <Panel title={t('feeHeads')} action={can && <Button small onClick={addHead}><Plus size={14} /> {t('add')}</Button>}>
        <ul className="divide-y divide-slate-50 text-sm">
          {d.heads.map((h) => (
            <li key={h.id} className="flex justify-between gap-2 px-5 py-2.5">
              <span>
                <span className="font-medium">{tr(h.name)}</span> <span className="text-xs text-muted">· {h.code}</span>
              </span>
              <span className="text-xs text-muted">
                {t(`hk_${h.kind}`)}
                {h.refundable ? ` · ${t('refundableShort')}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel
        title={`${t('feePlan')} ${d.year}`}
        action={
          <div className="flex flex-wrap gap-2">
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className={`${fieldClass} w-auto`}>
              {d.grades.map((g) => (
                <option key={g.level} value={g.level}>
                  {tr(g.name)}
                </option>
              ))}
            </select>
            {can && (
              <>
                <Button small tone="ghost" onClick={addItem}>
                  <Plus size={14} /> {t('add')}
                </Button>
                <Button small busy={busy} onClick={() => window.confirm(t('generateConfirm')) && run(() => api('/fees/generate', { method: 'POST', body: { gradeLevel: Number(grade) } }), 'chargesRaised')}>
                  {t('raiseCharges')}
                </Button>
              </>
            )}
          </div>
        }
      >
        <DataTable
          rows={plan}
          columns={[
            { key: 'head', label: t('feeHead'), render: (r) => `${tr(r.head)} · ${r.label || r.installmentNo}` },
            { key: 'due', label: t('dueOn'), render: (r) => fmt(r.dueOn) },
            { key: 'amount', label: t('amount'), align: 'right', render: (r) => <Money paise={r.amountPaise} /> },
            {
              key: 'act',
              label: '',
              render: (r) =>
                can && (
                  <ActButton path={`/fees/plan/${r.id}`} method="DELETE" reload={state.reload} tone="danger" confirm="confirmRemove">
                    {t('remove')}
                  </ActButton>
                ),
            },
          ]}
        />
        <p className="border-t border-slate-100 px-5 py-3 text-sm">
          {t('totalForYear')}: <Money paise={plan.reduce((a, p) => a + p.amountPaise, 0)} className="font-semibold" />
        </p>
      </Panel>
    </div>
  )
}

function Exceptions({ perms }) {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi('/fees/exceptions')
  const [dialog, open] = useDialog()
  if (!state.data) return <Loading state={state} />
  return (
    <Panel title={t('gatewayExceptions')}>
      {dialog}
      <p className="px-5 pt-3 text-xs text-muted">{t('exceptionsNote')}</p>
      <DataTable
        rows={state.data.events}
        columns={[
          { key: 'at', label: t('received'), render: (r) => fmt(r.receivedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
          { key: 'type', label: t('type'), render: (r) => r.type },
          { key: 'result', label: t('result'), render: (r) => <span className={r.open ? 'text-rose-600' : 'text-muted'}>{r.result}</span> },
          { key: 'payload', label: t('details'), render: (r) => <code className="break-all text-[11px] text-muted">{r.payload}</code>, hideOnPhone: true },
          {
            key: 'act',
            label: '',
            render: (r) =>
              r.open &&
              perms.has('fees.collect') && (
                <Button
                  small
                  tone="ghost"
                  onClick={() =>
                    open({
                      title: t('resolve'),
                      fields: [{ key: 'note', label: t('whatWasDone'), type: 'textarea', required: true }],
                      onSubmit: (b) => api(`/fees/exceptions/${r.id}/resolve`, { method: 'POST', body: b }).then(state.reload),
                    })
                  }
                >
                  {t('resolve')}
                </Button>
              ),
          },
        ]}
      />
    </Panel>
  )
}

export default function Fees() {
  const { t, workspace } = useApp()
  const perms = new Set(workspace?.permissions ?? [])
  const [tab, setTab] = useTab('overview')
  const tabs = [
    { key: 'overview', label: t('overview') },
    { key: 'students', label: t('studentAccounts') },
    { key: 'payments', label: t('payments') },
    { key: 'dues', label: t('dues') },
    { key: 'approvals', label: t('approvals') },
    { key: 'setup', label: t('feeSetup') },
    { key: 'exceptions', label: t('gatewayExceptions') },
  ]
  const body = { overview: Overview, students: Students, payments: Payments, dues: Dues, approvals: Approvals, setup: Setup, exceptions: Exceptions }[tab] ?? Overview
  const Body = body
  return (
    <div>
      <PageHeader title={t('feesTitle')} subtitle={t('feesSubtitle')} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <Body perms={perms} go={setTab} />
    </div>
  )
}
