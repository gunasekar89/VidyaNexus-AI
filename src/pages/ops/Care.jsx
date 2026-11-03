import { useState } from 'react'
import { HeartPulse, Lock, Plus, ShieldAlert } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Card, Modal, PageHeader } from '../../components/ui'
import { Button, DataTable, Note, Panel, Stat, StatusPill, fieldClass, opts, useAction, useDate, useDialog } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'

const CATEGORIES = ['bullying', 'neglect', 'abuse', 'self_harm', 'online', 'other']
const SEVERITIES = ['low', 'medium', 'high', 'urgent']

// ---------- Infirmary ----------

function StudentHealth({ studentId, onClose }) {
  const { t, tr } = useApp()
  const fmt = useDate()
  const state = useApi(`/infirmary/students/${studentId}`)
  const d = state.data
  return (
    <Modal open onClose={onClose} title={d ? d.student.name : t('loading')} wide>
      {!d ? (
        <Loading state={state} />
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            {d.student.admissionNo} · {tr(d.student.section)}
          </p>
          {d.notes.length > 0 && (
            <Note tone="rose">
              {d.notes.map((n, i) => (
                <p key={i}>{n.body}</p>
              ))}
            </Note>
          )}
          <div>
            <p className="mb-1 font-semibold">{t('guardians')}</p>
            <ul className="space-y-1">
              {d.guardians.map((g, i) => (
                <li key={i}>
                  {g.name} ({t(`rel_${g.relationship}`)}) {g.mobile && <a href={`tel:${g.mobile}`} className="text-brand-600 underline">{g.mobile}</a>}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold">{t('pastVisits')}</p>
            {!d.visits.length && <p className="text-muted">{t('nothingYet')}</p>}
            <ul className="divide-y divide-slate-100">
              {d.visits.map((v) => (
                <li key={v.id} className="py-2">
                  <p className="font-medium">{v.complaint}</p>
                  <p className="text-xs text-muted">
                    {fmt(v.at)} · {v.actionTaken} {v.sentHome ? `· ${t('sentHome')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function Infirmary() {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi('/infirmary')
  const [dialog, open] = useDialog()
  const [student, setStudent] = useState(null)
  const d = state.data
  if (!d) return <Loading state={state} />
  const record = () =>
    open({
      title: t('recordVisit'),
      intro: t('recordVisitNote'),
      initial: { guardianInformed: true },
      fields: [
        { key: 'student', label: t('student'), type: 'student', required: true, send: 'studentId' },
        { key: 'complaint', label: t('complaint'), required: true },
        { key: 'actionTaken', label: t('actionTaken'), type: 'textarea', required: true },
        { key: 'sentHome', label: t('sentHome'), type: 'checkbox' },
        { key: 'guardianInformed', label: t('guardianInformed'), type: 'checkbox' },
      ],
      onSubmit: (b) => api('/infirmary/visits', { method: 'POST', body: b }).then(state.reload),
    })
  return (
    <div>
      {dialog}
      <PageHeader
        title={t('infirmaryTitle')}
        subtitle={t('infirmarySub')}
        action={
          d.canRecord && (
            <Button onClick={record}>
              <Plus size={16} /> {t('recordVisit')}
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label={t('visitsToday')} value={d.today} />
        <Stat label={t('last30Days')} value={d.visits.length} />
      </div>
      <Note tone="blue">
        <Lock size={14} className="mr-1 inline" /> {t('healthPrivacy')}
      </Note>
      <Panel title={t('recentVisits')} className="mt-4">
        <DataTable
          rows={d.visits}
          onRowClick={(v) => setStudent(v.studentId)}
          columns={[
            { key: 'student', label: t('student'), render: (v) => <span className="font-medium">{v.student}</span> },
            { key: 'complaint', label: t('complaint'), render: (v) => v.complaint },
            { key: 'action', label: t('actionTaken'), render: (v) => v.actionTaken },
            { key: 'flags', label: t('outcome'), render: (v) => [v.sentHome && t('sentHome'), v.guardianInformed && t('guardianInformed')].filter(Boolean).join(' · ') || '—' },
            { key: 'at', label: t('date'), render: (v) => `${fmt(v.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${v.recordedBy}` },
          ]}
        />
      </Panel>
      {student && <StudentHealth studentId={student} onClose={() => setStudent(null)} />}
    </div>
  )
}

export function FamilyHealth() {
  const { t, tr } = useApp()
  const fmt = useDate()
  const state = useApi('/family/health')
  const d = state.data
  if (!d) return <Loading state={state} />
  return (
    <div>
      <PageHeader title={t('healthTitle')} subtitle={t('familyHealthSub')} />
      {!d.children.length && <Card className="p-6 text-sm text-muted">{t('noHealthAccess')}</Card>}
      <div className="space-y-4">
        {d.children.map((c) => (
          <Panel key={c.id} title={tr(c.firstName)}>
            {!c.visits.length ? (
              <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted">
                <HeartPulse size={16} /> {t('noVisits')}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {c.visits.map((v) => (
                  <li key={v.id} className="px-5 py-3 text-sm">
                    <p className="font-medium text-ink">{v.complaint}</p>
                    <p className="text-muted">{v.actionTaken}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {fmt(v.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} {v.sentHome ? `· ${t('sentHome')}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ))}
      </div>
    </div>
  )
}

// ---------- Safeguarding ----------

// Any staff member can report. They get a reference number, not the case.
export function ReportConcern() {
  const { t } = useApp()
  const fmt = useDate()
  const mine = useApi('/safeguarding/mine')
  const [done, setDone] = useState(null)
  const [dialog, open] = useDialog()
  const report = () =>
    open({
      title: t('reportConcern'),
      wide: true,
      intro: t('reportIntro'),
      initial: { severity: 'medium', category: 'other' },
      fields: [
        { key: 'student', label: t('studentIfKnown'), type: 'student', send: 'studentId', wide: true },
        { key: 'category', label: t('category'), type: 'select', required: true, options: opts(CATEGORIES, t, 'sgc_') },
        { key: 'severity', label: t('severity'), type: 'select', required: true, options: opts(SEVERITIES, t, 'sev_'), hint: t('urgentHint') },
        { key: 'summary', label: t('whatHappened'), type: 'textarea', rows: 6, required: true, wide: true, hint: t('factsHint') },
      ],
      submitLabel: t('submitReport'),
      onSubmit: (b) =>
        api('/safeguarding/reports', { method: 'POST', body: b }).then((out) => {
          setDone(out)
          return mine.reload()
        }),
    })
  return (
    <div>
      {dialog}
      <PageHeader title={t('reportConcern')} subtitle={t('reportConcernSub')} />
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <span className="rounded-2xl bg-rose-50 p-3 text-rose-600">
            <ShieldAlert size={24} />
          </span>
          <div className="flex-1 space-y-3 text-sm">
            <p>{t('reportWhy')}</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>{t('reportTip1')}</li>
              <li>{t('reportTip2')}</li>
              <li>{t('reportTip3')}</li>
            </ul>
            <Button tone="danger" onClick={report}>
              {t('reportConcern')}
            </Button>
          </div>
        </div>
      </Card>
      {done && (
        <Note tone="green">
          <span className="font-semibold">{t('reportReceived')} {done.number}.</span> {done.alerted ? t('officersAlerted') : ''}
        </Note>
      )}
      {mine.data?.reports.length > 0 && (
        <Panel title={t('myReports')} className="mt-4">
          <ul className="divide-y divide-slate-100">
            {mine.data.reports.map((r) => (
              <li key={r.number} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-medium">{r.number}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {fmt(r.created_at)} <StatusPill status={r.severity} label={t(`sev_${r.severity}`)} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

function CaseDetail({ id, officers, onClose, reload }) {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi(`/safeguarding/cases/${id}`)
  const [note, setNote] = useState('')
  const [run, busy] = useAction(() => state.reload().then(reload))
  const d = state.data
  const patch = (body) => run(() => api(`/safeguarding/cases/${id}`, { method: 'PATCH', body }))
  return (
    <Modal open onClose={onClose} title={d ? d.case.number : t('loading')} wide>
      {!d ? (
        <Loading state={state} />
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <StatusPill status={d.case.severity} label={t(`sev_${d.case.severity}`)} />
            <StatusPill status={d.case.status} />
            <span className="text-xs text-muted">
              {t(`sgc_${d.case.category}`)} · {d.case.student || t('noStudentNamed')} · {t('reportedBy')} {d.case.reporter} · {fmt(d.case.createdAt)}
            </span>
          </div>
          <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3">{d.case.summary}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="mb-1 block text-xs font-medium text-muted">{t('status')}</span>
              <select value={d.case.status} onChange={(e) => patch({ status: e.target.value })} className={fieldClass}>
                {['open', 'investigating', 'closed'].map((s) => (
                  <option key={s} value={s}>
                    {t(`st_${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-muted">{t('severity')}</span>
              <select value={d.case.severity} onChange={(e) => patch({ severity: e.target.value })} className={fieldClass}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {t(`sev_${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-muted">{t('assignedTo')}</span>
              <select value={d.case.assignedTo ?? ''} onChange={(e) => patch({ assignedTo: e.target.value ? Number(e.target.value) : null })} className={fieldClass}>
                <option value="">—</option>
                {officers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <p className="mb-2 font-semibold">{t('caseNotes')}</p>
            {!d.notes.length && <p className="text-xs text-muted">{t('noNotesYet')}</p>}
            <ol className="space-y-2">
              {d.notes.map((n, i) => (
                <li key={i} className="rounded-xl border border-slate-100 p-3">
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {n.by} · {fmt(n.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </li>
              ))}
            </ol>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (await run(() => api(`/safeguarding/cases/${id}/notes`, { method: 'POST', body: { body: note } }))) setNote('')
              }}
              className="mt-3 space-y-2"
            >
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} required placeholder={t('addCaseNote')} className={`${fieldClass} h-auto py-2`} />
              <div className="flex justify-end">
                <Button type="submit" small busy={busy}>
                  {t('addNote')}
                </Button>
              </div>
            </form>
          </div>
          <p className="text-xs text-muted">{t('caseAccessLogged')}</p>
        </div>
      )}
    </Modal>
  )
}

export function Safeguarding() {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi('/safeguarding/cases')
  const [open, setOpen] = useState(null)
  const d = state.data
  if (!d) return <Loading state={state} />
  const live = d.cases.filter((c) => c.status !== 'closed')
  return (
    <div>
      <PageHeader title={t('safeguardingTitle')} subtitle={t('safeguardingSub')} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label={t('openCases')} value={live.length} />
        <Stat label={t('sev_urgent')} value={live.filter((c) => c.severity === 'urgent').length} tone={live.some((c) => c.severity === 'urgent') ? 'text-rose-600' : 'text-ink'} />
        <Stat label={t('unassigned')} value={live.filter((c) => !c.assignedTo).length} />
      </div>
      <Note tone="rose">
        <Lock size={14} className="mr-1 inline" /> {t('safeguardingPrivacy')}
      </Note>
      <Panel title={t('caseRegister')} className="mt-4">
        <DataTable
          rows={d.cases}
          onRowClick={(c) => setOpen(c.id)}
          columns={[
            { key: 'no', label: t('number'), render: (c) => <span className="font-medium">{c.number}</span> },
            { key: 'cat', label: t('category'), render: (c) => t(`sgc_${c.category}`) },
            { key: 'student', label: t('student'), render: (c) => c.student || '—' },
            { key: 'sev', label: t('severity'), render: (c) => <StatusPill status={c.severity} label={t(`sev_${c.severity}`)} /> },
            { key: 'who', label: t('assignedTo'), hideOnPhone: true, render: (c) => c.assignee || '—' },
            { key: 'at', label: t('reported'), hideOnPhone: true, render: (c) => fmt(c.createdAt) },
            { key: 'status', label: t('status'), render: (c) => <StatusPill status={c.status} /> },
          ]}
        />
      </Panel>
      {open && <CaseDetail id={open} officers={d.officers} onClose={() => setOpen(null)} reload={state.reload} />}
    </div>
  )
}
