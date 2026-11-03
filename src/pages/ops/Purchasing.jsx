import { useState } from 'react'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../../AppContext'
import { api } from '../../api'
import { Modal, PageHeader } from '../../components/ui'
import { ActButton, Button, DataTable, Money, Panel, Stat, StatusPill, Tabs, fieldClass, toPaise, useDate, useDialog, useTab } from '../../components/ops'
import { Loading, useApi } from '../admin/Admin'

// Rows of item + quantity (+ price), used for requests and orders.
function LinesField({ items, lines, onChange, priceLabel }) {
  const { t } = useApp()
  const rows = lines?.length ? lines : [{ itemId: '', qty: '1', price: '' }]
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_4.5rem_6rem_auto] items-center gap-2">
          <select value={r.itemId} onChange={(e) => set(i, 'itemId', e.target.value)} className={fieldClass} aria-label={t('item')}>
            <option value="">{t('item')}</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name} ({it.unit})
              </option>
            ))}
          </select>
          <input inputMode="numeric" value={r.qty} onChange={(e) => set(i, 'qty', e.target.value)} className={`${fieldClass} tabular-nums`} aria-label={t('qty')} placeholder={t('qty')} />
          <input inputMode="decimal" value={r.price} onChange={(e) => set(i, 'price', e.target.value)} className={`${fieldClass} tabular-nums`} aria-label={priceLabel} placeholder={`₹ ${priceLabel}`} />
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600" aria-label={t('remove')}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <Button type="button" small tone="ghost" onClick={() => onChange([...rows, { itemId: '', qty: '1', price: '' }])}>
        <Plus size={14} /> {t('addLine')}
      </Button>
    </div>
  )
}

function parseLines(lines, priceKey) {
  const out = (lines ?? []).filter((l) => l.itemId)
  if (!out.length) throw new Error('local:err.lines.required')
  return out.map((l) => {
    const price = l.price === '' || l.price === undefined ? 0 : toPaise(l.price)
    if (Number.isNaN(price)) throw new Error('local:err.invalid.amount')
    return { itemId: Number(l.itemId), qty: Number(l.qty), [priceKey]: price }
  })
}

function Moves({ onClose }) {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi('/stores/moves')
  return (
    <Modal open onClose={onClose} title={t('stockMoves')} wide>
      {!state.data ? (
        <Loading state={state} />
      ) : (
        <DataTable
          rows={state.data.moves}
          columns={[
            { key: 'item', label: t('item'), render: (m) => <span className="font-medium">{m.item}</span> },
            { key: 'qty', label: t('qty'), align: 'right', render: (m) => <span className={m.qty < 0 ? 'text-rose-600' : 'text-emerald-600'}>{m.qty > 0 ? `+${m.qty}` : m.qty} {m.unit}</span> },
            { key: 'kind', label: t('type'), render: (m) => t(`mv_${m.kind}`) },
            { key: 'ref', label: t('reference'), render: (m) => `${m.reference}${m.note ? ` · ${m.note}` : ''}` },
            { key: 'at', label: t('date'), render: (m) => `${fmt(m.at)} · ${m.by ?? ''}` },
          ]}
        />
      )}
    </Modal>
  )
}

