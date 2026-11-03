import { useState } from 'react'
import { AlertTriangle, Bus, MapPin, Plus } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Card, Modal, PageHeader } from '../../components/ui'
import { ActButton, Button, DataTable, Money, Note, Panel, StatusPill, Tabs, useAction, useDate, useDialog, useTab } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'

function Riders({ route, onClose, reload }) {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi(`/transport/routes/${route.id}/riders`)
  return (
    <Modal open onClose={onClose} title={`${route.code} · ${t('riders')}`} wide>
      {!state.data ? (
        <Loading state={state} />
      ) : (
        <DataTable
          rows={state.data.riders}
          columns={[
            { key: 'name', label: t('student'), render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'stop', label: t('stop'), render: (r) => r.stop },
            { key: 'from', label: t('from'), render: (r) => fmt(r.from) },
            { key: 'consent', label: t('consentBy'), render: (r) => r.consentBy ?? '—' },
            {
              key: 'act',
              label: '',
              render: (r) => (
                <ActButton path={`/transport/allocations/${r.id}/end`} reload={() => state.reload().then(reload)} tone="danger" confirm="confirmEndTransport">
                  {t('endTransport')}
                </ActButton>
              ),
            },
          ]}
        />
      )}
    </Modal>
  )
}

export default function TransportAdmin() {
  const { t, tr } = useApp()
  const fmt = useDate()
  const state = useApi('/transport')
  const [tab, setTab] = useTab('routes')
  const [dialog, open] = useDialog()
  const [riders, setRiders] = useState(null)
  const d = state.data
  if (!d) return <Loading state={state} />
  const crew = (roles) => d.crew.filter((c) => roles.includes(c.role)).map((c) => ({ value: c.id, label: c.name }))
  const addRoute = () =>
    open({
      title: t('addRoute'),
      fields: [
        { key: 'code', label: t('code'), required: true, placeholder: 'R9' },
        { key: 'nameEn', label: t('nameEnglish'), required: true },
        { key: 'nameKn', label: t('nameKannada'), required: true },
        { key: 'monthlyFeePaise', label: t('monthlyFee'), type: 'money' },
      ],
      onSubmit: (b) => api('/transport/routes', { method: 'POST', body: b }).then(state.reload),
    })
  const assign = (r) =>
    open({
      title: `${r.code} · ${t('assignCrew')}`,
      initial: { vehicleId: r.vehicle?.id ?? '', driverId: r.driver?.id ?? '', attendantId: r.attendant?.id ?? '', monthlyFeePaise: String(r.monthlyFeePaise / 100) },
      fields: [
        { key: 'vehicleId', label: t('vehicle'), type: 'select', options: d.vehicles.map((v) => ({ value: v.id, label: `${v.regNo} · ${v.capacity} ${t('seats')}` })) },
        { key: 'driverId', label: t('driver'), type: 'select', options: crew(['driver', 'transport_manager']) },
        { key: 'attendantId', label: t('attendant'), type: 'select', options: crew(['attendant']) },
        { key: 'monthlyFeePaise', label: t('monthlyFee'), type: 'money' },
      ],
      onSubmit: (b) =>
        api(`/transport/routes/${r.id}`, {
          method: 'PATCH',
          body: { vehicleId: b.vehicleId ? Number(b.vehicleId) : null, driverId: b.driverId ? Number(b.driverId) : null, attendantId: b.attendantId ? Number(b.attendantId) : null, monthlyFeePaise: b.monthlyFeePaise ?? 0 },
        }).then(state.reload),
    })
  const addStop = (r) =>
    open({
      title: `${r.code} · ${t('addStop')}`,
      fields: [
        { key: 'name', label: t('stop'), required: true },
        { key: 'pickupTime', label: t('pickupTime'), type: 'time', required: true },
        { key: 'dropTime', label: t('dropTime'), type: 'time', required: true },
      ],
      onSubmit: (b) => api(`/transport/routes/${r.id}/stops`, { method: 'POST', body: b }).then(state.reload),
    })
  const allocate = (r) =>
    open({
      title: `${r.code} · ${t('addRider')}`,
      intro: t('allocateNote'),
      fields: [
        { key: 'student', label: t('student'), type: 'student', required: true, send: 'studentId' },
        { key: 'stopId', label: t('stop'), type: 'select', required: true, options: r.stops.map((s) => ({ value: s.id, label: `${s.name} · ${s.pickupTime}/${s.dropTime}` })) },
        {
          key: 'consentGuardianId',
          label: t('consentFrom'),
          type: 'custom',
          render: (form, set) => <GuardianSelect studentId={form.student?.id} value={form.consentGuardianId} onChange={(v) => set('consentGuardianId', v)} />,
        },
        { key: 'fromDate', label: t('from'), type: 'date' },
      ],
      onSubmit: (b, form) => {
        if (!form.consentGuardianId) throw new Error('local:consentRequired')
        return api('/transport/allocations', { method: 'POST', body: { studentId: b.studentId, routeId: r.id, stopId: Number(b.stopId), consentGuardianId: Number(form.consentGuardianId), fromDate: b.fromDate || undefined } }).then(state.reload)
      },
    })
  const addVehicle = () =>
    open({
      title: t('addVehicle'),
      fields: [
        { key: 'regNo', label: t('regNo'), required: true, placeholder: 'KA-01-AB-1234' },
        { key: 'capacity', label: t('seats'), type: 'number', min: 1, max: 100, required: true },
        { key: 'insuranceUntil', label: t('doc_insurance'), type: 'date' },
        { key: 'fitnessUntil', label: t('doc_fitness'), type: 'date' },
        { key: 'permitUntil', label: t('doc_permit'), type: 'date' },
      ],
      onSubmit: (b) => api('/transport/vehicles', { method: 'POST', body: b }).then(state.reload),
    })
  const editVehicle = (v) =>
    open({
      title: v.regNo,
      initial: { insuranceUntil: v.insuranceUntil ?? '', fitnessUntil: v.fitnessUntil ?? '', permitUntil: v.permitUntil ?? '', status: v.status },
      fields: [
        { key: 'insuranceUntil', label: t('doc_insurance'), type: 'date' },
        { key: 'fitnessUntil', label: t('doc_fitness'), type: 'date' },
        { key: 'permitUntil', label: t('doc_permit'), type: 'date' },
        { key: 'status', label: t('status'), type: 'select', required: true, options: ['active', 'maintenance', 'retired'].map((s) => ({ value: s, label: t(`vs_${s}`) })) },
      ],
      onSubmit: (b) => api(`/transport/vehicles/${v.id}`, { method: 'PATCH', body: b }).then(state.reload),
    })
  return (
    <div>
      {dialog}
      <PageHeader title={t('transportTitle')} subtitle={t('transportSub')} />
      {d.exceptions.length > 0 && (
        <Card className="mb-4 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-600">
            <AlertTriangle size={16} /> {t('needsAttention')}
          </p>
          <ul className="flex flex-wrap gap-2 text-xs">
            {d.exceptions.map((e, i) => (
              <li key={i} className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-700">
                {e.route}: {t(`tx_${e.kind}`)}{' '}
                <span className="text-rose-500">
                  {e.detail && `(${e.detail})`}
                  {e.direction && `(${t(`dir_${e.direction}`)})`}
                  {e.doc && `(${t(`doc_${e.doc}`)}${e.until ? ` ${fmt(e.until)}` : ''})`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'routes', label: t('routes') }, { key: 'vehicles', label: t('vehicles') }, { key: 'today', label: t('todaysTrips') }]} />
      {tab === 'routes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={addRoute}>
              <Plus size={16} /> {t('addRoute')}
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {d.routes.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">
                      {r.code} · {tr(r.name)}
                    </p>
                    <p className="text-xs text-muted">
                      {r.vehicle ? `${r.vehicle.regNo} · ` : ''}
                      {t('driver')}: {r.driver?.name ?? '—'} · {t('attendant')}: {r.attendant?.name ?? '—'}
                    </p>
                  </div>
                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${r.vehicle && r.riders > r.vehicle.capacity ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-ink'}`}>
                    {r.riders}/{r.vehicle?.capacity ?? '—'}
                  </span>
                </div>
                <ol className="mt-3 space-y-1 text-sm">
                  {r.stops.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <MapPin size={14} className="text-brand-500" />
                      <span className="flex-1">{s.name}</span>
                      <span className="text-xs text-muted">
                        {s.pickupTime} / {s.dropTime}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-muted">
                  {t('monthlyFee')}: <Money paise={r.monthlyFeePaise} />
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button small onClick={() => allocate(r)} disabled={!r.stops.length}>
                    {t('addRider')}
                  </Button>
                  <Button small tone="ghost" onClick={() => setRiders(r)}>
                    {t('riders')}
                  </Button>
                  <Button small tone="ghost" onClick={() => addStop(r)}>
                    {t('addStop')}
                  </Button>
                  <Button small tone="ghost" onClick={() => assign(r)}>
                    {t('assignCrew')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
      {tab === 'vehicles' && (
        <Panel
          title={t('vehicles')}
          action={
            <Button small onClick={addVehicle}>
              <Plus size={14} /> {t('addVehicle')}
            </Button>
          }
        >
          <DataTable
            rows={d.vehicles}
            onRowClick={editVehicle}
            columns={[
              { key: 'reg', label: t('regNo'), render: (v) => <span className="font-medium">{v.regNo}</span> },
              { key: 'cap', label: t('seats'), render: (v) => v.capacity },
              ...['insurance', 'fitness', 'permit'].map((doc) => ({
                key: doc,
                label: t(`doc_${doc}`),
                render: (v) => {
                  const f = v.documents.find((x) => x.doc === doc)
                  return <StatusPill status={f.state} label={f.until ? fmt(f.until) : t('st_missing')} />
                },
              })),
              { key: 'status', label: t('status'), render: (v) => t(`vs_${v.status}`) },
            ]}
          />
        </Panel>
      )}
      {tab === 'today' && (
        <Panel title={t('todaysTrips')}>
          <DataTable
            rows={d.trips}
            empty={t('noTripsYet')}
            columns={[
              { key: 'route', label: t('route'), render: (r) => <span className="font-medium">{r.route}</span> },
              { key: 'dir', label: t('direction'), render: (r) => t(`dir_${r.direction}`) },
              { key: 'board', label: t('onBoard'), render: (r) => `${r.onBoard} / ${r.riders.length}` },
              { key: 'gps', label: t('lastLocation'), render: (r) => (r.lastPing ? fmt(r.lastPing.at, { hour: '2-digit', minute: '2-digit' }) : '—') + (r.gpsStale ? ` · ${t('stale')}` : '') },
              { key: 'status', label: t('status'), render: (r) => <StatusPill status={r.status} /> },
            ]}
          />
        </Panel>
      )}
      {riders && <Riders route={riders} onClose={() => setRiders(null)} reload={state.reload} />}
    </div>
  )
}

function GuardianSelect({ studentId, value, onChange }) {
  const { t } = useApp()
  const state = useApi(studentId ? `/lookup/students/${studentId}/guardians` : null)
  if (!studentId) return <p className="text-sm text-muted">{t('pickStudentFirst')}</p>
  if (!state.data) return <p className="text-sm text-muted">…</p>
  if (!state.data.guardians.length) return <p className="text-sm text-rose-600">{t('noVerifiedGuardian')}</p>
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
      <option value="">{t('choose')}</option>
      {state.data.guardians.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name} ({t(`rel_${g.relationship}`)})
        </option>
      ))}
    </select>
  )
}

// ---------- Drivers and attendants ----------

export function Trips() {
  const { t, tr, showToast, errorText } = useApp()
  const state = useApi('/trips/today')
  const [dialog, open] = useDialog()
  const [run, busy] = useAction(state.reload)
  const d = state.data
  if (!d) return <Loading state={state} />
  const start = (route, direction) =>
    open({
      title: `${route.code} · ${t(`dir_${direction}`)}`,
      initial: { attendantPresent: true },
      fields: [{ key: 'attendantPresent', label: t('attendantOnBoard'), type: 'checkbox', hint: t('attendantHint') }],
      submitLabel: t('startTrip'),
      onSubmit: (b) => api('/trips', { method: 'POST', body: { routeId: route.id, direction, attendantPresent: b.attendantPresent } }).then(state.reload),
    })
  const mark = (trip, studentId, event) => run(() => api(`/trips/${trip.id}/events`, { method: 'POST', body: { studentId, event } }), null)
  const ping = (trip) => {
    const send = (lat, lng) => run(() => api(`/trips/${trip.id}/gps`, { method: 'POST', body: { lat, lng } }), 'locationSent')
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => send(p.coords.latitude, p.coords.longitude), () => send(12.9279, 77.5937), { timeout: 5000 })
    else send(12.9279, 77.5937)
  }
  const close = async (trip) => {
    try {
      await api(`/trips/${trip.id}/close`, { method: 'POST', body: {} })
      await state.reload()
    } catch (err) {
      if (err.code !== 'trip.unaccounted') return showToast(errorText(err))
      open({
        title: t('closeTrip'),
        intro: <span className="text-rose-700">{t('unaccountedNote')}</span>,
        fields: [{ key: 'note', label: t('whatHappened'), type: 'textarea', required: true, hint: t('noteAlertsManager') }],
        submitLabel: t('closeWithNote'),
        onSubmit: (b) => api(`/trips/${trip.id}/close`, { method: 'POST', body: b }).then(state.reload),
      })
    }
  }
  return (
    <div>
      {dialog}
      <PageHeader title={t('myTrips')} subtitle={t('myTripsSub')} />
      {!d.routes.length && <Card className="p-6 text-sm text-muted">{t('noRoutesAssigned')}</Card>}
      <div className="space-y-4">
        {d.routes.map((route) => (
          <Card key={route.id} className="p-5">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <Bus size={18} className="text-brand-600" /> {route.code} · {tr(route.name)}
            </p>
            <p className="text-xs text-muted">
              {route.vehicle?.regNo} · {route.manifest.length} {t('ridersLower')}
            </p>
            {['to_school', 'to_home'].map((dir) => {
              const trip = route.trips.find((x) => x.direction === dir)
              if (!trip)
                return (
                  <div key={dir} className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                    <span className="text-sm">{t(`dir_${dir}`)}</span>
                    <Button small onClick={() => start(route, dir)}>
                      {t('startTrip')}
                    </Button>
                  </div>
                )
              return (
                <div key={dir} className="mt-4 rounded-2xl border border-slate-100 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {t(`dir_${dir}`)} <StatusPill status={trip.status} />
                    </span>
                    {trip.status === 'started' && (
                      <div className="flex gap-2">
                        <Button small tone="ghost" busy={busy} onClick={() => ping(trip)}>
                          <MapPin size={14} /> {t('sendLocation')}
                        </Button>
                        <Button small tone="success" onClick={() => close(trip)}>
                          {t('closeTrip')}
                        </Button>
                      </div>
                    )}
                  </div>
                  {!trip.attendantPresent && <Note tone="rose">{t('noAttendantWarning')}</Note>}
                  {trip.gpsStale && trip.status === 'started' && <p className="mb-2 text-xs text-amber-700">{t('gpsStaleHint')}</p>}
                  <ul className="divide-y divide-slate-50">
                    {trip.riders.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span>
                          <span className="font-medium">{s.name}</span> <span className="text-xs text-muted">· {s.stop} {s.time}</span>
                        </span>
                        {trip.status === 'started' ? (
                          <span className="flex gap-1">
                            {!s.boarded && !s.absent && (
                              <>
                                <Button small onClick={() => mark(trip, s.id, 'boarded')}>
                                  {t('boarded')}
                                </Button>
                                <Button small tone="ghost" onClick={() => mark(trip, s.id, 'absent')}>
                                  {t('absentBtn')}
                                </Button>
                              </>
                            )}
                            {s.boarded && !s.alighted && (
                              <Button small tone="success" onClick={() => mark(trip, s.id, 'alighted')}>
                                {t('droppedOff')}
                              </Button>
                            )}
                            {s.alighted && <StatusPill status="ok" label={t('droppedOff')} />}
                            {s.absent && <StatusPill status="closed" label={t('absentBtn')} />}
                          </span>
                        ) : (
                          <StatusPill status={s.alighted ? 'ok' : s.absent ? 'closed' : 'failed'} label={s.alighted ? t('droppedOff') : s.absent ? t('absentBtn') : t('notConfirmed')} />
                        )}
                      </li>
                    ))}
                  </ul>
                  {trip.closingNote && <p className="mt-2 text-xs text-muted">{trip.closingNote}</p>}
                </div>
              )
            })}
          </Card>
        ))}
      </div>
    </div>
  )
}
