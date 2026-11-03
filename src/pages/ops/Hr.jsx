import { useState } from 'react'
import { Download, Plus, Printer } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Card, Modal, PageHeader } from '../../components/ui'
import { ActButton, Button, DataTable, Money, Note, Panel, Stat, StatusPill, Tabs, useAction, useDate, useDialog, useTab } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'

// ---------- Staff: my leave ----------

export function MyLeave() {
  const { t, tr } = useApp()
  const fmt = useDate()
  const state = useApi('/me/leave')
  const [dialog, open] = useDialog()
  const d = state.data
  if (!d) return <Loading state={state} />
  if (!d.employee) return <Card className="p-6 text-sm text-muted">{t('noEmployeeRecord')}</Card>
  const request = () =>
    open({
      title: t('applyLeave'),
      initial: { typeId: d.balances[0]?.id },
      fields: [
        { key: 'typeId', label: t('leaveType'), type: 'select', required: true, options: d.balances.map((b) => ({ value: b.id, label: `${tr(b.name)}${b.left !== null ? ` · ${b.left} ${t('daysLeft')}` : ''}` })) },
        { key: 'from', label: t('from'), type: 'date', required: true },
        { key: 'to', label: t('to'), type: 'date', required: true },
        { key: 'reason', label: t('reason'), type: 'textarea' },
      ],
      intro: t('sundaysExcluded'),
      onSubmit: (b) => api('/me/leave', { method: 'POST', body: { ...b, typeId: Number(b.typeId) } }).then(state.reload),
    })
  return (
    <div>
      {dialog}
      <PageHeader
        title={t('myLeave')}
        subtitle={t('myLeaveSub')}
        action={
          <Button onClick={request}>
            <Plus size={16} /> {t('applyLeave')}
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d.balances.map((b) => (
          <Stat key={b.id} label={tr(b.name)} value={b.left !== null ? b.left : b.used} hint={b.left !== null ? `${t('of')} ${b.allowed} · ${b.pending ? `${b.pending} ${t('pendingLower')}` : t('daysLeft')}` : t('daysTaken')} />
        ))}
      </div>
      <Panel title={t('myRequests')}>
        <DataTable
          rows={d.requests}
          columns={[
            { key: 'type', label: t('leaveType'), render: (r) => tr(r.type) },
            { key: 'dates', label: t('dates'), render: (r) => `${fmt(r.from, { day: 'numeric', month: 'short' })} – ${fmt(r.to)}` },
            { key: 'days', label: t('days'), render: (r) => r.days },
            { key: 'status', label: t('status'), render: (r) => <StatusPill status={r.status} /> },
            { key: 'note', label: t('note'), render: (r) => <span className="text-muted">{r.decisionNote || r.reason}</span>, hideOnPhone: true },
            {
              key: 'act',
              label: '',
              render: (r) =>
                (r.status === 'pending' || (r.status === 'approved' && r.from > new Date().toISOString().slice(0, 10))) && (
                  <ActButton path={`/me/leave/${r.id}/cancel`} reload={state.reload} tone="danger" confirm="confirmCancelLeave">
                    {t('withdraw')}
                  </ActButton>
                ),
            },
          ]}
        />
      </Panel>
    </div>
  )
}

// ---------- Staff: payslips ----------