function Assets({ can }) {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi('/assets')
  const [dialog, open] = useDialog()
  if (!state.data) return <Loading state={state} />
  const statuses = ['in_use', 'in_store', 'under_repair', 'disposed'].map((s) => ({ value: s, label: t(`st_${s}`) }))
  const add = () =>
    open({
      title: t('addAsset'),
      wide: true,
      fields: [
        { key: 'name', label: t('name'), required: true },
        { key: 'tag', label: t('assetTag'), placeholder: t('autoIfBlank') },
        { key: 'location', label: t('location') },
        { key: 'costPaise', label: t('cost'), type: 'money' },
        { key: 'purchaseDate', label: t('purchaseDate'), type: 'date' },
        { key: 'warrantyUntil', label: t('warrantyUntil'), type: 'date' },
        { key: 'status', label: t('status'), type: 'select', required: true, options: statuses },
      ],
      initial: { status: 'in_use' },
      onSubmit: (b) => api('/assets', { method: 'POST', body: b }).then(state.reload),
    })
  const edit = (a) =>
    can['assets.manage'] &&
    open({
      title: `${a.tag} · ${a.name}`,
      initial: { location: a.location, custodianId: a.custodianId ? String(a.custodianId) : '', status: a.status },
      fields: [
        { key: 'location', label: t('location') },
        { key: 'custodianId', label: t('custodian'), type: 'select', options: state.data.staff.map((s) => ({ value: String(s.id), label: s.name })) },
        { key: 'status', label: t('status'), type: 'select', required: true, options: statuses },
      ],
      onSubmit: (b) => api(`/assets/${a.id}`, { method: 'PATCH', body: { ...b, custodianId: b.custodianId ? Number(b.custodianId) : null } }).then(state.reload),
    })
  return (
    <Panel
      title={t('assetRegister')}
      action={
        can['assets.manage'] && (
          <Button small onClick={add}>
            <Plus size={14} /> {t('addAsset')}
          </Button>
        )
      }
    >
      {dialog}
      <DataTable
        rows={state.data.assets}
        onRowClick={can['assets.manage'] ? edit : undefined}
        columns={[
          { key: 'tag', label: t('assetTag'), render: (a) => <span className="font-medium">{a.tag} · {a.name}</span> },
          { key: 'loc', label: t('location'), render: (a) => a.location || '—' },
          { key: 'cust', label: t('custodian'), render: (a) => a.custodian || '—' },
          { key: 'cost', label: t('cost'), align: 'right', render: (a) => <Money paise={a.costPaise} /> },
          { key: 'war', label: t('warrantyUntil'), hideOnPhone: true, render: (a) => <span className={a.warrantyEnding ? 'font-semibold text-amber-700' : ''}>{fmt(a.warrantyUntil)}</span> },
          { key: 'status', label: t('status'), render: (a) => <StatusPill status={a.status} /> },
        ]}
      />
    </Panel>
  )
}

