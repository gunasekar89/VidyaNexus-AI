import { useRef, useState } from 'react'
import { Bus, CreditCard, MapPin, Phone, Receipt as ReceiptIcon } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Card, Modal, PageHeader } from '../../components/ui'
import { Button, DataTable, Money, money, Note, Panel, Stat, StatusPill, fieldClass, toPaise, useDate } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'
import Receipt from './Receipt'

// The sandbox stands in for the payment gateway until the school connects a
// real one. The parent sees exactly the screens a real payment would show.
function PayOnline({ child, onClose, reload }) {
  const { t, errorText, showToast } = useApp()
  const key = useRef(`pay-${child.id}-${Date.now()}`)
  const [amount, setAmount] = useState(String(child.summary.duePaise / 100))
  const [order, setOrder] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const step = async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  const start = () =>
    step(async () => {
      const paise = toPaise(amount)
      if (Number.isNaN(paise) || paise <= 0) throw Object.assign(new Error('invalid.amount'), { code: 'invalid.amount' })
      setOrder(await api('/family/fees/checkout', { method: 'POST', body: { studentId: child.id, amountPaise: paise, idempotencyKey: key.current } }))
    })
  const pay = (outcome) =>
    step(async () => {
      const out = await api('/family/fees/sandbox-pay', { method: 'POST', body: { orderId: order.orderId, outcome } })
      setDone(out)
      if (out.status === 'captured') showToast(t('paymentReceived'))
      await reload()
    })
  return (
    <Modal open onClose={onClose} title={`${t('payOnline')} · ${child.name}`}>
      <div className="space-y-4">
        {!order && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t('amount')}</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400">₹</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${fieldClass} pl-7 tabular-nums`} />
              </div>
              <span className="mt-1 block text-xs text-muted">
                {t('dueNow')}: <Money paise={child.summary.duePaise} />. {t('payPartHint')}
              </span>
            </label>
            <Button className="w-full" busy={busy} onClick={start}>
              <CreditCard size={16} /> {t('continueToPay')}
            </Button>
          </>
        )}
        {order && !done && (
          <div className="space-y-3">
            <Note tone="amber">{t('sandboxNote')}</Note>
            <div className="rounded-2xl border border-slate-100 p-4 text-center">
              <p className="text-xs text-muted">{t('paying')}</p>
              <Money paise={order.amountPaise} className="text-2xl font-bold" />
              <p className="mt-1 text-xs text-muted">{order.orderId}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button tone="success" busy={busy} onClick={() => pay('success')}>
                {t('simulateSuccess')}
              </Button>
              <Button tone="danger" busy={busy} onClick={() => pay('failure')}>
                {t('simulateFailure')}
              </Button>
            </div>
          </div>
        )}
        {done && (
          <div className="space-y-3 text-center">
            <StatusPill status={done.status} />
            {done.status === 'captured' ? (
              <p className="text-sm">
                {t('paymentDone')} <span className="font-semibold">{done.receiptNo}</span>
              </p>
            ) : (
              <p className="text-sm text-rose-600">{t('paymentFailed')}</p>
            )}
            <Button tone="ghost" onClick={onClose}>
              {t('close')}
            </Button>
          </div>
        )}
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      </div>
    </Modal>
  )
}