function Payslip({ slip, onClose }) {
  const { t, tr, user } = useApp()
  const fmt = useDate()
  return (
    <Modal open onClose={onClose} title={`${t('payslip')} · ${fmt(slip.month, { month: 'long', year: 'numeric' })}`}>
      <div className="print-area text-sm">
        <p className="font-semibold text-ink">{user.name}</p>
        <p className="mb-3 text-xs text-muted">
          {slip.employeeNo} · {t('bankEnding')} {slip.bankLast4 || '—'}
        </p>
        <div className="divide-y divide-slate-100 border-y border-slate-100">
          <Row label={t('grossPay')} paise={slip.grossPaise} />
          {slip.lopDays > 0 && <Row label={`${t('lossOfPay')} (${slip.lopDays}/${slip.daysInMonth} ${t('days')})`} paise={-slip.lopPaise} />}
          <Row label={t('earned')} paise={slip.earnedPaise} bold />
          {slip.deductions
            .filter((x) => x.kind === 'deduction')
            .map((x) => (
              <Row key={x.code} label={tr(x.name)} paise={-x.amountPaise} />
            ))}
          <Row label={t('netPay')} paise={slip.netPaise} bold />
        </div>
        {slip.employerPaise > 0 && (
          <p className="mt-2 text-xs text-muted">
            {t('employerContrib')}: <Money paise={slip.employerPaise} />
          </p>
        )}
        <p className="mt-3 text-xs text-muted">{slip.paid ? t('salaryPaid') : t('salaryApproved')}</p>
        <div className="mt-4 flex justify-end print:hidden">
          <Button tone="ghost" onClick={() => window.print()}>
            <Printer size={16} /> {t('print')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
const Row = ({ label, paise, bold }) => (
  <div className={`flex justify-between py-2 ${bold ? 'font-semibold' : ''}`}>
    <span>{label}</span>
    <Money paise={paise} decimals />
  </div>
)

export function MyPayslips() {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi('/me/payslips')
  const [open, setOpen] = useState(null)
  if (!state.data) return <Loading state={state} />
  return (
    <div>
      <PageHeader title={t('payslips')} subtitle={t('payslipsSub')} />
      <Panel>
        <DataTable
          rows={state.data.payslips}
          empty={t('noPayslips')}
          onRowClick={setOpen}
          columns={[
            { key: 'month', label: t('month'), render: (r) => <span className="font-medium">{fmt(r.month, { month: 'long', year: 'numeric' })}</span> },
            { key: 'earned', label: t('earned'), align: 'right', render: (r) => <Money paise={r.earnedPaise} /> },
            { key: 'ded', label: t('deductions'), align: 'right', render: (r) => <Money paise={r.deductionsPaise} /> },
            { key: 'net', label: t('netPay'), align: 'right', render: (r) => <Money paise={r.netPaise} className="font-semibold" /> },
            { key: 'status', label: t('status'), render: (r) => <StatusPill status={r.paid ? 'paid' : 'approved'} /> },
          ]}
        />
      </Panel>
      {open && <Payslip slip={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

// ---------- Approvers: leave ----------

export function LeaveApprovals() {
  const { t, tr } = useApp()
  const fmt = useDate()
  const state = useApi('/hr/leave')
  const [dialog, open] = useDialog()
  const d = state.data
  if (!d) return <Loading state={state} />
  const reject = (r) =>
    open({
      title: `${t('reject')} · ${r.employee}`,
      fields: [{ key: 'note', label: t('reason'), type: 'textarea', required: true }],
      onSubmit: (b) => api(`/hr/leave/${r.id}/decide`, { method: 'POST', body: { ...b, approve: false } }).then(state.reload),
    })
  const cols = (actions) => [
    { key: 'employee', label: t('employee'), render: (r) => <span className="font-medium">{r.employee}</span> },
    { key: 'type', label: t('leaveType'), render: (r) => tr(r.type) },
    { key: 'dates', label: t('dates'), render: (r) => `${fmt(r.from, { day: 'numeric', month: 'short' })} – ${fmt(r.to)} (${r.days})` },
    { key: 'reason', label: t('reason'), render: (r) => <span className="text-muted">{r.reason}</span>, hideOnPhone: true },
    actions
      ? {
          key: 'act',
          label: '',
          render: (r) =>
            r.mine ? (
              <span className="text-xs text-muted">{t('waitingForOther')}</span>
            ) : (
              <div className="flex justify-end gap-1">
                <ActButton path={`/hr/leave/${r.id}/decide`} body={{ approve: true }} reload={state.reload} tone="success" okKey="approved">
                  {t('approve')}
                </ActButton>
                <Button small tone="danger" onClick={() => reject(r)}>
                  {t('reject')}
                </Button>
              </div>
            ),
        }
      : { key: 'status', label: t('status'), render: (r) => <StatusPill status={r.status} /> },
  ]
  return (
    <div className="space-y-4">
      {dialog}
      <PageHeader title={t('leaveApprovals')} subtitle={`${t('onLeaveToday')}: ${d.onLeaveToday.map((l) => l.employee).join(', ') || '—'}`} />
      <Panel title={`${t('waiting')} (${d.pending.length})`}>
        <DataTable rows={d.pending} columns={cols(true)} empty={t('nothingWaiting')} />
      </Panel>
      <Panel title={t('recentDecisions')}>
        <DataTable rows={d.recent} columns={cols(false)} />
      </Panel>
    </div>
  )
}

// ---------- Payroll ----------

function RunDetail({ runId, onClose, reload, can }) {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi(`/hr/payroll/runs/${runId}`)
  const [dialog, open] = useDialog()
  const [run, busy] = useAction(async () => {
    await state.reload()
    await reload()
  })
  const d = state.data
  if (!d) return <Loading state={state} />
  const r = d.run
  return (
    <Modal open onClose={onClose} title={`${t('payroll')} · ${fmt(r.month, { month: 'long', year: 'numeric' })}`} wide>
      {dialog}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusPill status={r.status} />
        <span className="text-xs text-muted">
          {t('preparedBy')}: {r.preparedBy}
          {r.approvedBy ? ` · ${t('approvedBy')}: ${r.approvedBy}` : ''} · {t('inputsCheck')} {r.inputsHash}
        </span>
      </div>
      {d.stale && <Note tone="rose">{t('payrollStale')}</Note>}
      {d.unverifiedRules.length > 0 && r.status === 'draft' && (
        <div className="mt-2">
          <Note>{t('rulesUnverified').replace('{rules}', d.unverifiedRules.join(', '))}</Note>
        </div>
      )}
      <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('employees')} value={r.employees} />
        <Stat label={t('earned')} value={<Money paise={r.totals.grossPaise} />} />
        <Stat label={t('deductions')} value={<Money paise={r.totals.deductionsPaise} />} />
        <Stat label={t('netPay')} value={<Money paise={r.totals.netPaise} />} tone="text-emerald-600" hint={<>{t('employerContrib')}: <Money paise={r.totals.employerPaise} /></>} />
      </div>
      {d.flagged.length > 0 && (
        <div className="mb-3 text-sm">
          <p className="font-semibold text-ink">{t('flaggedForReview')}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {d.flagged.map((f) => (
              <li key={f.employeeNo} className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
                {f.employeeNo}: {f.flags.map((x) => t(`flag_${x}`)).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.payslips ? (
        <DataTable
          rows={r.payslips}
          columns={[
            { key: 'name', label: t('employee'), render: (p) => `${p.name} · ${p.employeeNo}` },
            { key: 'gross', label: t('grossPay'), align: 'right', render: (p) => <Money paise={p.grossPaise} /> },
            { key: 'lop', label: t('lossOfPay'), align: 'right', render: (p) => (p.lopDays ? <>{p.lopDays}d · <Money paise={p.lopPaise} /></> : '—'), hideOnPhone: true },
            { key: 'ded', label: t('deductions'), align: 'right', render: (p) => <Money paise={p.deductionsPaise} /> },
            { key: 'net', label: t('netPay'), align: 'right', render: (p) => <Money paise={p.netPaise} className="font-semibold" /> },
            { key: 'prev', label: t('lastMonth'), align: 'right', render: (p) => (p.previousNetPaise != null ? <Money paise={p.previousNetPaise} /> : '—'), hideOnPhone: true },
          ]}
        />
      ) : (
        <Note tone="blue">{t('totalsOnly')}</Note>
      )}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {r.status === 'draft' && can.approve && !r.mine && (
          <Button tone="success" busy={busy} disabled={d.stale} onClick={() => window.confirm(t('approvePayrollConfirm')) && run(() => api(`/hr/payroll/runs/${r.id}/approve`, { method: 'POST', body: { version: r.version } }), 'approved')}>
            {t('approvePayroll')}
          </Button>
        )}
        {r.status === 'draft' && r.mine && <span className="self-center text-sm text-muted">{t('waitingForOther')}</span>}
        {r.status === 'draft' && can.prepare && (
          <>
            <Button tone="ghost" busy={busy} onClick={() => run(() => api(`/hr/payroll/runs/${r.id}/recompute`, { method: 'POST' }).then(onClose), 'recomputed')}>
              {t('recompute')}
            </Button>
            <Button tone="danger" busy={busy} onClick={() => window.confirm(t('confirmCancelRun')) && run(() => api(`/hr/payroll/runs/${r.id}/cancel`, { method: 'POST' }).then(onClose))}>
              {t('cancelRun')}
            </Button>
          </>
        )}
        {r.status === 'approved' && can.prepare && (
          <Button
            onClick={() =>
              open({
                title: t('markSalariesPaid'),
                fields: [{ key: 'reference', label: t('bankReference'), required: true }],
                onSubmit: (b) => api(`/hr/payroll/runs/${r.id}/paid`, { method: 'POST', body: b }).then(() => state.reload().then(reload)),
              })
            }
          >
            {t('markSalariesPaid')}
          </Button>
        )}
        {['approved', 'paid'].includes(r.status) && can.seePay && can.prepare && (
          <a href={`/api/hr/payroll/runs/${r.id}/bank.csv`} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-slate-200 hover:bg-slate-50">
            <Download size={16} /> {t('bankFile')}
          </a>
        )}
      </div>
      {r.approvedAt && <p className="mt-2 text-xs text-muted">{t('approvedOn')} {fmt(r.approvedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
    </Modal>
  )
}

function Rules({ d, reload }) {
  const { t, tr } = useApp()
  const [dialog, open] = useDialog()
  const edit = (r) =>
    open({
      title: tr(r.name),
      intro: t('ruleNote'),
      initial: {
        percent: String(r.percentBp / 100),
        fixedPaise: r.fixedPaise ? String(r.fixedPaise / 100) : '',
        baseCapPaise: r.baseCapPaise != null ? String(r.baseCapPaise / 100) : '',
        minGrossPaise: r.minGrossPaise != null ? String(r.minGrossPaise / 100) : '',
        maxGrossPaise: r.maxGrossPaise != null ? String(r.maxGrossPaise / 100) : '',
        enabled: r.enabled,
        verifiedBy: r.verifiedBy,
      },
      fields: [
        { key: 'percent', label: t('percent'), type: 'number', step: '0.01', min: 0, max: 100, show: () => r.basis !== 'fixed' },
        { key: 'fixedPaise', label: t('fixedAmount'), type: 'money', show: () => r.basis === 'fixed' },
        { key: 'baseCapPaise', label: t('baseCap'), type: 'money', hint: t('blankNoLimit') },
        { key: 'minGrossPaise', label: t('appliesFromGross'), type: 'money', hint: t('blankNoLimit') },
        { key: 'maxGrossPaise', label: t('appliesUpToGross'), type: 'money', hint: t('blankNoLimit') },
        { key: 'enabled', label: t('ruleEnabled'), type: 'checkbox' },
        { key: 'verifiedBy', label: t('verifiedBy'), hint: t('verifiedByHint') },
      ],
      onSubmit: (b) =>
        api(`/hr/payroll/rules/${r.id}`, {
          method: 'PATCH',
          body: {
            percentBp: b.percent !== undefined ? Math.round(Number(b.percent) * 100) : undefined,
            fixedPaise: b.fixedPaise,
            baseCapPaise: b.baseCapPaise ?? null,
            minGrossPaise: b.minGrossPaise ?? null,
            maxGrossPaise: b.maxGrossPaise ?? null,
            enabled: b.enabled,
            verifiedBy: b.verifiedBy,
          },
        }).then(reload),
    })
  return (
    <Panel title={t('payrollRules')}>
      {dialog}
      <div className="px-5 pt-3">
        <Note>{t('ruleNote')}</Note>
      </div>
      <DataTable
        rows={d.rules}
        onRowClick={d.canPrepare ? edit : undefined}
        columns={[
          { key: 'name', label: t('rule'), render: (r) => <span className="font-medium">{tr(r.name)}</span> },
          { key: 'kind', label: t('type'), render: (r) => t(`rk_${r.kind}`) },
          { key: 'how', label: t('calculation'), render: (r) => (r.basis === 'fixed' ? <Money paise={r.fixedPaise} /> : `${r.percentBp / 100}% ${t(`basis_${r.basis}`)}`) },
          {
            key: 'limits',
            label: t('limits'),
            render: (r) => (
              <span className="text-xs text-muted">
                {r.baseCapPaise != null && <>{t('cap')} <Money paise={r.baseCapPaise} /> </>}
                {r.minGrossPaise != null && <>≥ <Money paise={r.minGrossPaise} /> </>}
                {r.maxGrossPaise != null && <>≤ <Money paise={r.maxGrossPaise} /></>}
              </span>
            ),
            hideOnPhone: true,
          },
          { key: 'verified', label: t('verified'), render: (r) => (r.verifiedBy ? <StatusPill status="verified" label={r.verifiedBy} /> : <StatusPill status="pending" label={t('notVerified')} />) },
          { key: 'on', label: '', render: (r) => !r.enabled && <StatusPill status="cancelled" label={t('off')} /> },
        ]}
      />
    </Panel>
  )
}

export function Payroll() {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi('/hr/payroll')
  const [tab, setTab] = useTab('runs')
  const [dialog, open] = useDialog()
  const [openRun, setOpenRun] = useState(null)
  const d = state.data
  if (!d) return <Loading state={state} />
  const can = { prepare: d.canPrepare, approve: d.canApprove, seePay: d.canSeePay }
  const prepare = () => {
    const now = new Date()
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    open({
      title: t('prepareRun'),
      intro: t('prepareNote'),
      initial: { month: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}` },
      fields: [{ key: 'month', label: t('month'), type: 'month', required: true }],
      onSubmit: (b) => api('/hr/payroll/runs', { method: 'POST', body: b }).then((r) => state.reload().then(() => setOpenRun(r.id))),
    })
  }
  return (
    <div>
      {dialog}
      <PageHeader
        title={t('payroll')}
        subtitle={t('payrollSub')}
        action={
          d.canPrepare && (
            <Button onClick={prepare}>
              <Plus size={16} /> {t('prepareRun')}
            </Button>
          )
        }
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'runs', label: t('payrollRuns') }, { key: 'rules', label: t('payrollRules') }]} />
      {tab === 'rules' ? (
        <Rules d={d} reload={state.reload} />
      ) : (
        <Panel>
          <DataTable
            rows={d.runs}
            onRowClick={(r) => setOpenRun(r.id)}
            columns={[
              { key: 'month', label: t('month'), render: (r) => <span className="font-medium">{fmt(r.month, { month: 'long', year: 'numeric' })}</span> },
              { key: 'emp', label: t('employees'), render: (r) => r.employees },
              { key: 'net', label: t('netPay'), align: 'right', render: (r) => <Money paise={r.totals.netPaise} /> },
              { key: 'flags', label: t('flags'), render: (r) => (r.flags ? <StatusPill status="pending" label={`${r.flags} ${t('toReview')}`} /> : '—') },
              { key: 'by', label: t('preparedBy'), render: (r) => r.preparedBy, hideOnPhone: true },
              { key: 'status', label: t('status'), render: (r) => <StatusPill status={r.status} /> },
            ]}
          />
        </Panel>
      )}
      {openRun && <RunDetail runId={openRun} can={can} onClose={() => setOpenRun(null)} reload={state.reload} />}
    </div>
  )
}
