import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Card, Modal, PageHeader } from '../../components/ui'
import { Button, DataTable, Note, Panel, StatusPill, Tabs, opts, useAction, useDate, useDialog } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'

const FLOW = ['enquiry', 'applied', 'documents_verified', 'offered', 'accepted', 'enrolled']
const SIDE = ['waitlisted', 'rejected', 'withdrawn']
const DOCS = ['birth_certificate', 'address_proof', 'transfer_certificate', 'photo']

function Detail({ appId, onClose, reload }) {
  const { t, tr, errorText } = useApp()
  const fmt = useDate()
  const state = useApi(`/admissions/${appId}`)
  const [dialog, open] = useDialog()
  const [run, busy] = useAction(async () => {
    await state.reload()
    await reload()
  })
  const [enrolled, setEnrolled] = useState(null)
  const d = state.data
  if (!d) return <Loading state={state} />
  const a = d.application
  const move = (status) => {
    const needsReason = SIDE.includes(status)
    if (status === 'offered') {
      return open({
        title: t('makeOffer'),
        fields: [
          { key: 'sectionId', label: t('section'), type: 'select', required: true, options: d.sections.map((s) => ({ value: s.id, label: `${tr(s.label)} · ${t('seatsFree')}: ${s.free}/${s.capacity}` })) },
          { key: 'offerExpiresOn', label: t('offerExpires'), type: 'date', hint: t('offerExpiresHint') },
        ],
        submitLabel: t('makeOffer'),
        onSubmit: (b) => api(`/admissions/${a.id}/status`, { method: 'POST', body: { ...b, sectionId: Number(b.sectionId), status, version: a.version } }).then(() => run(() => null)),
      })
    }
    if (needsReason) {
      return open({
        title: t(`st_${status}`),
        fields: [{ key: 'reason', label: t('reason'), type: 'textarea', required: true }],
        onSubmit: (b) => api(`/admissions/${a.id}/status`, { method: 'POST', body: { ...b, status, version: a.version } }).then(() => run(() => null)),
      })
    }
    return run(() => api(`/admissions/${a.id}/status`, { method: 'POST', body: { status, version: a.version } }))
  }
  const toggleDoc = (doc) =>
    run(() => api(`/admissions/${a.id}`, { method: 'PATCH', body: { version: a.version, docs: { [doc]: !a.docs[doc] } } }), null)
  const enroll = async () => {
    try {
      const out = await api(`/admissions/${a.id}/enroll`, { method: 'POST', body: { version: a.version } })
      setEnrolled(out)
      await state.reload()
      await reload()
    } catch (err) {
      window.alert(errorText(err))
    }
  }
  const row = (label, value) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{value || '—'}</span>
    </div>
  )
  return (
    <Modal open onClose={onClose} title={`${a.childName} · ${a.number}`} wide>
      {dialog}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusPill status={a.status} />
        <span className="text-xs text-muted">
          {t('grade')} {a.gradeLevel}
          {a.offerSection ? ` · ${tr(a.offerSection)}` : ''}
          {a.offerExpiresOn ? ` · ${t('offerExpires')} ${fmt(a.offerExpiresOn)}` : ''}
        </span>
      </div>
      {enrolled && (
        <Note tone="green">
          <p className="font-semibold">
            {t('enrolledAs')} {enrolled.admissionNo}
          </p>
          <p className="mt-1">{t('feesRaised').replace('{n}', enrolled.feesCreated)}</p>
          {enrolled.guardianLink && (
            <p className="mt-2 break-all">
              {t('guardianSetupLink')}: <code className="rounded bg-white px-1">{window.location.origin + enrolled.guardianLink}</code>
            </p>
          )}
          {enrolled.existingGuardian && <p className="mt-2">{t('guardianExisting')}</p>}
          <p className="mt-2 break-all">
            {t('studentSetupLink')}: <code className="rounded bg-white px-1">{window.location.origin + enrolled.studentLink}</code>
          </p>
        </Note>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="divide-y divide-slate-50">
          {row(t('dob'), a.childDob && fmt(a.childDob))}
          {row(t('previousSchool'), a.previousSchool)}
          {row(t('guardian'), `${a.guardianName} (${t(`rel_${a.guardianRelationship}`)})`)}
          {row(t('mobile'), a.guardianMobile)}
          {row(t('email'), a.guardianEmail)}
          {row(t('source'), t(`src_${a.source}`))}
          {row(t('decisionReason'), a.decisionReason)}
          {d.existingGuardian && <p className="py-2 text-xs text-emerald-700">{t('guardianMatch').replace('{name}', d.existingGuardian.name)}</p>}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">{t('documents')}</p>
          <div className="space-y-2">
            {DOCS.map((doc) => (
              <label key={doc} className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" disabled={busy || ['enrolled', 'rejected', 'withdrawn'].includes(a.status)} checked={a.docs[doc]} onChange={() => toggleDoc(doc)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                {t(`doc_${doc}`)}
                {doc === 'transfer_certificate' && !a.previousSchool && <span className="text-xs text-muted">({t('notNeeded')})</span>}
              </label>
            ))}
          </div>
          {d.history.length > 0 && (
            <>
              <p className="mb-1 mt-4 text-sm font-semibold text-ink">{t('history')}</p>
              <ul className="space-y-1 text-xs text-muted">
                {d.history.map((h, i) => (
                  <li key={i}>
                    {fmt(h.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {h.by} · {h.detail.to ? t(`st_${h.detail.to}`) : t(`act_${h.action.split('.')[1]}`)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {a.status === 'accepted' && (
          <Button tone="success" onClick={enroll}>
            {t('enrollNow')}
          </Button>
        )}
        {a.next
          .filter((s) => !SIDE.includes(s))
          .map((s) => (
            <Button key={s} busy={busy} onClick={() => move(s)}>
              {t(`moveTo_${s}`)}
            </Button>
          ))}
        {a.next
          .filter((s) => SIDE.includes(s))
          .map((s) => (
            <Button key={s} tone={s === 'waitlisted' ? 'ghost' : 'danger'} onClick={() => move(s)}>
              {t(`moveTo_${s}`)}
            </Button>
          ))}
      </div>
    </Modal>
  )
}

export default function Admissions() {
  const { t } = useApp()
  const fmt = useDate()
  const [status, setStatus] = useState('')
  const state = useApi(`/admissions${status ? `?status=${status}` : ''}`)
  const [selected, setSelected] = useState(null)
  const [dialog, open] = useDialog()
  const d = state.data
  if (!d) return <Loading state={state} />
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0)
  const newEnquiry = () =>
    open({
      title: t('newEnquiry'),
      wide: true,
      initial: { guardianRelationship: 'mother', source: 'walk_in', status: 'enquiry' },
      fields: [
        { key: 'childName', label: t('childName'), required: true },
        { key: 'gradeLevel', label: t('gradeApplying'), type: 'select', required: true, options: Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: `${t('grade')} ${i + 1}` })) },
        { key: 'childDob', label: t('dob'), type: 'date' },
        { key: 'previousSchool', label: t('previousSchool') },
        { key: 'guardianName', label: t('guardianName'), required: true },
        { key: 'guardianRelationship', label: t('relationship'), type: 'select', required: true, options: opts(d.relationships, t, 'rel_') },
        { key: 'guardianMobile', label: t('mobile'), type: 'tel', required: true, placeholder: '98450 12345' },
        { key: 'guardianEmail', label: t('email'), type: 'email' },
        { key: 'source', label: t('source'), type: 'select', required: true, options: opts(d.sources, t, 'src_') },
        { key: 'followUpOn', label: t('followUpOn'), type: 'date' },
        { key: 'status', label: t('stage'), type: 'select', required: true, options: [{ value: 'enquiry', label: t('st_enquiry') }, { value: 'applied', label: t('st_applied') }] },
        { key: 'notes', label: t('notes'), type: 'textarea', wide: true },
      ],
      onSubmit: async (b) => {
        try {
          await api('/admissions', { method: 'POST', body: { ...b, gradeLevel: Number(b.gradeLevel) } })
        } catch (err) {
          if (err.code === 'admission.duplicate' && window.confirm(t('duplicateConfirm'))) {
            await api('/admissions', { method: 'POST', body: { ...b, gradeLevel: Number(b.gradeLevel), force: true } })
          } else throw err
        }
        await state.reload()
      },
    })
  return (
    <div>
      {dialog}
      <PageHeader
        title={t('admissionsTitle')}
        subtitle={`${t('academicYear')} ${d.year} · ${t('followUpsDue')}: ${d.followUpsDue}`}
        action={
          <Button onClick={newEnquiry}>
            <Plus size={16} /> {t('newEnquiry')}
          </Button>
        }
      />
      <Card className="mb-4 overflow-x-auto p-4">
        <div className="flex min-w-max items-center gap-2 text-xs">
          {FLOW.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                <p className="text-lg font-bold text-ink">{d.counts[s]}</p>
                <p className="text-muted">{t(`st_${s}`)}</p>
              </div>
              {i < FLOW.length - 1 && <span className="text-slate-300">→</span>}
            </div>
          ))}
          <span className="mx-2 h-10 w-px bg-slate-100" />
          {SIDE.map((s) => (
            <div key={s} className="rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-slate-500">{d.counts[s]}</p>
              <p className="text-muted">{t(`st_${s}`)}</p>
            </div>
          ))}
        </div>
      </Card>
      <Tabs
        value={status}
        onChange={setStatus}
        tabs={[{ key: '', label: `${t('all')} (${total})` }, ...[...FLOW, ...SIDE].map((s) => ({ key: s, label: `${t(`st_${s}`)} (${d.counts[s]})` }))]}
      />
      <Panel>
        <DataTable
          rows={d.applications}
          onRowClick={(r) => setSelected(r.id)}
          columns={[
            { key: 'childName', label: t('childName'), render: (r) => <span className="font-medium">{r.childName}</span> },
            { key: 'number', label: t('number'), render: (r) => <span className="text-xs text-muted">{r.number}</span> },
            { key: 'grade', label: t('grade'), render: (r) => r.gradeLevel },
            { key: 'guardian', label: t('guardian'), render: (r) => `${r.guardianName} · ${r.guardianMobile}` },
            { key: 'status', label: t('status'), render: (r) => <StatusPill status={r.status} /> },
            { key: 'updated', label: t('updated'), render: (r) => fmt(r.updatedAt, { day: 'numeric', month: 'short' }), hideOnPhone: true },
          ]}
        />
      </Panel>
      {selected && <Detail appId={selected} onClose={() => setSelected(null)} reload={state.reload} />}
    </div>
  )
}