export function FamilyFees() {
  const { t, tr, lang } = useApp()
  const fmt = useDate()
  const state = useApi('/family/fees')
  const [paying, setPaying] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const d = state.data
  if (!d) return <Loading state={state} />
  return (
    <div>
      <PageHeader title={t('feesTitle')} subtitle={t('familyFeesSub')} />
      {!d.children.length && <Card className="p-6 text-sm text-muted">{t('noFeeAccess')}</Card>}
      <div className="space-y-6">
        {d.children.map((c) => (
          <section key={c.id} className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-semibold text-ink">
                {tr(c.firstName)} {c.section && <span className="text-sm font-normal text-muted">· {tr(c.section)}</span>}
              </h2>
              {c.summary.duePaise > 0 && (
                <Button onClick={() => setPaying(c)}>
                  <CreditCard size={16} /> {t('payOnline')}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label={t('billed')} value={<Money paise={c.summary.billedPaise} />} />
              <Stat label={t('paid')} value={<Money paise={c.summary.paidPaise} />} tone="text-emerald-600" />
              <Stat label={t('dueNow')} value={<Money paise={c.summary.duePaise} />} tone={c.summary.overduePaise ? 'text-rose-600' : 'text-ink'} hint={c.summary.overduePaise ? `${t('overdue')}: ${money(c.summary.overduePaise, lang)}` : undefined} />
            </div>
            <Panel title={t('charges')}>
              <DataTable
                rows={c.demands.filter((x) => x.status !== 'cancelled')}
                columns={[
                  { key: 'head', label: t('feeHead'), render: (x) => <span className="font-medium">{tr(x.head)} <span className="text-xs text-muted">· {x.description}</span></span> },
                  { key: 'due', label: t('dueOn'), render: (x) => <span className={x.overdue ? 'font-semibold text-rose-600' : ''}>{fmt(x.dueOn)}</span> },
                  { key: 'amt', label: t('amount'), align: 'right', render: (x) => <Money paise={x.amountPaise - x.concessionPaise} /> },
                  { key: 'bal', label: t('balance'), align: 'right', render: (x) => <Money paise={x.balancePaise} /> },
                  { key: 'status', label: t('status'), render: (x) => <StatusPill status={x.overdue ? 'overdue' : x.status} /> },
                ]}
              />
            </Panel>
            <Panel title={t('receipts')}>
              <DataTable
                rows={c.payments}
                empty={t('noPaymentsYet')}
                onRowClick={(p) => p.receiptNo && setReceipt(p.id)}
                columns={[
                  { key: 'no', label: t('receiptNo'), render: (p) => <span className="inline-flex items-center gap-1.5 font-medium"><ReceiptIcon size={14} className="text-brand-600" /> {p.receiptNo}</span> },
                  { key: 'date', label: t('date'), render: (p) => fmt(p.receivedOn) },
                  { key: 'method', label: t('method'), render: (p) => t(`pm_${p.method}`) },
                  { key: 'amt', label: t('amount'), align: 'right', render: (p) => <Money paise={p.amountPaise} /> },
                  { key: 'status', label: t('status'), render: (p) => <StatusPill status={p.status} /> },
                ]}
              />
            </Panel>
          </section>
        ))}
      </div>
      {paying && <PayOnline child={paying} onClose={() => setPaying(null)} reload={state.reload} />}
      {receipt && <Receipt path={`/family/receipts/${receipt}`} onClose={() => setReceipt(null)} />}
    </div>
  )
}

const EVENT_ORDER = ['boarded', 'alighted', 'absent']

export function FamilyTransport() {
  const { t, tr } = useApp()
  const fmt = useDate()
  const state = useApi('/family/transport')
  const d = state.data
  if (!d) return <Loading state={state} />
  return (
    <div>
      <PageHeader title={t('transportTitle')} subtitle={t('familyTransportSub')} />
      <div className="grid gap-4 lg:grid-cols-2">
        {d.children.map((c) => (
          <Card key={c.id} className="p-5">
            <p className="mb-2 font-semibold text-ink">{tr(c.firstName)}</p>
            {!c.route ? (
              <p className="text-sm text-muted">{t('noSchoolTransport')}</p>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-2">
                  <Bus size={16} className="text-brand-600" /> {c.route.code} · {tr(c.route.name)} {c.route.vehicle && <span className="text-xs text-muted">· {c.route.vehicle}</span>}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin size={16} className="text-brand-600" /> {c.route.stop} · {t('pickupTime')} {c.route.pickupTime} · {t('dropTime')} {c.route.dropTime}
                </p>
                {c.route.driver && (
                  <p className="flex items-center gap-2 text-muted">
                    <Phone size={16} /> {t('driver')}: {c.route.driver}
                  </p>
                )}
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('today')}</p>
                  {!c.trips.length && <p className="text-xs text-muted">{t('noTripsYet')}</p>}
                  {c.trips.map((trip) => (
                    <div key={trip.direction} className="flex items-center justify-between gap-2 py-1">
                      <span>{t(`dir_${trip.direction}`)}</span>
                      <span className="text-right text-xs">
                        {trip.events.length
                          ? trip.events
                              .sort((a, b) => EVENT_ORDER.indexOf(a.event) - EVENT_ORDER.indexOf(b.event))
                              .map((e) => `${t(`te_${e.event}`)} ${fmt(e.at, { hour: '2-digit', minute: '2-digit' })}`)
                              .join(' · ')
                          : t(`st_${trip.status}`)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
