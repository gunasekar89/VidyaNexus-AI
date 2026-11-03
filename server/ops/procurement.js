// Purchasing, stores and assets: requisition → approval → purchase order →
// goods receipt (stock and assets) → supplier invoice matched against the order
// and the receipt → approval by someone else → payment. Plus stock issues,
// reorder alerts and the asset register.
import { audit, requirePerm } from '../access.js'
import { all, one, run, transaction } from '../db.js'
import { isoDate } from '../dates.js'
import { bad, id, notFound, required, text } from '../http.js'
import { conflict, date, fyPeriod, insertId, nextNumber, nextSeq, notSelf, notify, oneOf, paise, postJournal, schoolOf, usersWithPerm } from './common.js'

// Invoices within ₹1 of the received value count as matched (rounding).
const MATCH_TOLERANCE_PAISE = 100

const onHand = (itemId) => one('SELECT COALESCE(SUM(qty), 0) AS n FROM stock_moves WHERE item_id = ?', itemId).n

function itemRows(schoolId) {
  return all('SELECT * FROM items WHERE school_id = ? ORDER BY name', schoolId).map((i) => {
    const qty = onHand(i.id)
    return { id: i.id, sku: i.sku, name: i.name, unit: i.unit, kind: i.kind, reorderLevel: i.reorder_level, onHand: qty, reorder: i.kind === 'consumable' && qty <= i.reorder_level }
  })
}

function poLines(poId) {
  return all('SELECT l.*, i.name, i.sku, i.kind, i.unit FROM po_lines l JOIN items i ON i.id = l.item_id WHERE l.po_id = ? ORDER BY l.id', poId).map((l) => ({
    id: l.id, itemId: l.item_id, name: l.name, sku: l.sku, kind: l.kind, unit: l.unit, qty: l.qty, unitPaise: l.unit_paise, receivedQty: l.received_qty, valuePaise: l.qty * l.unit_paise,
  }))
}

// Value received on an order and not yet billed by a non-rejected invoice.
function unbilled(poId, exceptInvoice = 0) {
  const received = all('SELECT received_qty, unit_paise FROM po_lines WHERE po_id = ?', poId).reduce((s, l) => s + l.received_qty * l.unit_paise, 0)
  const billed = one("SELECT COALESCE(SUM(amount_paise), 0) AS n FROM vendor_invoices WHERE po_id = ? AND status != 'rejected' AND id != ?", poId, exceptInvoice).n
  return received - billed
}

