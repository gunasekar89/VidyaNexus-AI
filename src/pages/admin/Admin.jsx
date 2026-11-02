import { useCallback, useEffect, useState } from 'react'
import { Building2, CalendarRange, CheckCircle2, Circle, Copy, GraduationCap, Loader2, Lock, MailPlus, Search, ShieldCheck, UserCheck, Users } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Card, Modal, PageHeader, Pill } from '../../components/ui'
import { inputClass } from '../../components/AuthShell'
import { MODULES } from '../../i18n-admin'
import { dateLabel, relativeTime } from '../../lib/dates'

// Loads an API path and exposes { data, error, reload }.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null })
  const reload = useCallback(
    () =>
      api(path)
        .then((data) => setState({ data, error: null }))
        .catch((error) => setState((s) => ({ data: s.data, error }))),
    [path],
  )
  useEffect(() => {
    reload()
  }, [reload])
  return { ...state, reload }
}

export function Loading({ state }) {
  const { errorText, t } = useApp()
  if (state.error && !state.data)
    return (
      <Card className="p-6 text-center text-sm text-rose-600">
        {errorText(state.error)}{' '}
        <button onClick={state.reload} className="ml-2 font-semibold text-brand-600 underline">
          {t('retry')}
        </button>
      </Card>
    )
  return (
    <div className="flex justify-center py-24 text-muted">
      <Loader2 className="animate-spin" />
    </div>
  )
}

export const rupees = (paise, lang) =>
  new Intl.NumberFormat(lang === 'kn' ? 'kn-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100)

function Stat({ icon: Icon, label, value, tone = 'bg-brand-50 text-brand-600' }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
        <Icon size={24} />
      </span>
      <div>
        <p className="text-2xl font-bold text-ink">{value}</p>
        <p className="text-sm text-muted">{label}</p>
      </div>
    </Card>
  )
}

