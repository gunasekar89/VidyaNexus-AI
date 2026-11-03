import { useState } from 'react'
import { LogOut, Plus, ShieldAlert, UserCheck } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Modal, PageHeader } from '../../components/ui'
import { ActButton, Button, DataTable, Note, Panel, Stat, StatusPill, Tabs, fieldClass, opts, useDate, useDialog, useTab } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'

// Releasing a child: pick an approved guardian, or (with permission) record an override.
function Release({ pickup, canOverride, onClose, reload }) {
  const { t, tr, errorText, showToast } = useApp()
  const state = useApi(`/lookup/students/${pickup.studentId}/guardians`)
  const [guardianId, setGuardianId] = useState('')
  const [override, setOverride] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const d = state.data
  const approved = d?.guardians.filter((g) => g.canPickup) ?? []
  const others = d?.guardians.filter((g) => !g.canPickup) ?? []
  const submit = async () => {
    setError(null)
    if (!override && !guardianId) return setError(t('pickGuardian'))
    if (override && reason.trim().length < 10) return setError(t('overrideReasonShort'))
    setBusy(true)
    try {
      await api(`/reception/pickups/${pickup.id}/release`, { method: 'POST', body: override ? { override: true, overrideReason: reason } : { guardianId: Number(guardianId) } })
      showToast(t('released'))
      await reload()
      onClose()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`${t('releaseChild')} · ${pickup.student}`}>
      {!d ? (
        <Loading state={state} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p>
              <span className="text-muted">{t('pickupPerson')}:</span> <span className="font-medium">{pickup.pickupName}</span>
            </p>
            <p>
              <span className="text-muted">{t('reason')}:</span> {pickup.reason}
            </p>
            {pickup.section && <p className="text-xs text-muted">{tr(pickup.section)}</p>}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">{t('approvedForPickup')}</p>
            {!approved.length && <p className="text-sm text-rose-600">{t('noApprovedPickup')}</p>}
            <div className="space-y-2">
              {approved.map((g) => (
                <label key={g.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${String(g.id) === guardianId && !override ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                  <input
                    type="radio"
                    name="guardian"
                    checked={String(g.id) === guardianId && !override}
                    onChange={() => {
                      setGuardianId(String(g.id))
                      setOverride(false)
                    }}
                  />
                  <span className="flex-1">
                    <span className="font-medium">{g.name}</span> <span className="text-muted">({t(`rel_${g.relationship}`)})</span>
                    {g.mobileEnd && <span className="block text-xs text-muted">{t('mobileEnding')} {g.mobileEnd}</span>}
                  </span>
                  <UserCheck size={16} className="text-emerald-600" />
                </label>
              ))}
            </div>
            {others.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                {t('notApprovedPickup')}: {others.map((g) => `${g.name}${g.restriction ? ` (${g.restriction})` : ''}`).join(', ')}
              </p>
            )}
            <p className="mt-2 text-xs text-muted">{t('checkIdHint')}</p>
          </div>
          <div className="rounded-xl border border-amber-200 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5" disabled={!canOverride} />
              <span>
                <span className="font-medium">{t('overrideRelease')}</span>
                <span className="block text-xs text-muted">{canOverride ? t('overrideHint') : t('overrideNoPerm')}</span>
              </span>
            </label>
            {override && <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={t('overrideReason')} className={`${fieldClass} mt-2 h-auto py-2`} />}
          </div>
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button tone="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button tone={override ? 'danger' : 'success'} busy={busy} onClick={submit}>
              {override ? t('releaseOverride') : t('release')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function Reception() {
  const { t, tr, showToast } = useApp()
  const fmt = useDate()
  const time = (s) => fmt(s, { hour: '2-digit', minute: '2-digit' })
  const state = useApi('/reception')
  const [tab, setTab] = useTab('visitors')
  const [dialog, open] = useDialog()
  const [release, setRelease] = useState(null)
  const d = state.data
  if (!d) return <Loading state={state} />
  const checkIn = () =>
    open({
      title: t('checkInVisitor'),
      wide: true,
      initial: { kind: 'visitor' },
      fields: [
        { key: 'name', label: t('name'), required: true },
        { key: 'mobile', label: t('mobile'), type: 'tel' },
        { key: 'kind', label: t('type'), type: 'select', required: true, options: opts(['visitor', 'parent', 'contractor', 'delivery', 'official'], t, 'vk_') },
        { key: 'host', label: t('toMeet') },
        { key: 'purpose', label: t('purpose'), required: true, wide: true },
      ],
      submitLabel: t('issuePass'),
      onSubmit: (b) =>
        api('/reception/visitors', { method: 'POST', body: b }).then((out) => {
          showToast(`${t('passNo')} ${out.passNo}`)
          return state.reload()
        }),
    })
  const newPickup = () =>
    open({
      title: t('earlyPickup'),
      intro: t('earlyPickupNote'),
      fields: [
        { key: 'student', label: t('student'), type: 'student', required: true, send: 'studentId' },
        { key: 'pickupName', label: t('pickupPerson'), required: true },
        { key: 'reason', label: t('reason'), required: true },
      ],
      onSubmit: (b) => api('/reception/pickups', { method: 'POST', body: b }).then(state.reload),
    })
  const waiting = d.pickups.filter((p) => p.status === 'waiting').length
  return (
    <div>
      {dialog}
      <PageHeader
        title={t('receptionTitle')}
        subtitle={t('receptionSub')}
        action={
          <div className="flex gap-2">
            <Button tone="ghost" onClick={newPickup}>
              {t('earlyPickup')}
            </Button>
            <Button onClick={checkIn}>
              <Plus size={16} /> {t('checkInVisitor')}
            </Button>
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label={t('onSiteNow')} value={d.onSite} />
        <Stat label={t('pickupsWaiting')} value={waiting} tone={waiting ? 'text-amber-600' : 'text-ink'} />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'visitors', label: t('visitors') },
          { key: 'pickups', label: t('earlyPickups'), count: waiting },
        ]}
      />
      {tab === 'visitors' && (
        <Panel title={t('visitorLog')}>
          <DataTable
            rows={d.visitors}
            columns={[
              { key: 'name', label: t('name'), render: (v) => <span className="font-medium">{v.name} <span className="text-xs text-muted">· {v.passNo}</span></span> },
              { key: 'kind', label: t('type'), render: (v) => t(`vk_${v.kind}`) },
              { key: 'purpose', label: t('purpose'), render: (v) => `${v.purpose}${v.host ? ` · ${v.host}` : ''}` },
              { key: 'in', label: t('inOut'), render: (v) => `${time(v.in)} – ${v.out ? time(v.out) : t('onSite')}` },
              {
                key: 'act',
                label: '',
                render: (v) =>
                  !v.out && (
                    <ActButton path={`/reception/visitors/${v.id}/checkout`} reload={state.reload} okKey="checkedOut">
                      <LogOut size={14} /> {t('checkOut')}
                    </ActButton>
                  ),
              },
            ]}
          />
        </Panel>
      )}
      {tab === 'pickups' && (
        <div className="space-y-4">
          <Note tone="blue">
            <ShieldAlert size={16} className="mr-1 inline" /> {t('pickupRule')}
          </Note>
          <Panel title={t('earlyPickups')}>
            <DataTable
              rows={d.pickups}
              columns={[
                { key: 'student', label: t('student'), render: (p) => <span className="font-medium">{p.student} {p.section && <span className="text-xs text-muted">· {tr(p.section)}</span>}</span> },
                { key: 'who', label: t('pickupPerson'), render: (p) => p.pickupName },
                { key: 'reason', label: t('reason'), render: (p) => p.reason },
                {
                  key: 'status',
                  label: t('status'),
                  render: (p) => (
                    <span>
                      <StatusPill status={p.status} />
                      {p.verification === 'override' && <span className="mt-0.5 block text-xs text-rose-600">{t('overrideUsed')}: {p.overrideReason}</span>}
                      {p.releasedAt && <span className="block text-xs text-muted">{time(p.releasedAt)} · {p.decidedBy}</span>}
                    </span>
                  ),
                },
                {
                  key: 'act',
                  label: '',
                  render: (p) =>
                    p.status === 'waiting' && (
                      <span className="flex justify-end gap-1">
                        <Button small tone="success" onClick={() => setRelease(p)}>
                          {t('release')}
                        </Button>
                        <ActButton path={`/reception/pickups/${p.id}/refuse`} reload={state.reload} tone="danger" confirm="confirmRefusePickup" okKey="refused">
                          {t('refuse')}
                        </ActButton>
                      </span>
                    ),
                },
              ]}
            />
          </Panel>
        </div>
      )}
      {release && <Release pickup={release} canOverride={d.canOverride} onClose={() => setRelease(null)} reload={state.reload} />}
    </div>
  )
}