export function registerProcurement(r) {
  const VIEW = ['procurement.request', 'procurement.approve', 'procurement.manage', 'stores.manage', 'assets.manage']

  r.get('/procurement', requirePerm(VIEW), (req, res) => {
    const s = schoolOf(req)
    res.json({
      can: Object.fromEntries(['procurement.request', 'procurement.approve', 'procurement.manage', 'stores.manage', 'assets.manage', 'accounts.post'].map((p) => [p, req.ctx.perms.has(p)])),
      vendors: all('SELECT * FROM vendors WHERE school_id = ? ORDER BY name', s).map((v) => ({ id: v.id, name: v.name, gstin: v.gstin, phone: v.phone, email: v.email, status: v.status })),
      items: itemRows(s),
      requisitions: all(
        `SELECT q.*, u.name AS requested_name, d.name AS decided_name FROM requisitions q JOIN users u ON u.id = q.requested_by LEFT JOIN users d ON d.id = q.decided_by
         WHERE q.school_id = ? ORDER BY q.status = 'submitted' DESC, q.id DESC LIMIT 100`,
        s,
      ).map((q) => ({
        id: q.id, number: q.number, purpose: q.purpose, status: q.status, estimatedPaise: q.estimated_paise, requestedBy: q.requested_name, decidedBy: q.decided_name ?? '', mine: q.requested_by === req.user.id, createdAt: q.created_at,
        lines: all('SELECT l.item_id, l.qty, l.est_unit_paise, i.name, i.unit FROM requisition_lines l JOIN items i ON i.id = l.item_id WHERE l.requisition_id = ?', q.id).map((l) => ({ itemId: l.item_id, name: l.name, unit: l.unit, qty: l.qty, estUnitPaise: l.est_unit_paise })),
      })),
      orders: all('SELECT o.*, v.name AS vendor FROM purchase_orders o JOIN vendors v ON v.id = o.vendor_id WHERE o.school_id = ? ORDER BY o.id DESC LIMIT 100', s).map((o) => {
        const lines = poLines(o.id)
        return { id: o.id, number: o.number, vendor: o.vendor, vendorId: o.vendor_id, status: o.status, createdAt: o.created_at, lines, totalPaise: lines.reduce((a, l) => a + l.valuePaise, 0), unbilledPaise: unbilled(o.id) }
      }),
      invoices: all(
        `SELECT i.*, v.name AS vendor, o.number AS po_number, u.name AS recorded_name, d.name AS decided_name FROM vendor_invoices i JOIN vendors v ON v.id = i.vendor_id
         LEFT JOIN purchase_orders o ON o.id = i.po_id JOIN users u ON u.id = i.recorded_by LEFT JOIN users d ON d.id = i.decided_by WHERE i.school_id = ? ORDER BY i.id DESC LIMIT 100`,
        s,
      ).map((i) => ({
        id: i.id, vendor: i.vendor, poNumber: i.po_number, invoiceNo: i.invoice_no, invoiceDate: i.invoice_date, amountPaise: i.amount_paise, matchedPaise: i.matched_paise, status: i.status, note: i.note,
        recordedBy: i.recorded_name, decidedBy: i.decided_name ?? '', mine: i.recorded_by === req.user.id,
      })),
    })
  })

  r.post('/procurement/vendors', requirePerm('procurement.manage'), (req, res) => {
    const s = schoolOf(req)
    const name = required(req.body.name, 120)
    if (one('SELECT 1 AS x FROM vendors WHERE school_id = ? AND name = ?', s, name)) throw conflict('duplicate')
    const gstin = text(req.body.gstin, 15).toUpperCase()
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) throw bad('invalid.gstin')
    const vid = insertId('INSERT INTO vendors (school_id, name, gstin, phone, email) VALUES (?, ?, ?, ?, ?)', s, name, gstin, text(req.body.phone, 20), text(req.body.email, 120))
    audit(req, 'procurement.vendor_added', { entityType: 'vendor', entityId: vid })
    res.status(201).json({ id: vid })
  })

  r.post('/procurement/items', requirePerm(['procurement.manage', 'stores.manage']), (req, res) => {
    const s = schoolOf(req)
    const sku = required(req.body.sku, 30).toUpperCase()
    if (one('SELECT 1 AS x FROM items WHERE school_id = ? AND sku = ?', s, sku)) throw conflict('duplicate')
    const level = Number(req.body.reorderLevel ?? 0)
    if (!Number.isInteger(level) || level < 0) throw bad('invalid.qty')
    const iid = insertId('INSERT INTO items (school_id, sku, name, unit, kind, reorder_level) VALUES (?, ?, ?, ?, ?, ?)', s, sku, required(req.body.name, 120), text(req.body.unit, 12) || 'nos', oneOf(req.body.kind ?? 'consumable', ['consumable', 'asset']), level)
    res.status(201).json({ id: iid })
  })

  const qty = (v) => {
    const n = Number(v)
    if (!Number.isInteger(n) || n <= 0 || n > 100000) throw bad('invalid.qty')
    return n
  }

  r.post('/procurement/requisitions', requirePerm('procurement.request'), (req, res) => {
    const s = schoolOf(req)
    const lines = Array.isArray(req.body.lines) ? req.body.lines : []
    if (!lines.length || lines.length > 30) throw bad('lines.required')
    const parsed = lines.map((l) => {
      const item = one('SELECT id FROM items WHERE id = ? AND school_id = ?', id(l.itemId), s)
      if (!item) throw bad('invalid.item')
      return { itemId: item.id, qty: qty(l.qty), est: l.estUnitPaise ? paise(l.estUnitPaise) : 0 }
    })
    const est = parsed.reduce((a, l) => a + l.qty * l.est, 0)
    const qid = transaction(() => {
      const q = insertId('INSERT INTO requisitions (school_id, number, purpose, requested_by, estimated_paise) VALUES (?, ?, ?, ?, ?)', s, nextNumber(s, 'REQ', fyPeriod(), 5), required(req.body.purpose, 200), req.user.id, est)
      for (const l of parsed) run('INSERT INTO requisition_lines (requisition_id, item_id, qty, est_unit_paise) VALUES (?, ?, ?, ?)', q, l.itemId, l.qty, l.est)
      return q
    })
    notify(s, usersWithPerm(s, 'procurement.approve').filter((u) => u !== req.user.id), {
      title: { en: 'Purchase request to approve', kn: 'ಅನುಮೋದಿಸಬೇಕಾದ ಖರೀದಿ ಕೋರಿಕೆ' },
      body: { en: req.body.purpose, kn: req.body.purpose },
      link: '/purchasing',
      source: `requisition:${qid}`,
      kind: 'approval',
    })
    audit(req, 'procurement.requisition_raised', { entityType: 'requisition', entityId: qid, detail: { estimatedPaise: est } })
    res.status(201).json({ id: qid })
  })

  r.post('/procurement/requisitions/:id/decide', requirePerm('procurement.approve'), (req, res) => {
    const s = schoolOf(req)
    const q = one('SELECT * FROM requisitions WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!q) throw notFound()
    if (q.status !== 'submitted') throw conflict('already.decided')
    notSelf(q.requested_by, req.user.id)
    const approve = req.body.approve === true
    run('UPDATE requisitions SET status = ?, decided_by = ? WHERE id = ?', approve ? 'approved' : 'rejected', req.user.id, q.id)
    notify(s, [q.requested_by], {
      title: approve ? { en: `${q.number} approved`, kn: `${q.number} ಅನುಮೋದಿಸಲಾಗಿದೆ` } : { en: `${q.number} not approved`, kn: `${q.number} ಅನುಮೋದಿಸಲಾಗಿಲ್ಲ` },
      link: '/purchasing',
      source: `requisition:${q.id}`,
    })
    audit(req, approve ? 'procurement.requisition_approved' : 'procurement.requisition_rejected', { entityType: 'requisition', entityId: q.id })
    res.json({ ok: true })
  })

  r.post('/procurement/orders', requirePerm('procurement.manage'), (req, res) => {
    const s = schoolOf(req)
    const vendor = one("SELECT * FROM vendors WHERE id = ? AND school_id = ? AND status = 'active'", id(req.body.vendorId), s)
    if (!vendor) throw bad('invalid.vendor')
    const reqId = req.body.requisitionId ? id(req.body.requisitionId) : null
    const q = reqId && one('SELECT * FROM requisitions WHERE id = ? AND school_id = ?', reqId, s)
    if (reqId && !q) throw notFound()
    if (q && q.status !== 'approved') throw conflict('requisition.not_approved')
    // Orders without a requisition need an approver's own hand.
    if (!q && !req.ctx.perms.has('procurement.approve')) throw conflict('requisition.required')
    const lines = (Array.isArray(req.body.lines) && req.body.lines.length ? req.body.lines : q ? all('SELECT item_id AS itemId, qty, est_unit_paise AS unitPaise FROM requisition_lines WHERE requisition_id = ?', q.id) : []).map((l) => {
      if (!one('SELECT 1 AS x FROM items WHERE id = ? AND school_id = ?', id(l.itemId), s)) throw bad('invalid.item')
      return { itemId: Number(l.itemId), qty: qty(l.qty), unit: paise(l.unitPaise, { allowZero: true }) }
    })
    if (!lines.length) throw bad('lines.required')
    const pid = transaction(() => {
      const po = insertId('INSERT INTO purchase_orders (school_id, number, vendor_id, requisition_id, created_by) VALUES (?, ?, ?, ?, ?)', s, nextNumber(s, 'PO', fyPeriod(), 5), vendor.id, q?.id ?? null, req.user.id)
      for (const l of lines) run('INSERT INTO po_lines (po_id, item_id, qty, unit_paise) VALUES (?, ?, ?, ?)', po, l.itemId, l.qty, l.unit)
      if (q) run("UPDATE requisitions SET status = 'ordered' WHERE id = ?", q.id)
      return po
    })
    audit(req, 'procurement.order_issued', { entityType: 'purchase_order', entityId: pid })
    res.status(201).json({ id: pid })
  })

  // Goods received (possibly part of the order). Consumables go into stock;
  // each unit of an asset item gets an asset tag.
  r.post('/procurement/orders/:id/receive', requirePerm(['procurement.manage', 'stores.manage']), (req, res) => {
    const s = schoolOf(req)
    const po = one('SELECT * FROM purchase_orders WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!po) throw notFound()
    if (!['issued', 'partially_received'].includes(po.status)) throw conflict('order.closed')
    const want = (Array.isArray(req.body.lines) ? req.body.lines : []).filter((l) => Number(l.qty) > 0)
    if (!want.length) throw bad('lines.required')
    const out = transaction(() => {
      const grn = nextNumber(s, 'GRN', fyPeriod(), 5)
      const gid = insertId('INSERT INTO goods_receipts (school_id, po_id, number, received_by) VALUES (?, ?, ?, ?)', s, po.id, grn, req.user.id)
      const assets = []
      for (const w of want) {
        const line = one('SELECT l.*, i.kind, i.name FROM po_lines l JOIN items i ON i.id = l.item_id WHERE l.id = ? AND l.po_id = ?', id(w.poLineId), po.id)
        if (!line) throw bad('invalid.line')
        const n = qty(w.qty)
        if (line.received_qty + n > line.qty) throw conflict('receipt.exceeds_order')
        run('UPDATE po_lines SET received_qty = received_qty + ? WHERE id = ?', n, line.id)
        run('INSERT INTO goods_receipt_lines (grn_id, po_line_id, qty) VALUES (?, ?, ?)', gid, line.id, n)
        if (line.kind === 'consumable') {
          run("INSERT INTO stock_moves (school_id, item_id, qty, kind, reference, moved_by) VALUES (?, ?, ?, 'receipt', ?, ?)", s, line.item_id, n, grn, req.user.id)
        } else {
          for (let k = 0; k < n; k++) {
            const tag = `AST-${String(nextSeq(s, 'AST', 'all')).padStart(5, '0')}`
            run("INSERT INTO assets (school_id, tag, name, item_id, location, purchase_date, cost_paise, status, source_ref) VALUES (?, ?, ?, ?, 'Stores', ?, ?, 'in_store', ?)", s, tag, line.name, line.item_id, isoDate(), line.unit_paise, grn)
            assets.push(tag)
          }
        }
      }
      const open = one('SELECT COUNT(*) AS n FROM po_lines WHERE po_id = ? AND received_qty < qty', po.id).n
      run('UPDATE purchase_orders SET status = ? WHERE id = ?', open ? 'partially_received' : 'received', po.id)
      return { id: gid, number: grn, assets }
    })
    audit(req, 'procurement.goods_received', { entityType: 'goods_receipt', entityId: out.id, detail: { po: po.number, assets: out.assets.length } })
    res.status(201).json(out)
  })

  // Three-way match: the invoice is compared with what was ordered and received.
  r.post('/procurement/invoices', requirePerm('procurement.manage'), (req, res) => {
    const s = schoolOf(req)
    const po = one('SELECT * FROM purchase_orders WHERE id = ? AND school_id = ?', id(req.body.poId), s)
    if (!po) throw notFound()
    const invoiceNo = required(req.body.invoiceNo, 40).toUpperCase()
    if (one('SELECT 1 AS x FROM vendor_invoices WHERE school_id = ? AND vendor_id = ? AND invoice_no = ?', s, po.vendor_id, invoiceNo)) throw conflict('invoice.duplicate')
    const amount = paise(req.body.amountPaise)
    const matchable = unbilled(po.id)
    const status = Math.abs(amount - matchable) <= MATCH_TOLERANCE_PAISE ? 'matched' : 'mismatch'
    const note = status === 'mismatch' ? (amount > matchable ? 'billed more than received' : 'billed less than received') : ''
    const iid = insertId(
      'INSERT INTO vendor_invoices (school_id, vendor_id, po_id, invoice_no, invoice_date, amount_paise, matched_paise, status, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      s, po.vendor_id, po.id, invoiceNo, date(req.body.invoiceDate), amount, matchable, status, note, req.user.id,
    )
    notify(s, usersWithPerm(s, 'procurement.approve').filter((u) => u !== req.user.id), {
      title: { en: `Supplier invoice to approve (${status})`, kn: `ಅನುಮೋದಿಸಬೇಕಾದ ಪೂರೈಕೆದಾರರ ಬಿಲ್ (${status === 'matched' ? 'ಹೊಂದಿಕೆಯಾಗಿದೆ' : 'ವ್ಯತ್ಯಾಸವಿದೆ'})` },
      link: '/purchasing',
      source: `invoice:${iid}`,
      kind: 'approval',
    })
    audit(req, 'procurement.invoice_recorded', { entityType: 'vendor_invoice', entityId: iid, detail: { status, amount, matchable } })
    res.status(201).json({ id: iid, status, matchedPaise: matchable })
  })

  // Approval posts the purchase to the books. A mismatched invoice needs a written reason.
  r.post('/procurement/invoices/:id/decide', requirePerm('procurement.approve'), (req, res) => {
    const s = schoolOf(req)
    const inv = one('SELECT * FROM vendor_invoices WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!inv) throw notFound()
    if (!['matched', 'mismatch'].includes(inv.status)) throw conflict('already.decided')
    notSelf(inv.recorded_by, req.user.id)
    const approve = req.body.approve === true
    const note = text(req.body.note, 300)
    if (approve && inv.status === 'mismatch' && note.length < 10) throw bad('reason.required')
    transaction(() => {
      run('UPDATE vendor_invoices SET status = ?, decided_by = ?, note = CASE WHEN ? != \'\' THEN ? ELSE note END WHERE id = ?', approve ? 'approved' : 'rejected', req.user.id, note, note, inv.id)
      if (approve) {
        const lines = poLines(inv.po_id)
        const recv = lines.reduce((a, l) => a + l.receivedQty * l.unitPaise, 0) || 1
        const assetPart = Math.round((inv.amount_paise * lines.filter((l) => l.kind === 'asset').reduce((a, l) => a + l.receivedQty * l.unitPaise, 0)) / recv)
        postJournal({
          schoolId: s,
          entryDate: isoDate(),
          narration: `Supplier invoice ${inv.invoice_no}`,
          source: 'purchase',
          sourceRef: `invoice:${inv.id}`,
          lines: [
            { account: '1300', debit: assetPart },
            { account: '5100', debit: inv.amount_paise - assetPart },
            { account: '2100', credit: inv.amount_paise },
          ],
          preparedBy: inv.recorded_by,
          approvedBy: req.user.id,
        })
      }
    })
    audit(req, approve ? 'procurement.invoice_approved' : 'procurement.invoice_rejected', { entityType: 'vendor_invoice', entityId: inv.id, detail: { note } })
    res.json({ ok: true })
  })

  r.post('/procurement/invoices/:id/pay', requirePerm('accounts.post'), (req, res) => {
    const s = schoolOf(req)
    const inv = one('SELECT * FROM vendor_invoices WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!inv) throw notFound()
    if (inv.status !== 'approved') throw conflict('invoice.not_approved')
    const reference = required(req.body.reference, 80)
    transaction(() => {
      run("UPDATE vendor_invoices SET status = 'paid' WHERE id = ?", inv.id)
      postJournal({
        schoolId: s,
        narration: `Paid supplier invoice ${inv.invoice_no} (${reference})`,
        source: 'purchase_payment',
        sourceRef: `invoice:${inv.id}`,
        lines: [
          { account: '2100', debit: inv.amount_paise },
          { account: '1010', credit: inv.amount_paise },
        ],
        preparedBy: req.user.id,
        approvedBy: inv.decided_by,
      })
    })
    audit(req, 'procurement.invoice_paid', { entityType: 'vendor_invoice', entityId: inv.id, detail: { reference } })
    res.json({ ok: true })
  })

  // ----- Stores -----

  r.post('/stores/issue', requirePerm('stores.manage'), (req, res) => {
    const s = schoolOf(req)
    const item = one("SELECT * FROM items WHERE id = ? AND school_id = ? AND kind = 'consumable'", id(req.body.itemId), s)
    if (!item) throw notFound()
    const n = qty(req.body.qty)
    if (n > onHand(item.id)) throw conflict('stock.insufficient')
    run("INSERT INTO stock_moves (school_id, item_id, qty, kind, reference, note, moved_by) VALUES (?, ?, ?, 'issue', ?, ?, ?)", s, item.id, -n, required(req.body.issuedTo, 80), text(req.body.note, 200), req.user.id)
    const left = onHand(item.id)
    if (left <= item.reorder_level) {
      notify(s, usersWithPerm(s, 'procurement.manage'), {
        title: { en: `Low stock: ${item.name} (${left} ${item.unit} left)`, kn: `ದಾಸ್ತಾನು ಕಡಿಮೆ: ${item.name} (${left} ${item.unit} ಉಳಿದಿದೆ)` },
        link: '/purchasing',
        source: `reorder:${item.id}:${isoDate()}`,
        kind: 'alert',
      })
    }
    audit(req, 'stores.issued', { entityType: 'item', entityId: item.id, detail: { qty: n, to: req.body.issuedTo } })
    res.json({ ok: true, onHand: left })
  })

  // Stock count corrections need a reason and are audited.
  r.post('/stores/adjust', requirePerm('stores.manage'), (req, res) => {
    const s = schoolOf(req)
    const item = one("SELECT * FROM items WHERE id = ? AND school_id = ? AND kind = 'consumable'", id(req.body.itemId), s)
    if (!item) throw notFound()
    const n = Number(req.body.qty)
    if (!Number.isInteger(n) || n === 0) throw bad('invalid.qty')
    if (onHand(item.id) + n < 0) throw conflict('stock.insufficient')
    const reason = required(req.body.reason, 200)
    run("INSERT INTO stock_moves (school_id, item_id, qty, kind, reference, note, moved_by) VALUES (?, ?, ?, ?, 'count', ?, ?)", s, item.id, n, n < 0 && req.body.writeOff ? 'write_off' : 'adjustment', reason, req.user.id)
    audit(req, 'stores.adjusted', { entityType: 'item', entityId: item.id, detail: { qty: n, reason } })
    res.json({ ok: true, onHand: onHand(item.id) })
  })

  r.get('/stores/moves', requirePerm(['stores.manage', 'procurement.manage']), (req, res) => {
    const s = schoolOf(req)
    res.json({
      moves: all('SELECT m.*, i.name, i.unit, u.name AS by_name FROM stock_moves m JOIN items i ON i.id = m.item_id LEFT JOIN users u ON u.id = m.moved_by WHERE m.school_id = ? ORDER BY m.id DESC LIMIT 100', s).map((m) => ({
        id: m.id, item: m.name, unit: m.unit, qty: m.qty, kind: m.kind, reference: m.reference, note: m.note, by: m.by_name, at: m.moved_at,
      })),
    })
  })

  // ----- Assets -----

  r.get('/assets', requirePerm(['assets.manage', 'procurement.manage', 'stores.manage']), (req, res) => {
    const s = schoolOf(req)
    const soon = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10)
    res.json({
      assets: all('SELECT a.*, u.name AS custodian FROM assets a LEFT JOIN users u ON u.id = a.custodian_user_id WHERE a.school_id = ? ORDER BY a.tag', s).map((a) => ({
        id: a.id, tag: a.tag, name: a.name, location: a.location, custodian: a.custodian ?? '', custodianId: a.custodian_user_id, purchaseDate: a.purchase_date, costPaise: a.cost_paise,
        warrantyUntil: a.warranty_until, warrantyEnding: Boolean(a.warranty_until && a.warranty_until >= isoDate() && a.warranty_until <= soon), status: a.status,
      })),
      staff: all("SELECT DISTINCT u.id, u.name FROM employees e JOIN users u ON u.id = e.user_id WHERE e.school_id = ? AND e.status = 'active' ORDER BY u.name", s),
    })
  })

  r.post('/assets', requirePerm('assets.manage'), (req, res) => {
    const s = schoolOf(req)
    const tag = text(req.body.tag, 20).toUpperCase() || `AST-${String(nextSeq(s, 'AST', 'all')).padStart(5, '0')}`
    if (one('SELECT 1 AS x FROM assets WHERE school_id = ? AND tag = ?', s, tag)) throw conflict('duplicate')
    const aid = insertId(
      'INSERT INTO assets (school_id, tag, name, location, purchase_date, cost_paise, warranty_until, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      s, tag, required(req.body.name, 120), text(req.body.location, 80), req.body.purchaseDate ? date(req.body.purchaseDate) : null, req.body.costPaise ? paise(req.body.costPaise) : 0,
      req.body.warrantyUntil ? date(req.body.warrantyUntil) : null, oneOf(req.body.status ?? 'in_use', ['in_use', 'in_store', 'under_repair', 'disposed']),
    )
    audit(req, 'assets.added', { entityType: 'asset', entityId: tag })
    res.status(201).json({ id: aid, tag })
  })

  r.patch('/assets/:id', requirePerm('assets.manage'), (req, res) => {
    const s = schoolOf(req)
    const a = one('SELECT * FROM assets WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!a) throw notFound()
    let custodian = a.custodian_user_id
    if (req.body.custodianId !== undefined) {
      custodian = req.body.custodianId ? id(req.body.custodianId) : null
      if (custodian && !one("SELECT 1 AS x FROM employees WHERE user_id = ? AND school_id = ? AND status = 'active'", custodian, s)) throw bad('invalid.custodian')
    }
    const status = req.body.status === undefined ? a.status : oneOf(req.body.status, ['in_use', 'in_store', 'under_repair', 'disposed'])
    const location = req.body.location === undefined ? a.location : text(req.body.location, 80)
    run('UPDATE assets SET custodian_user_id = ?, status = ?, location = ? WHERE id = ?', custodian, status, location, a.id)
    audit(req, 'assets.updated', { entityType: 'asset', entityId: a.tag, detail: { status, location, custodian } })
    res.json({ ok: true })
  })
}