const Table = ({ head, children }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[560px] text-left text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
          {head.map((h) => (
            <th key={h} className="px-4 py-3 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">{children}</tbody>
    </table>
  </div>
)
const Td = ({ children, className = '' }) => <td className={`px-4 py-3 text-ink ${className}`}>{children}</td>

// ---------- Overview ----------

export function AdminOverview() {
  const { t, tr, workspace } = useApp()
  const state = useApi('/admin/overview')
  const o = state.data
  if (!o) return <Loading state={state} />
  const att = o.attendanceToday
  const marked = (att.P ?? 0) + (att.A ?? 0)
  return (
    <div>
      <PageHeader title={tr(o.school.name)} subtitle={`${tr(workspace.roleLabel)} · ${t('academicYear')} ${o.year?.label ?? '—'} · ${o.school.code}`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={GraduationCap} label={t('studentsEnrolled')} value={o.counts.students} />
        <Stat icon={CalendarRange} label={t('sectionsCount')} value={o.counts.sections} tone="bg-orange-50 text-orange-600" />
        <Stat icon={Users} label={t('staffCount')} value={o.counts.staff} tone="bg-emerald-50 text-emerald-600" />
        <Stat icon={UserCheck} label={t('guardiansLinked')} value={o.counts.guardians} tone="bg-violet-50 text-violet-600" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-semibold text-ink">{t('attendanceToday')}</h2>
          {marked ? (
            <div className="mt-3 flex gap-6">
              <div>
                <p className="text-2xl font-bold text-emerald-600">{att.P ?? 0}</p>
                <p className="text-sm text-muted">{t('present')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-rose-500">{att.A ?? 0}</p>
                <p className="text-sm text-muted">{t('absent')}</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              {tr(dateLabel(att.date, { weekday: 'long', day: 'numeric', month: 'long' }))}: {t('notMarked')}
            </p>
          )}
          {o.counts.pendingInvites > 0 && (
            <p className="mt-4 text-sm text-muted">
              {t('pendingInvites')}: <span className="font-semibold text-ink">{o.counts.pendingInvites}</span>
            </p>
          )}
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold text-ink">{t('modulesTitle')}</h2>
          <p className="mb-3 text-xs text-muted">{t('modulesNote')}</p>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {MODULES.map((m) => (
              <li key={m.key} className="flex items-center gap-2 text-sm">
                {m.live ? <CheckCircle2 size={16} className="shrink-0 text-emerald-500" /> : <Circle size={16} className="shrink-0 text-slate-300" />}
                <span className={m.live ? 'text-ink' : 'text-slate-400'}>{tr(m)}</span>
                {!m.live && <span className="text-[11px] text-slate-400">· {t('modulePlanned')}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

// ---------- People & roles ----------

function CopyLink({ path, label }) {
  const { t } = useApp()
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}${path}`
  return (
    <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
      <p>{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-xs text-ink">{url}</code>
        <button
          onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}
          className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700"
        >
          <Copy size={14} /> {copied ? t('copied') : t('copy')}
        </button>
      </div>
    </div>
  )
}

function InviteForm({ roles, onDone }) {
  const { t, tr, errorText } = useApp()
  const setup = useApi('/admin/setup')
  const students = useApi('/admin/students')
  const [form, setForm] = useState({ role: roles[0]?.role ?? '', email: '', name: '', sectionIds: [], studentId: '', relationship: 'mother', canPickup: false, canViewFees: true })
  const [link, setLink] = useState(null)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await api('/admin/invitations', { method: 'POST', body: { ...form, studentId: Number(form.studentId) || undefined } })
      setLink(res.link)
      onDone()
    } catch (err) {
      setError(errorText(err))
    }
  }
  if (link) return <CopyLink path={link} label={t('inviteLinkReady')} />
  const select = `${inputClass} h-11`
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-medium text-ink">
        {t('role')}
        <select value={form.role} onChange={set('role')} className={`${select} mt-1`}>
          {roles.map((r) => (
            <option key={r.role} value={r.role}>
              {tr(r.label)}
            </option>
          ))}
        </select>
      </label>
      <input required value={form.name} onChange={set('name')} placeholder={t('fullName')} className={select} />
      <input required type="email" value={form.email} onChange={set('email')} placeholder={t('email')} className={select} />
      {form.role === 'teacher' && setup.data && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">{t('sectionsLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            {setup.data.sections.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.sectionIds.includes(s.id)}
                  onChange={(e) => setForm((f) => ({ ...f, sectionIds: e.target.checked ? [...f.sectionIds, s.id] : f.sectionIds.filter((x) => x !== s.id) }))}
                />
                {tr(s.label)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {form.role === 'guardian' && students.data && (
        <>
          <select required value={form.studentId} onChange={set('studentId')} className={select} aria-label={t('child')}>
            <option value="">{t('child')}…</option>
            {students.data.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {tr(s.section)}
              </option>
            ))}
          </select>
          <select value={form.relationship} onChange={set('relationship')} className={select} aria-label={t('relationship')}>
            {['mother', 'father', 'guardian', 'grandparent', 'other'].map((r) => (
              <option key={r} value={r}>
                {t(`rel_${r}`)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.canPickup} onChange={set('canPickup')} /> {t('canPickup')}
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.canViewFees} onChange={set('canViewFees')} /> {t('canViewFees')}
          </label>
        </>
      )}
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      <button className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700">
        <MailPlus size={16} /> {t('createInvite')}
      </button>
    </form>
  )
}

export function People() {
  const { t, tr, errorText, showToast, workspace } = useApp()
  const [q, setQ] = useState('')
  const state = useApi(`/admin/members?q=${encodeURIComponent(q)}`)
  const invites = useApi('/admin/invitations')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [resetLink, setResetLink] = useState(null)
  const canManage = workspace && ['principal', 'campus_admin'].includes(workspace.role)
  const data = state.data
  if (!data) return <Loading state={state} />

  const setStatus = async (m, status) => {
    try {
      await api(`/admin/members/${m.id}`, { method: 'PATCH', body: { status } })
      state.reload()
    } catch (err) {
      showToast(errorText(err))
    }
  }
  const issueReset = async (m) => {
    try {
      setResetLink((await api(`/admin/members/${m.id}/reset-password`, { method: 'POST' })).link)
    } catch (err) {
      showToast(errorText(err))
    }
  }

  return (
    <div>
      <PageHeader
        title={t('people')}
        action={
          data.invitableRoles.length > 0 && (
            <button onClick={() => setInviteOpen(true)} className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              <MailPlus size={16} /> {t('invite')}
            </button>
          )
        }
      />
      <Card className="mb-4 p-3">
        <label className="flex items-center gap-2 px-2">
          <Search size={18} className="text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPeople')} className="h-9 flex-1 bg-transparent text-sm outline-none" />
        </label>
      </Card>
      {resetLink && (
        <div className="mb-4">
          <CopyLink path={resetLink} label={t('resetLinkReady')} />
        </div>
      )}
      <Card className="overflow-hidden">
        <Table head={[t('fullName'), t('role'), t('classLabel'), '', '']}>
          {data.members.map((m) => (
            <tr key={m.id} className={m.status === 'suspended' ? 'opacity-60' : ''}>
              <Td>
                <p className="font-medium">{m.name}</p>
                <p className="text-xs text-muted">{m.email}</p>
              </Td>
              <Td>
                <span className="mr-2">{tr(m.roleLabel)}</span>
                {m.mfa && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-violet-600">
                    <ShieldCheck size={12} /> {t('twoStepOn')}
                  </span>
                )}
              </Td>
              <Td className="text-muted">{m.sections}</Td>
              <Td>{m.status === 'suspended' ? <Pill tone="orange">{t('status_suspended')}</Pill> : m.self ? <Pill tone="blue">{t('you')}</Pill> : null}</Td>
              <Td className="whitespace-nowrap text-right">
                {canManage && !m.self && (
                  <span className="flex justify-end gap-1">
                    <button onClick={() => setStatus(m, m.status === 'active' ? 'suspended' : 'active')} className="rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50">
                      {m.status === 'active' ? t('suspend') : t('reactivate')}
                    </button>
                    <button onClick={() => issueReset(m)} className="rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50">
                      {t('resetLink')}
                    </button>
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      {invites.data?.invitations.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <h2 className="px-4 pt-4 font-semibold text-ink">{t('pendingInvites')}</h2>
          <Table head={[t('fullName'), t('role'), t('invitedBy'), t('expires'), '']}>
            {invites.data.invitations.map((i) => (
              <tr key={i.id}>
                <Td>
                  <p className="font-medium">{i.name}</p>
                  <p className="text-xs text-muted">{i.email}</p>
                </Td>
                <Td>{tr(i.roleLabel)}</Td>
                <Td className="text-muted">{i.invited_by}</Td>
                <Td className="text-muted">{tr(dateLabel(i.expires_at.slice(0, 10)))}</Td>
                <Td className="text-right">
                  <button
                    onClick={() =>
                      api(`/admin/invitations/${i.id}`, { method: 'DELETE' })
                        .then(invites.reload)
                        .catch((err) => showToast(errorText(err)))
                    }
                    className="rounded-lg px-2 py-1 text-xs font-medium text-rose-500 hover:bg-rose-50"
                  >
                    {t('revoke')}
                  </button>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={t('invite')}>
        <InviteForm roles={data.invitableRoles} onDone={() => invites.reload()} />
      </Modal>
    </div>
  )
}

// ---------- Students and staff ----------

export function Students() {
  const { t, tr } = useApp()
  const state = useApi('/admin/students')
  if (!state.data) return <Loading state={state} />
  return (
    <div>
      <PageHeader title={t('studentsNav')} subtitle={`${state.data.students.length} ${t('studentsEnrolled').toLowerCase()}`} />
      <Card className="overflow-hidden">
        <Table head={[t('fullName'), t('admissionNo'), t('classLabel'), t('parentsLinked')]}>
          {state.data.students.map((s) => (
            <tr key={s.id}>
              <Td className="font-medium">{s.name}</Td>
              <Td className="font-mono text-xs">{s.admissionNo}</Td>
              <Td>{tr(s.section)}</Td>
              <Td>{s.guardians}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}

export function Staff() {
  const { t, tr, lang } = useApp()
  const state = useApi('/admin/staff')
  if (!state.data) return <Loading state={state} />
  const { staff, canSeePay } = state.data
  return (
    <div>
      <PageHeader title={t('staffNav')} />
      <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
        <Lock size={14} /> {canSeePay ? t('payAudited') : t('payHidden')}
      </p>
      <Card className="overflow-hidden">
        <Table head={[t('fullName'), t('employeeNo'), t('designation'), t('department'), ...(canSeePay ? [t('monthlyPay'), t('bankAccount')] : [])]}>
          {staff.map((s) => (
            <tr key={s.id}>
              <Td>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted">{t(`staffType_${s.staffType}`)}</p>
              </Td>
              <Td className="font-mono text-xs">{s.employeeNo}</Td>
              <Td>{tr(s.designation)}</Td>
              <Td className="text-muted">{s.department ? tr(s.department) : '—'}</Td>
              {canSeePay && <Td>{s.pay ? rupees(s.pay.monthlyGrossPaise, lang) : '—'}</Td>}
              {canSeePay && <Td className="font-mono text-xs">{s.pay?.bankLast4 ? `•••• ${s.pay.bankLast4}` : '—'}</Td>}
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}

// ---------- School setup ----------

export function Setup() {
  const { t, tr, errorText, showToast } = useApp()
  const state = useApi('/admin/setup')
  const [form, setForm] = useState({ level: 7, name: '', capacity: 40 })
  if (!state.data) return <Loading state={state} />
  const s = state.data
  const addSection = async (e) => {
    e.preventDefault()
    try {
      await api('/admin/sections', { method: 'POST', body: form })
      setForm((f) => ({ ...f, name: '' }))
      state.reload()
    } catch (err) {
      showToast(errorText(err))
    }
  }
  const year = s.years.find((y) => y.status === 'current')
  return (
    <div>
      <PageHeader title={t('schoolSetup')} subtitle={`${tr(s.school.name)} · ${s.school.code}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
            <Building2 size={18} className="text-brand-600" /> {t('schoolLabel')}
          </h2>
          <dl className="space-y-2 text-sm">
            {[
              [t('group'), s.school.group ?? '—'],
              [t('legalEntity'), s.school.legalEntity ?? '—'],
              [t('board'), s.school.board],
              [t('campuses'), s.campuses.map((c) => tr(c.name)).join(', ')],
              [t('language'), s.school.languages.map((l) => (l === 'kn' ? 'ಕನ್ನಡ' : 'English')).join(', ')],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
            <CalendarRange size={18} className="text-brand-600" /> {t('academicYear')} {year?.label}
          </h2>
          <ul className="space-y-1.5 text-sm">
            {s.terms.map((term) => (
              <li key={term.startsOn} className="flex justify-between">
                <span>{tr(term.name)}</span>
                <span className="text-muted">
                  {tr(dateLabel(term.startsOn))} – {tr(dateLabel(term.endsOn))}
                </span>
              </li>
            ))}
          </ul>
          {s.financialYears[0] && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-muted">
              {t('financialYear')}: <span className="text-ink">{s.financialYears[0].label}</span> ({tr(dateLabel(s.financialYears[0].starts_on, { month: 'short', year: 'numeric' }))} –{' '}
              {tr(dateLabel(s.financialYears[0].ends_on, { month: 'short', year: 'numeric' }))})
            </p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold text-ink">{t('departments')}</h2>
          <div className="flex flex-wrap gap-2">
            {s.departments.map((d) => (
              <Pill key={d.name.en}>{tr(d.name)}</Pill>
            ))}
          </div>
        </Card>
      </div>
      <Card className="mt-4 overflow-hidden">
        <h2 className="px-4 pt-4 font-semibold text-ink">{t('classesSections')}</h2>
        <Table head={[t('classLabel'), t('enrolled'), t('capacity')]}>
          {s.sections.map((x) => (
            <tr key={x.id}>
              <Td className="font-medium">{tr(x.label)}</Td>
              <Td>{x.enrolled}</Td>
              <Td className="text-muted">{x.capacity}</Td>
            </tr>
          ))}
        </Table>
        {s.canConfigure && (
          <form onSubmit={addSection} className="flex flex-wrap items-end gap-2 border-t border-slate-100 p-4">
            <label className="text-sm">
              <span className="mb-1 block text-muted">{t('classLabel')}</span>
              <select value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3">
                {s.grades.map((g) => (
                  <option key={g.level} value={g.level}>
                    {tr(g.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">{t('sectionName')}</span>
              <input required maxLength={2} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="C" className="h-10 w-20 rounded-xl border border-slate-200 bg-slate-50 px-3 uppercase" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">{t('capacity')}</span>
              <input type="number" min={1} max={80} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} className="h-10 w-24 rounded-xl border border-slate-200 bg-slate-50 px-3" />
            </label>
            <button className="h-10 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">{t('addSection')}</button>
          </form>
        )}
      </Card>
    </div>
  )
}

// ---------- Audit log ----------

export function Audit() {
  const { t, tr } = useApp()
  const [events, setEvents] = useState(null)
  const [next, setNext] = useState(null)
  const load = useCallback(async (before) => {
    const res = await api(`/admin/audit${before ? `?before=${before}` : ''}`)
    setEvents((e) => (before ? [...e, ...res.events] : res.events))
    setNext(res.next)
  }, [])
  useEffect(() => {
    load()
  }, [load])
  if (!events) return <Loading state={{}} />
  return (
    <div>
      <PageHeader title={t('auditLog')} />
      <Card className="overflow-hidden">
        <Table head={[t('when'), t('who'), t('action'), t('result')]}>
          {events.map((e) => (
            <tr key={e.id}>
              <Td className="whitespace-nowrap text-muted">{tr(relativeTime(e.at))}</Td>
              <Td>{e.actor ?? '—'}</Td>
              <Td>
                <code className="text-xs">{e.action}</code>
                {e.detail?.role && <span className="ml-1 text-xs text-muted">({e.detail.role})</span>}
                {e.detail?.perm && <span className="ml-1 text-xs text-muted">({e.detail.perm})</span>}
              </Td>
              <Td>{e.outcome === 'ok' ? <Pill tone="green">ok</Pill> : <Pill tone="rose">{e.outcome}</Pill>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      {next && (
        <button onClick={() => load(next)} className="mt-3 rounded-xl px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50">
          {t('loadMore')}
        </button>
      )}
    </div>
  )
}

// ---------- Group ----------

export function Group() {
  const { t, tr } = useApp()
  const state = useApi('/group/overview')
  if (!state.data) return <Loading state={state} />
  return (
    <div>
      <PageHeader title={state.data.group ?? t('groupOverview')} subtitle={t('groupNote')} />
      <div className="grid gap-4 md:grid-cols-2">
        {state.data.schools.map((s) => (
          <Card key={s.id} className="p-5">
            <p className="font-semibold text-ink">{tr(s.name)}</p>
            <p className="text-xs text-muted">{s.code}</p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                [s.students, t('studentsEnrolled')],
                [s.sections, t('sectionsCount')],
                [s.staff, t('staffCount')],
              ].map(([v, l]) => (
                <div key={l} className="rounded-xl bg-slate-50 py-3">
                  <p className="text-xl font-bold text-ink">{v}</p>
                  <p className="text-[11px] text-muted">{l}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