export default function Purchasing() {
  const { t } = useApp()
  const fmt = useDate()
  const state = useApi('/procurement')
  const [dialog, open] = useDialog()
  const [moves, setMoves] = useState(false)
  const d = state.data
  const [tab, setTab] = useTab('requisitions')
  if (!d) return <Loading state={state} />
  const can = d.can
  const items = d.items
  const consumables = items.filter((i) => i.kind === 'consumable')
  const pendingReq = d.requisitions.filter((q) => q.status === 'submitted' && !q.mine).length
  const toApprove = d.invoices.filter((i) => ['matched', 'mismatch'].includes(i.status) && !i.mine).length
  const lowStock = consumables.filter((i) => i.reorder)
  const reload = state.reload

  const linesField = (priceLabel) => ({
    key: 'lines',
    label: t('items'),
    type: 'custom',
    wide: true,
    render: (form, set) => <LinesField items={items} lines={form.lines} onChange={(v) => set('lines', v)} priceLabel={priceLabel} />,
  })

  const newRequest = () =>
    open({
      title: t('newPurchaseRequest'),
      wide: true,
      intro: t('purchaseRequestNote'),
      fields: [{ key: 'purpose', label: t('purpose'), required: true, wide: true }, linesField(t('estUnitPrice'))],
      onSubmit: (b, form) => api('/procurement/requisitions', { method: 'POST', body: { purpose: b.purpose, lines: parseLines(form.lines, 'estUnitPaise') } }).then(reload),
    })
  const newOrder = (q) =>
    open({
      title: q ? `${q.number} · ${t('createOrder')}` : t('createOrder'),
      wide: true,
      intro: q ? q.purpose : t('directOrderNote'),
      initial: { lines: q ? q.lines.map((l) => ({ itemId: String(l.itemId), qty: String(l.qty), price: l.estUnitPaise ? String(l.estUnitPaise / 100) : '' })) : [] },
      fields: [{ key: 'vendorId', label: t('supplier'), type: 'select', required: true, wide: true, options: d.vendors.filter((v) => v.status === 'active').map((v) => ({ value: String(v.id), label: v.name })) }, linesField(t('unitPrice'))],
      submitLabel: t('issueOrder'),
      onSubmit: (b, form) => api('/procurement/orders', { method: 'POST', body: { vendorId: Number(b.vendorId), requisitionId: q?.id, lines: parseLines(form.lines, 'unitPaise') } }).then(reload),
    })
  const receive = (o) =>
    open({
      title: `${o.number} · ${t('receiveGoods')}`,
      intro: t('receiveNote'),
      initial: Object.fromEntries(o.lines.map((l) => [`l${l.id}`, String(l.qty - l.receivedQty)])),
      fields: o.lines
        .filter((l) => l.receivedQty < l.qty)
        .map((l) => ({ key: `l${l.id}`, label: `${l.name} (${l.receivedQty}/${l.qty} ${l.unit})${l.kind === 'asset' ? ` · ${t('taggedAsAsset')}` : ''}`, type: 'number', min: 0, max: l.qty - l.receivedQty })),
      submitLabel: t('receive'),
      onSubmit: (b) =>
        api(`/procurement/orders/${o.id}/receive`, { method: 'POST', body: { lines: o.lines.map((l) => ({ poLineId: l.id, qty: b[`l${l.id}`] ?? 0 })) } }).then(reload),
    })
  const recordInvoice = (o) =>
    open({
      title: `${o.number} · ${t('recordInvoice')}`,
      intro: (
        <span>
          {t('unbilledReceived')}: <Money paise={o.unbilledPaise} className="font-semibold text-ink" />. {t('matchNote')}
        </span>
      ),
      fields: [
        { key: 'invoiceNo', label: t('invoiceNo'), required: true },
        { key: 'invoiceDate', label: t('invoiceDate'), type: 'date', required: true },
        { key: 'amountPaise', label: t('amount'), type: 'money', required: true },
      ],
      onSubmit: (b) => api('/procurement/invoices', { method: 'POST', body: { ...b, poId: o.id } }).then(reload),
    })
  const decideInvoice = (inv, approve) =>
    open({
      title: `${inv.vendor} · ${inv.invoiceNo}`,
      intro:
        inv.status === 'mismatch' ? (
          <span className="text-rose-700">
            {t('invoiceMismatchNote')} <Money paise={inv.amountPaise} /> / <Money paise={inv.matchedPaise} />
          </span>
        ) : (
          t('invoiceMatchedNote')
        ),
      fields: [{ key: 'note', label: approve && inv.status === 'mismatch' ? t('reasonToApprove') : t('noteOptional'), type: 'textarea', required: approve && inv.status === 'mismatch' }],
      submitLabel: approve ? t('approve') : t('reject'),
      onSubmit: (b) => api(`/procurement/invoices/${inv.id}/decide`, { method: 'POST', body: { approve, note: b.note } }).then(reload),
    })
  const payInvoice = (inv) =>
    open({
      title: `${inv.vendor} · ${inv.invoiceNo}`,
      intro: (
        <span>
          {t('payFromBank')}: <Money paise={inv.amountPaise} className="font-semibold text-ink" />
        </span>
      ),
      fields: [{ key: 'reference', label: t('bankReference'), required: true }],
      submitLabel: t('markPaid'),
      onSubmit: (b) => api(`/procurement/invoices/${inv.id}/pay`, { method: 'POST', body: b }).then(reload),
    })
  const issue = (it) =>
    open({
      title: `${it.name} · ${t('issueStock')}`,
      intro: `${t('onHand')}: ${it.onHand} ${it.unit}`,
      fields: [
        { key: 'qty', label: t('qty'), type: 'number', min: 1, max: it.onHand, required: true },
        { key: 'issuedTo', label: t('issuedTo'), required: true, placeholder: t('issuedToHint') },
        { key: 'note', label: t('noteOptional') },
      ],
      submitLabel: t('issue'),
      onSubmit: (b) => api('/stores/issue', { method: 'POST', body: { ...b, itemId: it.id } }).then(reload),
    })
  const adjust = (it) =>
    open({
      title: `${it.name} · ${t('stockCount')}`,
      intro: `${t('onHand')}: ${it.onHand} ${it.unit}. ${t('adjustNote')}`,
      fields: [
        { key: 'qty', label: t('change'), type: 'number', required: true, hint: t('changeHint') },
        { key: 'reason', label: t('reason'), required: true },
        { key: 'writeOff', label: t('writeOff'), type: 'checkbox', hint: t('writeOffHint') },
      ],
      onSubmit: (b) => api('/stores/adjust', { method: 'POST', body: { ...b, itemId: it.id } }).then(reload),
    })
  const addItem = () =>
    open({
      title: t('addItem'),
      wide: true,
      initial: { kind: 'consumable', unit: 'nos', reorderLevel: '0' },
      fields: [
        { key: 'name', label: t('name'), required: true },
        { key: 'sku', label: t('sku'), required: true },
        { key: 'unit', label: t('unit'), required: true },
        { key: 'kind', label: t('type'), type: 'select', required: true, options: ['consumable', 'asset'].map((k) => ({ value: k, label: t(`ik_${k}`) })) },
        { key: 'reorderLevel', label: t('reorderLevel'), type: 'number', min: 0, show: (f) => f.kind === 'consumable' },
      ],
      onSubmit: (b) => api('/procurement/items', { method: 'POST', body: b }).then(reload),
    })
  const addVendor = () =>
    open({
      title: t('addSupplier'),
      fields: [
        { key: 'name', label: t('name'), required: true },
        { key: 'gstin', label: 'GSTIN', hint: t('gstinHint') },
        { key: 'phone', label: t('phone'), type: 'tel' },
        { key: 'email', label: t('email'), type: 'email' },
      ],
      onSubmit: (b) => api('/procurement/vendors', { method: 'POST', body: b }).then(reload),
    })

  const tabs = [
    { key: 'requisitions', label: t('purchaseRequests'), count: can['procurement.approve'] ? pendingReq : 0 },
    { key: 'orders', label: t('purchaseOrders') },
    { key: 'invoices', label: t('supplierInvoices'), count: can['procurement.approve'] ? toApprove : 0 },
    { key: 'stock', label: t('stock'), count: lowStock.length },
    { key: 'suppliers', label: t('suppliers') },
    { key: 'assets', label: t('assets') },
  ]

  return (
    <div>
      {dialog}
      <PageHeader
        title={t('purchasingTitle')}
        subtitle={t('purchasingSub')}
        action={
          can['procurement.request'] && (
            <Button onClick={newRequest}>
              <Plus size={16} /> {t('newPurchaseRequest')}
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('requestsWaiting')} value={d.requisitions.filter((q) => q.status === 'submitted').length} tone={pendingReq ? 'text-amber-600' : 'text-ink'} />
        <Stat label={t('ordersOpen')} value={d.orders.filter((o) => ['issued', 'partially_received'].includes(o.status)).length} />
        <Stat label={t('invoicesWaiting')} value={d.invoices.filter((i) => ['matched', 'mismatch'].includes(i.status)).length} tone={toApprove ? 'text-amber-600' : 'text-ink'} />
        <Stat label={t('itemsToReorder')} value={lowStock.length} tone={lowStock.length ? 'text-rose-600' : 'text-ink'} hint={lowStock.map((i) => i.name).join(', ')} />
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'requisitions' && (
        <Panel title={t('purchaseRequests')}>
          <DataTable
            rows={d.requisitions}
            columns={[
              { key: 'no', label: t('number'), render: (q) => <span className="font-medium">{q.number} · {q.purpose}</span> },
              { key: 'lines', label: t('items'), render: (q) => q.lines.map((l) => `${l.name} × ${l.qty}`).join(', ') },
              { key: 'est', label: t('estimate'), align: 'right', render: (q) => <Money paise={q.estimatedPaise} /> },
              { key: 'by', label: t('requestedBy'), hideOnPhone: true, render: (q) => `${q.requestedBy} · ${fmt(q.createdAt)}` },
              { key: 'status', label: t('status'), render: (q) => <StatusPill status={q.status} /> },
              {
                key: 'act',
                label: '',
                render: (q) => (
                  <span className="flex flex-wrap justify-end gap-1">
                    {q.status === 'submitted' && can['procurement.approve'] && !q.mine && (
                      <>
                        <ActButton path={`/procurement/requisitions/${q.id}/decide`} body={{ approve: true }} reload={reload} tone="success" okKey="approved">
                          {t('approve')}
                        </ActButton>
                        <ActButton path={`/procurement/requisitions/${q.id}/decide`} body={{ approve: false }} reload={reload} tone="danger" confirm="confirmReject" okKey="rejected">
                          {t('reject')}
                        </ActButton>
                      </>
                    )}
                    {q.status === 'submitted' && q.mine && <span className="text-xs text-muted">{t('waitingForOther')}</span>}
                    {q.status === 'approved' && can['procurement.manage'] && (
                      <Button small onClick={() => newOrder(q)}>
                        {t('createOrder')}
                      </Button>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </Panel>
      )}

      {tab === 'orders' && (
        <Panel
          title={t('purchaseOrders')}
          action={
            can['procurement.manage'] &&
            can['procurement.approve'] && (
              <Button small tone="ghost" onClick={() => newOrder(null)}>
                <Plus size={14} /> {t('directOrder')}
              </Button>
            )
          }
        >
          <DataTable
            rows={d.orders}
            columns={[
              { key: 'no', label: t('number'), render: (o) => <span className="font-medium">{o.number} · {o.vendor}</span> },
              { key: 'lines', label: t('items'), render: (o) => o.lines.map((l) => `${l.name} ${l.receivedQty}/${l.qty}`).join(', ') },
              { key: 'total', label: t('total'), align: 'right', render: (o) => <Money paise={o.totalPaise} /> },
              { key: 'unbilled', label: t('unbilled'), align: 'right', hideOnPhone: true, render: (o) => <Money paise={o.unbilledPaise} /> },
              { key: 'status', label: t('status'), render: (o) => <StatusPill status={o.status} /> },
              {
                key: 'act',
                label: '',
                render: (o) => (
                  <span className="flex flex-wrap justify-end gap-1">
                    {['issued', 'partially_received'].includes(o.status) && (can['procurement.manage'] || can['stores.manage']) && (
                      <Button small onClick={() => receive(o)}>
                        {t('receive')}
                      </Button>
                    )}
                    {o.unbilledPaise > 0 && can['procurement.manage'] && (
                      <Button small tone="ghost" onClick={() => recordInvoice(o)}>
                        {t('recordInvoice')}
                      </Button>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </Panel>
      )}

      {tab === 'invoices' && (
        <Panel title={t('supplierInvoices')}>
          <DataTable
            rows={d.invoices}
            columns={[
              { key: 'no', label: t('invoiceNo'), render: (i) => <span className="font-medium">{i.vendor} · {i.invoiceNo}</span> },
              { key: 'po', label: t('order'), hideOnPhone: true, render: (i) => `${i.poNumber ?? '—'} · ${fmt(i.invoiceDate)}` },
              { key: 'amt', label: t('amount'), align: 'right', render: (i) => <Money paise={i.amountPaise} /> },
              { key: 'match', label: t('received'), align: 'right', render: (i) => <Money paise={i.matchedPaise} /> },
              {
                key: 'status',
                label: t('status'),
                render: (i) => (
                  <span>
                    <StatusPill status={i.status} />
                    {i.note && <span className="mt-0.5 block text-xs text-muted">{i.note}</span>}
                  </span>
                ),
              },
              {
                key: 'act',
                label: '',
                render: (i) => (
                  <span className="flex flex-wrap justify-end gap-1">
                    {['matched', 'mismatch'].includes(i.status) && can['procurement.approve'] && !i.mine && (
                      <>
                        <Button small tone="success" onClick={() => decideInvoice(i, true)}>
                          {t('approve')}
                        </Button>
                        <Button small tone="danger" onClick={() => decideInvoice(i, false)}>
                          {t('reject')}
                        </Button>
                      </>
                    )}
                    {['matched', 'mismatch'].includes(i.status) && i.mine && <span className="text-xs text-muted">{t('waitingForOther')}</span>}
                    {i.status === 'approved' && can['accounts.post'] && (
                      <Button small onClick={() => payInvoice(i)}>
                        {t('pay')}
                      </Button>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </Panel>
      )}

      {tab === 'stock' && (
        <Panel
          title={t('stock')}
          action={
            <span className="flex gap-2">
              <Button small tone="ghost" onClick={() => setMoves(true)}>
                {t('stockMoves')}
              </Button>
              {(can['procurement.manage'] || can['stores.manage']) && (
                <Button small onClick={addItem}>
                  <Plus size={14} /> {t('addItem')}
                </Button>
              )}
            </span>
          }
        >
          <DataTable
            rows={items}
            columns={[
              {
                key: 'name',
                label: t('item'),
                render: (i) => (
                  <span className="font-medium">
                    {i.name} <span className="text-xs text-muted">· {i.sku}</span>
                  </span>
                ),
              },
              { key: 'kind', label: t('type'), render: (i) => t(`ik_${i.kind}`) },
              {
                key: 'qty',
                label: t('onHand'),
                align: 'right',
                render: (i) =>
                  i.kind === 'asset' ? (
                    '—'
                  ) : (
                    <span className={i.reorder ? 'inline-flex items-center gap-1 font-semibold text-rose-600' : ''}>
                      {i.reorder && <AlertTriangle size={14} />}
                      {i.onHand} {i.unit}
                    </span>
                  ),
              },
              { key: 'level', label: t('reorderLevel'), align: 'right', hideOnPhone: true, render: (i) => (i.kind === 'asset' ? '—' : i.reorderLevel) },
              {
                key: 'act',
                label: '',
                render: (i) =>
                  i.kind === 'consumable' &&
                  can['stores.manage'] && (
                    <span className="flex justify-end gap-1">
                      <Button small onClick={() => issue(i)} disabled={i.onHand <= 0}>
                        {t('issue')}
                      </Button>
                      <Button small tone="ghost" onClick={() => adjust(i)}>
                        {t('stockCount')}
                      </Button>
                    </span>
                  ),
              },
            ]}
          />
        </Panel>
      )}

      {tab === 'suppliers' && (
        <Panel
          title={t('suppliers')}
          action={
            can['procurement.manage'] && (
              <Button small onClick={addVendor}>
                <Plus size={14} /> {t('addSupplier')}
              </Button>
            )
          }
        >
          <DataTable
            rows={d.vendors}
            columns={[
              { key: 'name', label: t('name'), render: (v) => <span className="font-medium">{v.name}</span> },
              { key: 'gstin', label: 'GSTIN', render: (v) => v.gstin || '—' },
              { key: 'phone', label: t('phone'), render: (v) => v.phone || '—' },
              { key: 'email', label: t('email'), hideOnPhone: true, render: (v) => v.email || '—' },
            ]}
          />
        </Panel>
      )}

      {tab === 'assets' && <Assets can={can} />}
      {moves && <Moves onClose={() => setMoves(false)} />}
    </div>
  )
}
