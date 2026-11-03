// Fees: heads, plans and instalments, demands, concessions, payments with
// receipts, refunds, a gateway-ready webhook and the parent view.
//
// Money is integer paise. Every money movement posts a balanced journal, keyed
// by its source so that retries and duplicate webhooks never double-count.
import crypto from 'node:crypto'
import { audit, requirePerm } from '../access.js'
import { all, one, run, transaction } from '../db.js'
import { isoDate } from '../dates.js'
import { HttpError, bad, forbidden, id, notFound, required, text } from '../http.js'
import {
  ayPeriod,
  childrenFor,
  conflict,
  date,
  guardiansOf,
  insertId,
  nextNumber,
  notSelf,
  notify,
  oneOf,
  paise,
  postJournal,
  queueOutbox,
  schoolOf,
  studentOf,
  usersWithPerm,
  yearOf,
} from './common.js'

export const HEAD_KINDS = ['tuition', 'admission', 'annual', 'exam', 'activity', 'transport', 'hostel', 'meal', 'library', 'other']
export const OFFLINE_METHODS = ['cash', 'cheque', 'upi', 'card', 'netbanking', 'bank_transfer']
const CONCESSION_KINDS = ['sibling', 'scholarship', 'staff_child', 'merit', 'hardship', 'other']

const incomeAccount = (kind) => (kind === 'tuition' ? '4000' : kind === 'transport' ? '4010' : '4020')
const moneyAccount = (method) => (method === 'cash' ? '1000' : method === 'gateway' ? '1020' : '1010')

// ---------- Balances ----------

const DEMAND_ROWS = `
  SELECT d.*, h.code AS head_code, h.name_en AS head_en, h.name_kn AS head_kn, h.kind AS head_kind,
         COALESCE((SELECT SUM(a.amount_paise) FROM payment_allocations a WHERE a.demand_id = d.id), 0) AS paid_paise
  FROM fee_demands d JOIN fee_heads h ON h.id = d.head_id`

const withBalance = (d) => ({ ...d, balance_paise: d.amount_paise - d.concession_paise - d.paid_paise })

export function studentDemands(schoolId, studentId, { includeCancelled = false } = {}) {
  return all(`${DEMAND_ROWS} WHERE d.school_id = ? AND d.student_user_id = ? ${includeCancelled ? '' : "AND d.status = 'open'"} ORDER BY d.due_on, d.id`, schoolId, studentId).map(withBalance)
}

function paymentAvailable(paymentId) {
  return one(
    `SELECT p.amount_paise
       - COALESCE((SELECT SUM(amount_paise) FROM payment_allocations WHERE payment_id = p.id), 0)
       - COALESCE((SELECT SUM(amount_paise) FROM fee_refunds WHERE payment_id = p.id AND status != 'rejected'), 0) AS n
     FROM payments p WHERE p.id = ?`,
    paymentId,
  ).n
}

export function demandView(d, today = isoDate()) {
  return {
    id: d.id,
    head: { en: d.head_en, kn: d.head_kn },
    headKind: d.head_kind,
    description: d.description,
    installmentNo: d.installment_no,
    dueOn: d.due_on,
    amountPaise: d.amount_paise,
    concessionPaise: d.concession_paise,
    paidPaise: d.paid_paise,
    balancePaise: d.balance_paise,
    status: d.status === 'cancelled' ? 'cancelled' : d.balance_paise <= 0 ? 'paid' : d.paid_paise > 0 ? 'part_paid' : 'due',
    overdue: d.status === 'open' && d.balance_paise > 0 && d.due_on < today,
    source: d.source,
  }
}

function summary(demands, today = isoDate()) {
  const open = demands.filter((d) => d.status === 'open')
  return {
    billedPaise: open.reduce((s, d) => s + d.amount_paise - d.concession_paise, 0),
    paidPaise: open.reduce((s, d) => s + d.paid_paise, 0),
    duePaise: open.reduce((s, d) => s + Math.max(d.balance_paise, 0), 0),
    overduePaise: open.filter((d) => d.due_on < today).reduce((s, d) => s + Math.max(d.balance_paise, 0), 0),
  }
}

// ---------- Demands and concessions ----------

function applyConcession(schoolId, d, percent, concessionId, by) {
  const target = Math.floor((d.amount_paise * percent) / 100)
  const paid = one('SELECT COALESCE(SUM(amount_paise), 0) AS n FROM payment_allocations WHERE demand_id = ?', d.id).n
  const next = Math.min(target, d.amount_paise - paid)
  const delta = next - d.concession_paise
  if (delta <= 0) return 0
  run('UPDATE fee_demands SET concession_paise = ? WHERE id = ?', next, d.id)
  postJournal({
    schoolId,
    narration: `Concession on ${d.description}`,
    source: 'fee_demand',
    sourceRef: `concession:${concessionId}:${d.id}`,
    lines: [
      { account: '5300', debit: delta },
      { account: '1100', credit: delta },
    ],
    preparedBy: by,
  })
  return delta
}

// Raises one demand. Returns null when the same demand already exists.
export function createDemand({ schoolId, studentId, yearId, headId, installmentNo = 1, description, dueOn, amount, source = 'plan', sourceRef = '', by = null }) {
  const r = run(
    `INSERT OR IGNORE INTO fee_demands (school_id, student_user_id, academic_year_id, head_id, installment_no, description, due_on, amount_paise, source, source_ref, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    schoolId, studentId, yearId, headId, installmentNo, description, dueOn, amount, source, sourceRef, by,
  )
  if (!r.changes) return null
  const demandId = Number(r.lastInsertRowid)
  const head = one('SELECT * FROM fee_heads WHERE id = ?', headId)
  postJournal({
    schoolId,
    narration: `Fee demand: ${head.name_en} – ${description}`,
    source: 'fee_demand',
    sourceRef: `demand:${demandId}`,
    lines: [
      { account: '1100', debit: amount },
      { account: incomeAccount(head.kind), credit: amount },
    ],
    preparedBy: by,
  })
  const c = one(
    `SELECT id, percent FROM fee_concessions WHERE school_id = ? AND student_user_id = ? AND academic_year_id = ? AND status = 'approved'
       AND (head_id IS NULL OR head_id = ?) ORDER BY percent DESC LIMIT 1`,
    schoolId, studentId, yearId, headId,
  )
  if (c) applyConcession(schoolId, one('SELECT * FROM fee_demands WHERE id = ?', demandId), c.percent, c.id, by)
  return demandId
}

// Raises the year's plan for one student (safe to repeat).
export function generateForStudent(schoolId, studentId, by = null) {
  const year = yearOf(schoolId)
  const st = studentOf(schoolId, studentId)
  const items = all(
    `SELECT p.*, h.name_en FROM fee_plan_items p JOIN fee_heads h ON h.id = p.head_id
     WHERE p.school_id = ? AND p.academic_year_id = ? AND p.grade_level = ? ORDER BY p.due_on, p.id`,
    schoolId, year.id, st.grade_level,
  )
  let created = 0
  for (const it of items) {
    const ok = createDemand({
      schoolId, studentId, yearId: year.id, headId: it.head_id, installmentNo: it.installment_no,
      description: it.label || `${it.name_en} ${it.installment_no}`, dueOn: it.due_on, amount: it.amount_paise, by,
    })
    if (ok) created++
  }
  if (created) applyCredit(schoolId, studentId, by)
  return created
}

// Cancels a demand: income and receivable come off, and anything already paid
// against it becomes credit (advance) for the family.
export function cancelDemand(schoolId, demandId, by, reason) {
  const d = one(`${DEMAND_ROWS} WHERE d.id = ? AND d.school_id = ?`, demandId, schoolId)
  if (!d) throw notFound()
  if (d.status !== 'open') throw conflict('demand.not_open')
  const net = d.amount_paise - d.concession_paise - d.paid_paise
  run("UPDATE fee_demands SET status = 'cancelled' WHERE id = ?", d.id)
  run('DELETE FROM payment_allocations WHERE demand_id = ?', d.id)
  postJournal({
    schoolId,
    narration: `Demand cancelled: ${d.description} (${reason})`,
    source: 'fee_demand',
    sourceRef: `cancel:${d.id}`,
    lines: [
      { account: incomeAccount(d.head_kind), debit: d.amount_paise },
      { account: '5300', credit: d.concession_paise },
      { account: '2000', credit: d.paid_paise },
      { account: '1100', credit: net },
    ],
    preparedBy: by,
  })
  return d
}

// ---------- Payments ----------

// Allocates a payment's unused money to the oldest dues first.
function allocateFrom(schoolId, payment) {
  let left = paymentAvailable(payment.id)
  const out = []
  for (const d of studentDemands(schoolId, payment.student_user_id)) {
    if (left <= 0) break
    if (d.balance_paise <= 0) continue
    const amt = Math.min(left, d.balance_paise)
    run(
      `INSERT INTO payment_allocations (payment_id, demand_id, amount_paise) VALUES (?, ?, ?)
       ON CONFLICT (payment_id, demand_id) DO UPDATE SET amount_paise = amount_paise + excluded.amount_paise`,
      payment.id, d.id, amt,
    )
    out.push({ demandId: d.id, amount: amt })
    left -= amt
  }
  return out.reduce((s, a) => s + a.amount, 0)
}

// Uses any credit the family has (advance payments) against open dues.
export function applyCredit(schoolId, studentId, by = null) {
  let used = 0
  for (const p of all("SELECT * FROM payments WHERE school_id = ? AND student_user_id = ? AND status = 'captured' ORDER BY id", schoolId, studentId)) {
    if (paymentAvailable(p.id) <= 0) continue
    const amt = allocateFrom(schoolId, p)
    if (!amt) continue
    used += amt
    postJournal({
      schoolId,
      narration: `Advance applied from ${p.receipt_no}`,
      source: 'fee_payment',
      sourceRef: `credit:${p.id}:${crypto.randomUUID()}`,
      lines: [
        { account: '2000', debit: amt },
        { account: '1100', credit: amt },
      ],
      preparedBy: by,
    })
  }
  return used
}

// Marks a payment captured, numbers its receipt, allocates it and posts it.
function capture(p, by) {
  const schoolId = p.school_id
  const receiptNo = p.receipt_no ?? nextNumber(schoolId, 'RCPT', ayPeriod(schoolId))
  run("UPDATE payments SET status = 'captured', receipt_no = ? WHERE id = ?", receiptNo, p.id)
  const allocated = allocateFrom(schoolId, p)
  postJournal({
    schoolId,
    entryDate: p.received_on,
    narration: `Fee receipt ${receiptNo}`,
    source: 'fee_payment',
    sourceRef: `payment:${p.id}`,
    lines: [
      { account: moneyAccount(p.method), debit: p.amount_paise },
      { account: '1100', credit: allocated },
      { account: '2000', credit: p.amount_paise - allocated },
    ],
    preparedBy: by,
  })
  const st = one('SELECT name FROM users WHERE id = ?', p.student_user_id)
  const rupees = (p.amount_paise / 100).toLocaleString('en-IN')
  notify(schoolId, guardiansOf(schoolId, p.student_user_id, 'can_view_fees').map((g) => g.guardian_user_id), {
    title: { en: `Payment received: ₹${rupees}`, kn: `ಪಾವತಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ: ₹${rupees}` },
    body: { en: `Receipt ${receiptNo} for ${st.name}.`, kn: `${st.name} ಅವರಿಗೆ ರಸೀದಿ ${receiptNo}.` },
    link: '/fees',
    source: `payment:${p.id}`,
    kind: 'fees',
  })
  return { receiptNo, allocated, advance: p.amount_paise - allocated }
}

// Used by the demo seed: captures a counter payment exactly as the counter does.
export const captureCounterPayment = (paymentId, by) => capture(one('SELECT * FROM payments WHERE id = ?', paymentId), by)

export function receiptOf(schoolId, paymentId) {
  const p = one(
    `SELECT p.*, u.name AS student_name, r.name AS received_by_name FROM payments p JOIN users u ON u.id = p.student_user_id
     LEFT JOIN users r ON r.id = p.received_by WHERE p.id = ? AND p.school_id = ? AND p.receipt_no IS NOT NULL`,
    paymentId, schoolId,
  )
  if (!p) throw notFound()
  const school = one('SELECT name_en, name_kn, code FROM schools WHERE id = ?', schoolId)
  const enr = one(
    `SELECT e.admission_no, sec.label_en, sec.label_kn FROM enrollments e JOIN sections sec ON sec.id = e.section_id
     WHERE e.school_id = ? AND e.student_user_id = ? ORDER BY e.id DESC LIMIT 1`,
    schoolId, p.student_user_id,
  )
  const lines = all(
    `SELECT a.amount_paise, d.description, d.due_on, h.name_en, h.name_kn FROM payment_allocations a
     JOIN fee_demands d ON d.id = a.demand_id JOIN fee_heads h ON h.id = d.head_id WHERE a.payment_id = ? ORDER BY d.due_on`,
    p.id,
  )
  const refunded = one("SELECT COALESCE(SUM(amount_paise), 0) AS n FROM fee_refunds WHERE payment_id = ? AND status = 'paid'", p.id).n
  return {
    id: p.id,
    receiptNo: p.receipt_no,
    date: p.received_on,
    amountPaise: p.amount_paise,
    method: p.method,
    reference: p.reference,
    status: p.status,
    receivedBy: p.received_by_name ?? '',
    school: { name: { en: school.name_en, kn: school.name_kn }, code: school.code },
    student: { name: p.student_name, admissionNo: enr?.admission_no ?? '', section: enr ? { en: enr.label_en, kn: enr.label_kn } : null },
    lines: lines.map((l) => ({ head: { en: l.name_en, kn: l.name_kn }, description: l.description, dueOn: l.due_on, amountPaise: l.amount_paise })),
    advancePaise: p.status === 'captured' ? paymentAvailable(p.id) : 0,
    refundedPaise: refunded,
  }
}

const paymentView = (p) => ({
  id: p.id,
  receiptNo: p.receipt_no,
  amountPaise: p.amount_paise,
  method: p.method,
  reference: p.reference,
  status: p.status,
  receivedOn: p.received_on,
  settlement: p.settlement_status,
  reconciled: Boolean(p.reconciled_at),
  availablePaise: p.status === 'captured' ? paymentAvailable(p.id) : 0,
})

// ---------- Gateway ----------

const gatewayMode = () => (process.env.PAYMENT_GATEWAY && process.env.PAYMENT_GATEWAY !== 'sandbox' ? 'live' : 'sandbox')
function webhookSecret() {
  if (process.env.PAYMENT_WEBHOOK_SECRET) return process.env.PAYMENT_WEBHOOK_SECRET
  return gatewayMode() === 'sandbox' ? 'sandbox-webhook-secret' : null
}
export const signPayload = (raw, secret = webhookSecret()) => crypto.createHmac('sha256', secret).update(raw).digest('hex')
function signatureOk(raw, sig) {
  const secret = webhookSecret()
  if (!secret || typeof sig !== 'string') return false
  const want = Buffer.from(signPayload(raw, secret))
  const got = Buffer.from(sig)
  return want.length === got.length && crypto.timingSafeEqual(want, got)
}

// Processes one gateway event. Redelivered events (same id) change nothing;
// events that don't line up with what we expect become exceptions for a person.
export function handleGatewayEvent(raw, signature) {
  let evt
  try {
    evt = JSON.parse(raw)
  } catch {
    return { status: 400, result: 'invalid' }
  }
  if (!signatureOk(raw, signature)) {
    run('INSERT INTO gateway_events (event_id, type, signature_ok, payload, result) VALUES (?, ?, 0, ?, ?)', `unverified:${crypto.randomUUID()}`, String(evt?.type ?? '').slice(0, 60), raw.slice(0, 5000), 'rejected:signature')
    return { status: 401, result: 'rejected:signature' }
  }
  const eventId = typeof evt.id === 'string' ? evt.id.slice(0, 120) : ''
  if (!eventId) return { status: 400, result: 'invalid' }
  if (one('SELECT 1 AS x FROM gateway_events WHERE event_id = ?', eventId)) return { status: 200, result: 'duplicate' }
  return transaction(() => {
    const data = evt.data ?? {}
    let result = 'ignored:type'
    let schoolId = null
    if (evt.type === 'payment.captured' || evt.type === 'payment.failed') {
      const p = one('SELECT * FROM payments WHERE gateway_order_id = ?', String(data.order_id ?? ''))
      if (!p) result = 'exception:unknown_order'
      else {
        schoolId = p.school_id
        if (evt.type === 'payment.failed') {
          if (p.status === 'initiated') {
            run("UPDATE payments SET status = 'failed' WHERE id = ?", p.id)
            result = 'failed'
          } else result = `ignored:already_${p.status}`
        } else if (p.status === 'captured') result = 'ignored:already_captured'
        else if (Number(data.amount) !== p.amount_paise) result = 'exception:amount_mismatch'
        else if (p.status === 'initiated' || p.status === 'failed') {
          run('UPDATE payments SET gateway_payment_id = ?, received_on = ? WHERE id = ?', String(data.payment_id ?? '') || null, isoDate(), p.id)
          capture(one('SELECT * FROM payments WHERE id = ?', p.id), null)
          // A "failed" that arrives before "captured" is normal on real gateways.
          result = p.status === 'failed' ? 'captured_after_failure' : 'captured'
        } else result = `exception:payment_${p.status}`
      }
    } else if (evt.type === 'settlement.processed') {
      let n = 0
      const missing = []
      for (const item of Array.isArray(data.items) ? data.items : []) {
        const p = one('SELECT * FROM payments WHERE gateway_payment_id = ?', String(item.payment_id ?? ''))
        if (!p || p.status !== 'captured') {
          missing.push(item.payment_id)
          continue
        }
        schoolId = p.school_id
        if (p.settlement_status === 'settled') continue
        const fee = Math.max(0, Math.min(Number(item.fee) || 0, p.amount_paise))
        run("UPDATE payments SET settlement_status = 'settled', settlement_ref = ?, settled_at = datetime('now') WHERE id = ?", String(data.settlement_id ?? ''), p.id)
        postJournal({
          schoolId,
          narration: `Gateway settlement ${data.settlement_id ?? ''} for ${p.receipt_no}`,
          source: 'settlement',
          sourceRef: `settle:${p.id}`,
          lines: [
            { account: '1010', debit: p.amount_paise - fee },
            { account: '5200', debit: fee },
            { account: '1020', credit: p.amount_paise },
          ],
        })
        n++
      }
      result = missing.length ? `exception:settlement_unmatched:${missing.slice(0, 5).join(',')}` : `settled:${n}`
    }
    run('INSERT INTO gateway_events (school_id, event_id, type, signature_ok, payload, result) VALUES (?, ?, ?, 1, ?, ?)', schoolId, eventId, String(evt.type ?? '').slice(0, 60), raw.slice(0, 5000), result)
    return { status: 200, result }
  })
}

// ---------- Routes ----------

const studentRows = (schoolId) => {
  const year = yearOf(schoolId)
  const students = all(
    `SELECT u.id, u.name, e.admission_no, sec.label_en, sec.label_kn FROM enrollments e JOIN users u ON u.id = e.student_user_id
     JOIN sections sec ON sec.id = e.section_id WHERE e.school_id = ? AND e.academic_year_id = ? AND e.status = 'active' ORDER BY sec.label_en, u.name`,
    schoolId, year.id,
  )
  const demands = all(`${DEMAND_ROWS} WHERE d.school_id = ? AND d.status = 'open'`, schoolId).map(withBalance)
  const by = new Map()
  for (const d of demands) by.set(d.student_user_id, [...(by.get(d.student_user_id) ?? []), d])
  return students.map((s) => ({ id: s.id, name: s.name, admissionNo: s.admission_no, section: { en: s.label_en, kn: s.label_kn }, ...summary(by.get(s.id) ?? []), demands: by.get(s.id) ?? [] }))
}

export function registerFees(r) {
  r.get('/fees/overview', requirePerm('fees.view'), (req, res) => {
    const s = schoolOf(req)
    const today = isoDate()
    const rows = studentRows(s)
    const tot = (k) => rows.reduce((a, x) => a + x[k], 0)
    const todayByMethod = all("SELECT method, SUM(amount_paise) AS n, COUNT(*) AS c FROM payments WHERE school_id = ? AND status = 'captured' AND received_on = ? GROUP BY method", s, today)
    res.json({
      billedPaise: tot('billedPaise'),
      collectedPaise: tot('paidPaise'),
      duePaise: tot('duePaise'),
      overduePaise: tot('overduePaise'),
      overdueStudents: rows.filter((r) => r.overduePaise > 0).length,
      advancePaise: all("SELECT id FROM payments WHERE school_id = ? AND status = 'captured'", s).reduce((a, p) => a + paymentAvailable(p.id), 0),
      today: { totalPaise: todayByMethod.reduce((a, m) => a + m.n, 0), byMethod: todayByMethod.map((m) => ({ method: m.method, amountPaise: m.n, count: m.c })) },
      pending: {
        concessions: one("SELECT COUNT(*) AS n FROM fee_concessions WHERE school_id = ? AND status = 'pending'", s).n,
        refunds: one("SELECT COUNT(*) AS n FROM fee_refunds WHERE school_id = ? AND status IN ('requested', 'approved')", s).n,
        exceptions: one("SELECT COUNT(*) AS n FROM gateway_events WHERE school_id = ? AND result LIKE 'exception:%'", s).n,
        unreconciled: one("SELECT COUNT(*) AS n FROM payments WHERE school_id = ? AND status = 'captured' AND method IN ('cheque', 'bank_transfer') AND reconciled_at IS NULL", s).n,
      },
      gateway: gatewayMode(),
    })
  })

  r.get('/fees/setup', requirePerm('fees.view'), (req, res) => {
    const s = schoolOf(req)
    const year = yearOf(s)
    res.json({
      year: year.label,
      heads: all('SELECT * FROM fee_heads WHERE school_id = ? ORDER BY code', s).map((h) => ({ id: h.id, code: h.code, name: { en: h.name_en, kn: h.name_kn }, kind: h.kind, refundable: Boolean(h.refundable) })),
      plan: all(
        `SELECT p.*, h.name_en, h.name_kn FROM fee_plan_items p JOIN fee_heads h ON h.id = p.head_id
         WHERE p.school_id = ? AND p.academic_year_id = ? ORDER BY p.grade_level, p.due_on, h.code`,
        s, year.id,
      ).map((p) => ({ id: p.id, gradeLevel: p.grade_level, head: { en: p.name_en, kn: p.name_kn }, headId: p.head_id, installmentNo: p.installment_no, label: p.label, dueOn: p.due_on, amountPaise: p.amount_paise })),
      grades: all('SELECT level, name_en, name_kn FROM grades WHERE school_id = ? ORDER BY level', s).map((g) => ({ level: g.level, name: { en: g.name_en, kn: g.name_kn } })),
      headKinds: HEAD_KINDS,
    })
  })

  r.post('/fees/heads', requirePerm('fees.configure'), (req, res) => {
    const s = schoolOf(req)
    const code = required(req.body.code, 12).toUpperCase()
    if (one('SELECT 1 AS x FROM fee_heads WHERE school_id = ? AND code = ?', s, code)) throw conflict('duplicate')
    const hid = insertId(
      'INSERT INTO fee_heads (school_id, code, name_en, name_kn, kind, refundable) VALUES (?, ?, ?, ?, ?, ?)',
      s, code, required(req.body.nameEn, 80), required(req.body.nameKn, 80), oneOf(req.body.kind, HEAD_KINDS), req.body.refundable ? 1 : 0,
    )
    audit(req, 'fees.head_created', { entityType: 'fee_head', entityId: hid })
    res.status(201).json({ id: hid })
  })

  r.post('/fees/plan', requirePerm('fees.configure'), (req, res) => {
    const s = schoolOf(req)
    const year = yearOf(s)
    const head = one('SELECT * FROM fee_heads WHERE id = ? AND school_id = ?', id(req.body.headId), s)
    if (!head) throw notFound()
    const grade = Number(req.body.gradeLevel)
    if (!one('SELECT 1 AS x FROM grades WHERE school_id = ? AND level = ?', s, grade)) throw bad('invalid.grade')
    const inst = Number(req.body.installmentNo) || 1
    if (one('SELECT 1 AS x FROM fee_plan_items WHERE academic_year_id = ? AND grade_level = ? AND head_id = ? AND installment_no = ?', year.id, grade, head.id, inst)) throw conflict('duplicate')
    const pid = insertId(
      'INSERT INTO fee_plan_items (school_id, academic_year_id, grade_level, head_id, installment_no, label, due_on, amount_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      s, year.id, grade, head.id, inst, text(req.body.label, 60), date(req.body.dueOn), paise(req.body.amountPaise),
    )
    audit(req, 'fees.plan_item_added', { entityType: 'fee_plan_item', entityId: pid, detail: { grade, head: head.code, amount: req.body.amountPaise } })
    res.status(201).json({ id: pid })
  })

  r.delete('/fees/plan/:id', requirePerm('fees.configure'), (req, res) => {
    const s = schoolOf(req)
    const p = one('SELECT * FROM fee_plan_items WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!p) throw notFound()
    run('DELETE FROM fee_plan_items WHERE id = ?', p.id)
    audit(req, 'fees.plan_item_removed', { entityType: 'fee_plan_item', entityId: p.id })
    res.json({ ok: true })
  })

  // Raises the plan for every enrolled student (or one class level). Safe to repeat.
  r.post('/fees/generate', requirePerm('fees.configure'), (req, res) => {
    const s = schoolOf(req)
    const year = yearOf(s)
    const grade = req.body.gradeLevel ? Number(req.body.gradeLevel) : null
    const students = all(
      `SELECT e.student_user_id FROM enrollments e JOIN sections sec ON sec.id = e.section_id JOIN grades g ON g.id = sec.grade_id
       WHERE e.school_id = ? AND e.academic_year_id = ? AND e.status = 'active' ${grade ? 'AND g.level = ?' : ''}`,
      ...[s, year.id, ...(grade ? [grade] : [])],
    )
    const created = transaction(() => students.reduce((n, st) => n + generateForStudent(s, st.student_user_id, req.user.id), 0))
    audit(req, 'fees.demands_generated', { detail: { grade, created, students: students.length } })
    res.json({ created, students: students.length })
  })

  r.get('/fees/students', requirePerm('fees.view'), (req, res) => {
    const s = schoolOf(req)
    const q = text(req.query.q, 60).toLowerCase()
    const rows = studentRows(s).filter((r) => !q || r.name.toLowerCase().includes(q) || r.admissionNo.toLowerCase().includes(q))
    res.json({ students: rows.map(({ demands, ...r }) => r) })
  })

  r.get('/fees/students/:id', requirePerm('fees.view'), (req, res) => {
    const s = schoolOf(req)
    const st = studentOf(s, id(req.params.id))
    const demands = studentDemands(s, st.id, { includeCancelled: true })
    res.json({
      student: { id: st.id, name: st.name, admissionNo: st.admission_no, section: { en: st.section_en, kn: st.section_kn }, gradeLevel: st.grade_level },
      summary: summary(demands),
      demands: demands.map((d) => demandView(d)),
      payments: all('SELECT * FROM payments WHERE school_id = ? AND student_user_id = ? AND status != ? ORDER BY id DESC', s, st.id, 'initiated').map(paymentView),
      creditPaise: all("SELECT id FROM payments WHERE school_id = ? AND student_user_id = ? AND status = 'captured'", s, st.id).reduce((a, p) => a + paymentAvailable(p.id), 0),
      concessions: all(
        `SELECT c.*, h.name_en, h.name_kn, r.name AS requested_name, d.name AS decided_name FROM fee_concessions c LEFT JOIN fee_heads h ON h.id = c.head_id
         JOIN users r ON r.id = c.requested_by LEFT JOIN users d ON d.id = c.decided_by WHERE c.school_id = ? AND c.student_user_id = ? ORDER BY c.id DESC`,
        s, st.id,
      ).map((c) => ({ id: c.id, kind: c.kind, percent: c.percent, head: c.name_en ? { en: c.name_en, kn: c.name_kn } : null, reason: c.reason, status: c.status, requestedBy: c.requested_name, decidedBy: c.decided_name })),
      refunds: all('SELECT f.*, p.receipt_no FROM fee_refunds f JOIN payments p ON p.id = f.payment_id WHERE f.school_id = ? AND f.student_user_id = ? ORDER BY f.id DESC', s, st.id).map((f) => ({
        id: f.id, receiptNo: f.receipt_no, amountPaise: f.amount_paise, reason: f.reason, status: f.status,
      })),
      guardians: guardiansOf(s, st.id).map((g) => ({ name: g.name, relationship: g.relationship, canViewFees: Boolean(g.can_view_fees) })),
    })
  })

  // Counter payment (cash, cheque, UPI, card, bank transfer). The idempotency
  // key makes a double-click or a retry return the first receipt.
  r.post('/fees/payments', requirePerm('fees.collect'), (req, res) => {
    const s = schoolOf(req)
    const key = text(req.body.idempotencyKey, 80) || null
    if (key) {
      const dup = one('SELECT * FROM payments WHERE idempotency_key = ? AND school_id = ?', key, s)
      if (dup) return res.json({ paymentId: dup.id, receiptNo: dup.receipt_no, repeated: true })
    }
    const st = studentOf(s, id(req.body.studentId))
    const method = oneOf(req.body.method, OFFLINE_METHODS, 'invalid.method')
    const reference = text(req.body.reference, 80)
    if (method !== 'cash' && !reference) throw bad('reference.required')
    const receivedOn = req.body.receivedOn ? date(req.body.receivedOn) : isoDate()
    if (receivedOn > isoDate()) throw bad('invalid.date')
    const out = transaction(() => {
      const pid = insertId(
        `INSERT INTO payments (school_id, student_user_id, amount_paise, method, reference, status, idempotency_key, settlement_status, received_by, received_on)
         VALUES (?, ?, ?, ?, ?, 'initiated', ?, 'not_applicable', ?, ?)`,
        s, st.id, paise(req.body.amountPaise), method, reference, key, req.user.id, receivedOn,
      )
      return { paymentId: pid, ...capture(one('SELECT * FROM payments WHERE id = ?', pid), req.user.id) }
    })
    audit(req, 'fees.payment_recorded', { entityType: 'payment', entityId: out.paymentId, detail: { receipt: out.receiptNo, method, amount: req.body.amountPaise } })
    res.status(201).json(out)
  })

  r.get('/fees/payments', requirePerm('fees.view'), (req, res) => {
    const s = schoolOf(req)
    const rows = all(
      `SELECT p.*, u.name FROM payments p JOIN users u ON u.id = p.student_user_id WHERE p.school_id = ? AND p.status != 'initiated'
       ORDER BY p.id DESC LIMIT 200`,
      s,
    )
    res.json({ payments: rows.map((p) => ({ ...paymentView(p), student: p.name, studentId: p.student_user_id })) })
  })

  r.get('/fees/receipts/:id', requirePerm('fees.view'), (req, res) => res.json(receiptOf(schoolOf(req), id(req.params.id))))

  // A cheque that bounced: allocations are undone so the dues reappear.
  r.post('/fees/payments/:id/bounce', requirePerm('fees.collect'), (req, res) => {
    const s = schoolOf(req)
    const reason = required(req.body.reason, 200)
    const p = one('SELECT * FROM payments WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!p) throw notFound()
    if (p.method !== 'cheque' || p.status !== 'captured') throw conflict('payment.not_bounceable')
    if (p.reconciled_at) throw conflict('payment.reconciled')
    if (one("SELECT 1 AS x FROM fee_refunds WHERE payment_id = ? AND status != 'rejected'", p.id)) throw conflict('payment.has_refund')
    transaction(() => {
      const allocated = one('SELECT COALESCE(SUM(amount_paise), 0) AS n FROM payment_allocations WHERE payment_id = ?', p.id).n
      run('DELETE FROM payment_allocations WHERE payment_id = ?', p.id)
      run("UPDATE payments SET status = 'bounced' WHERE id = ?", p.id)
      postJournal({
        schoolId: s,
        narration: `Cheque bounced: ${p.receipt_no} (${reason})`,
        source: 'fee_payment',
        sourceRef: `bounce:${p.id}`,
        lines: [
          { account: '1100', debit: allocated },
          { account: '2000', debit: p.amount_paise - allocated },
          { account: '1010', credit: p.amount_paise },
        ],
        preparedBy: req.user.id,
      })
      notify(s, guardiansOf(s, p.student_user_id, 'can_view_fees').map((g) => g.guardian_user_id), {
        title: { en: 'Cheque returned by the bank', kn: 'ಬ್ಯಾಂಕ್ ಚೆಕ್ ಹಿಂತಿರುಗಿಸಿದೆ' },
        body: { en: `Receipt ${p.receipt_no} is cancelled. Please contact the fee office.`, kn: `ರಸೀದಿ ${p.receipt_no} ರದ್ದಾಗಿದೆ. ದಯವಿಟ್ಟು ಶುಲ್ಕ ಕಚೇರಿಯನ್ನು ಸಂಪರ್ಕಿಸಿ.` },
        link: '/fees',
        source: `bounce:${p.id}`,
        kind: 'fees',
      })
    })
    audit(req, 'fees.cheque_bounced', { entityType: 'payment', entityId: p.id, detail: { reason } })
    res.json({ ok: true })
  })

  // Bank statement matched: the money is confirmed in the bank.
  r.post('/fees/payments/:id/reconcile', requirePerm('accounts.post'), (req, res) => {
    const s = schoolOf(req)
    const p = one('SELECT * FROM payments WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!p) throw notFound()
    if (p.status !== 'captured' || p.reconciled_at) throw conflict('payment.not_reconcilable')
    if (p.method === 'gateway' && p.settlement_status !== 'settled') throw conflict('payment.not_settled')
    run("UPDATE payments SET reconciled_at = datetime('now') WHERE id = ?", p.id)
    audit(req, 'fees.payment_reconciled', { entityType: 'payment', entityId: p.id })
    res.json({ ok: true })
  })

  // Ad-hoc demand (e.g. a lost ID card) for one student.
  r.post('/fees/demands', requirePerm('fees.configure'), (req, res) => {
    const s = schoolOf(req)
    const st = studentOf(s, id(req.body.studentId))
    const head = one('SELECT * FROM fee_heads WHERE id = ? AND school_id = ?', id(req.body.headId), s)
    if (!head) throw notFound()
    const did = transaction(() => {
      const d = createDemand({
        schoolId: s, studentId: st.id, yearId: yearOf(s).id, headId: head.id, description: required(req.body.description, 120),
        dueOn: date(req.body.dueOn), amount: paise(req.body.amountPaise), source: 'manual', sourceRef: crypto.randomUUID(), by: req.user.id,
      })
      applyCredit(s, st.id, req.user.id)
      return d
    })
    audit(req, 'fees.demand_raised', { entityType: 'fee_demand', entityId: did })
    res.status(201).json({ id: did })
  })

  r.post('/fees/demands/:id/cancel', requirePerm('fees.approve'), (req, res) => {
    const s = schoolOf(req)
    const reason = required(req.body.reason, 200)
    const d = transaction(() => cancelDemand(s, id(req.params.id), req.user.id, reason))
    audit(req, 'fees.demand_cancelled', { entityType: 'fee_demand', entityId: d.id, detail: { reason } })
    res.json({ ok: true })
  })

  // ----- Concessions and refunds: one person asks, another approves -----

  r.get('/fees/approvals', requirePerm('fees.view'), (req, res) => {
    const s = schoolOf(req)
    res.json({
      canApprove: req.ctx.perms.has('fees.approve'),
      concessions: all(
        `SELECT c.*, u.name AS student, h.name_en, h.name_kn, r.name AS requested_name FROM fee_concessions c JOIN users u ON u.id = c.student_user_id
         LEFT JOIN fee_heads h ON h.id = c.head_id JOIN users r ON r.id = c.requested_by WHERE c.school_id = ? ORDER BY c.status = 'pending' DESC, c.id DESC LIMIT 100`,
        s,
      ).map((c) => ({ id: c.id, student: c.student, studentId: c.student_user_id, kind: c.kind, percent: c.percent, head: c.name_en ? { en: c.name_en, kn: c.name_kn } : null, reason: c.reason, status: c.status, requestedBy: c.requested_name, mine: c.requested_by === req.user.id })),
      refunds: all(
        `SELECT f.*, u.name AS student, p.receipt_no, r.name AS requested_name FROM fee_refunds f JOIN users u ON u.id = f.student_user_id
         JOIN payments p ON p.id = f.payment_id JOIN users r ON r.id = f.requested_by WHERE f.school_id = ? ORDER BY f.status IN ('requested', 'approved') DESC, f.id DESC LIMIT 100`,
        s,
      ).map((f) => ({ id: f.id, student: f.student, studentId: f.student_user_id, receiptNo: f.receipt_no, amountPaise: f.amount_paise, reason: f.reason, status: f.status, requestedBy: f.requested_name, mine: f.requested_by === req.user.id })),
    })
  })

  r.post('/fees/concessions', requirePerm('fees.configure'), (req, res) => {
    const s = schoolOf(req)
    const st = studentOf(s, id(req.body.studentId))
    const headId = req.body.headId ? id(req.body.headId) : null
    if (headId && !one('SELECT 1 AS x FROM fee_heads WHERE id = ? AND school_id = ?', headId, s)) throw notFound()
    const pct = Number(req.body.percent)
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) throw bad('invalid.percent')
    const cid = insertId(
      'INSERT INTO fee_concessions (school_id, student_user_id, academic_year_id, head_id, kind, percent, reason, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      s, st.id, yearOf(s).id, headId, oneOf(req.body.kind, CONCESSION_KINDS), pct, required(req.body.reason, 300), req.user.id,
    )
    notify(s, usersWithPerm(s, 'fees.approve').filter((u) => u !== req.user.id), {
      title: { en: `Concession to approve: ${st.name}`, kn: `ಅನುಮೋದಿಸಬೇಕಾದ ರಿಯಾಯಿತಿ: ${st.name}` },
      body: { en: `${pct}% requested.`, kn: `${pct}% ಕೋರಲಾಗಿದೆ.` },
      link: '/fees?tab=approvals',
      source: `concession:${cid}`,
      kind: 'approval',
    })
    audit(req, 'fees.concession_requested', { entityType: 'fee_concession', entityId: cid, detail: { percent: pct } })
    res.status(201).json({ id: cid })
  })

  r.post('/fees/concessions/:id/decide', requirePerm('fees.approve'), (req, res) => {
    const s = schoolOf(req)
    const c = one('SELECT * FROM fee_concessions WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!c) throw notFound()
    if (c.status !== 'pending') throw conflict('already.decided')
    notSelf(c.requested_by, req.user.id)
    const approve = req.body.approve === true
    let applied = 0
    transaction(() => {
      run("UPDATE fee_concessions SET status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?", approve ? 'approved' : 'rejected', req.user.id, c.id)
      if (approve) {
        for (const d of all("SELECT * FROM fee_demands WHERE school_id = ? AND student_user_id = ? AND academic_year_id = ? AND status = 'open' AND (? IS NULL OR head_id = ?)", s, c.student_user_id, c.academic_year_id, c.head_id, c.head_id)) {
          applied += applyConcession(s, d, c.percent, c.id, req.user.id)
        }
      }
    })
    audit(req, approve ? 'fees.concession_approved' : 'fees.concession_rejected', { entityType: 'fee_concession', entityId: c.id, detail: { appliedPaise: applied } })
    res.json({ ok: true, appliedPaise: applied })
  })

  r.post('/fees/refunds', requirePerm('fees.collect'), (req, res) => {
    const s = schoolOf(req)
    const p = one('SELECT * FROM payments WHERE id = ? AND school_id = ?', id(req.body.paymentId), s)
    if (!p) throw notFound()
    if (p.status !== 'captured') throw conflict('payment.not_captured')
    const amount = paise(req.body.amountPaise)
    if (amount > paymentAvailable(p.id)) throw conflict('refund.exceeds_credit')
    const fid = insertId(
      'INSERT INTO fee_refunds (school_id, student_user_id, payment_id, amount_paise, reason, requested_by) VALUES (?, ?, ?, ?, ?, ?)',
      s, p.student_user_id, p.id, amount, required(req.body.reason, 300), req.user.id,
    )
    notify(s, usersWithPerm(s, 'fees.approve').filter((u) => u !== req.user.id), {
      title: { en: 'Refund to approve', kn: 'ಅನುಮೋದಿಸಬೇಕಾದ ಮರುಪಾವತಿ' },
      body: { en: `Against receipt ${p.receipt_no}.`, kn: `ರಸೀದಿ ${p.receipt_no} ವಿರುದ್ಧ.` },
      link: '/fees?tab=approvals',
      source: `refund:${fid}`,
      kind: 'approval',
    })
    audit(req, 'fees.refund_requested', { entityType: 'fee_refund', entityId: fid, detail: { amount } })
    res.status(201).json({ id: fid })
  })

  r.post('/fees/refunds/:id/decide', requirePerm('fees.approve'), (req, res) => {
    const s = schoolOf(req)
    const f = one('SELECT * FROM fee_refunds WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!f) throw notFound()
    if (f.status !== 'requested') throw conflict('already.decided')
    notSelf(f.requested_by, req.user.id)
    const approve = req.body.approve === true
    run('UPDATE fee_refunds SET status = ?, decided_by = ? WHERE id = ?', approve ? 'approved' : 'rejected', req.user.id, f.id)
    audit(req, approve ? 'fees.refund_approved' : 'fees.refund_rejected', { entityType: 'fee_refund', entityId: f.id })
    res.json({ ok: true })
  })

  r.post('/fees/refunds/:id/pay', requirePerm('fees.collect'), (req, res) => {
    const s = schoolOf(req)
    const f = one('SELECT * FROM fee_refunds WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!f) throw notFound()
    if (f.status !== 'approved') throw conflict('refund.not_approved')
    const reference = required(req.body.reference, 80)
    transaction(() => {
      run("UPDATE fee_refunds SET status = 'paid', paid_reference = ? WHERE id = ?", reference, f.id)
      postJournal({
        schoolId: s,
        narration: `Fee refund ${reference}`,
        source: 'fee_refund',
        sourceRef: `refund:${f.id}`,
        lines: [
          { account: '2000', debit: f.amount_paise },
          { account: '1010', credit: f.amount_paise },
        ],
        preparedBy: req.user.id,
        approvedBy: f.decided_by,
      })
    })
    audit(req, 'fees.refund_paid', { entityType: 'fee_refund', entityId: f.id, detail: { reference } })
    res.json({ ok: true })
  })

  // ----- Dues and reminders -----

  r.get('/fees/dues', requirePerm('fees.view'), (req, res) => {
    const s = schoolOf(req)
    const today = isoDate()
    const age = (due) => Math.floor((Date.parse(today) - Date.parse(due)) / 864e5)
    const rows = studentRows(s)
      .filter((r) => r.overduePaise > 0)
      .map(({ demands, ...r }) => {
        const buckets = { d30: 0, d60: 0, d90: 0, d90plus: 0 }
        for (const d of demands.filter((d) => d.due_on < today && d.balance_paise > 0)) {
          const a = age(d.due_on)
          buckets[a <= 30 ? 'd30' : a <= 60 ? 'd60' : a <= 90 ? 'd90' : 'd90plus'] += d.balance_paise
        }
        return { ...r, buckets, oldestDue: demands.filter((d) => d.due_on < today && d.balance_paise > 0)[0]?.due_on }
      })
    res.json({ students: rows })
  })

  // Sends one reminder per overdue student per day to guardians allowed to see fees.
  r.post('/fees/reminders', requirePerm('fees.collect'), (req, res) => {
    const s = schoolOf(req)
    const today = isoDate()
    let sent = 0
    transaction(() => {
      for (const st of studentRows(s).filter((r) => r.overduePaise > 0)) {
        const source = `fee-reminder:${today}:${st.id}`
        if (one('SELECT 1 AS x FROM notifications WHERE source = ? LIMIT 1', source)) continue
        const due = (st.overduePaise / 100).toLocaleString('en-IN')
        for (const g of guardiansOf(s, st.id, 'can_view_fees')) {
          notify(s, [g.guardian_user_id], {
            title: { en: `Fee reminder for ${st.name}`, kn: `${st.name} ಅವರ ಶುಲ್ಕ ಜ್ಞಾಪನೆ` },
            body: { en: `₹${due} is overdue. You can pay online or at the fee counter.`, kn: `₹${due} ಬಾಕಿ ಇದೆ. ಆನ್‌ಲೈನ್ ಅಥವಾ ಶುಲ್ಕ ಕೌಂಟರ್‌ನಲ್ಲಿ ಪಾವತಿಸಬಹುದು.` },
            link: '/fees',
            source,
            kind: 'fees',
          })
          queueOutbox(s, 'sms', g.mobile, 'fee_reminder', { student: st.name, overduePaise: st.overduePaise })
          sent++
        }
      }
    })
    audit(req, 'fees.reminders_sent', { detail: { sent } })
    res.json({ sent })
  })

  r.get('/fees/exceptions', requirePerm('fees.view'), (req, res) => {
    const s = schoolOf(req)
    res.json({
      events: all("SELECT id, event_id, type, result, received_at, payload FROM gateway_events WHERE school_id = ? AND (result LIKE 'exception:%' OR result LIKE 'resolved:%') ORDER BY id DESC LIMIT 100", s).map((e) => ({
        id: e.id, eventId: e.event_id, type: e.type, result: e.result, receivedAt: e.received_at, open: e.result.startsWith('exception:'), payload: e.payload.slice(0, 400),
      })),
    })
  })

  r.post('/fees/exceptions/:id/resolve', requirePerm('fees.collect'), (req, res) => {
    const s = schoolOf(req)
    const e = one("SELECT * FROM gateway_events WHERE id = ? AND school_id = ? AND result LIKE 'exception:%'", id(req.params.id), s)
    if (!e) throw notFound()
    const note = required(req.body.note, 200)
    run('UPDATE gateway_events SET result = ? WHERE id = ?', `resolved:${note} (was ${e.result})`, e.id)
    audit(req, 'fees.exception_resolved', { entityType: 'gateway_event', entityId: e.id, detail: { note } })
    res.json({ ok: true })
  })

  // ----- Parents -----

  const myChild = (req, childId) => {
    const child = childrenFor(req, 'can_view_fees').find((c) => c.id === childId)
    if (!child) {
      audit(req, 'family.fees_denied', { outcome: 'denied', entityType: 'student', entityId: childId })
      throw forbidden()
    }
    return child
  }

  r.get('/family/fees', requirePerm('family.view'), (req, res) => {
    const s = schoolOf(req)
    res.json({
      gateway: gatewayMode(),
      children: childrenFor(req, 'can_view_fees').map((c) => {
        const demands = studentDemands(s, c.id)
        return {
          id: c.id,
          name: c.name,
          firstName: { en: c.first_name_en, kn: c.first_name_kn },
          section: c.section_en ? { en: c.section_en, kn: c.section_kn } : null,
          summary: summary(demands),
          demands: demands.map((d) => demandView(d)),
          payments: all("SELECT * FROM payments WHERE school_id = ? AND student_user_id = ? AND status IN ('captured', 'bounced') ORDER BY id DESC LIMIT 30", s, c.id).map(paymentView),
        }
      }),
    })
  })

  r.get('/family/receipts/:id', requirePerm('family.view'), (req, res) => {
    const s = schoolOf(req)
    const p = one('SELECT student_user_id FROM payments WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!p) throw notFound()
    myChild(req, p.student_user_id)
    res.json(receiptOf(s, id(req.params.id)))
  })

  // Starts an online payment. Parents can pay up to what is due.
  r.post('/family/fees/checkout', requirePerm('family.view'), (req, res) => {
    const s = schoolOf(req)
    const child = myChild(req, id(req.body.studentId))
    const key = text(req.body.idempotencyKey, 80) || null
    if (key) {
      const dup = one("SELECT * FROM payments WHERE idempotency_key = ? AND school_id = ? AND payer_user_id = ?", key, s, req.user.id)
      if (dup) return res.json({ orderId: dup.gateway_order_id, amountPaise: dup.amount_paise, mode: gatewayMode(), repeated: true })
    }
    const amount = paise(req.body.amountPaise)
    const due = summary(studentDemands(s, child.id)).duePaise
    if (amount > due) throw bad('amount.exceeds_due')
    if (gatewayMode() !== 'sandbox') throw new HttpError(503, 'gateway.not_connected')
    const orderId = `order_${crypto.randomBytes(9).toString('hex')}`
    run(
      `INSERT INTO payments (school_id, student_user_id, payer_user_id, amount_paise, method, status, gateway_order_id, idempotency_key, settlement_status, received_on)
       VALUES (?, ?, ?, ?, 'gateway', 'initiated', ?, ?, 'unsettled', ?)`,
      s, child.id, req.user.id, amount, orderId, key, isoDate(),
    )
    audit(req, 'fees.checkout_started', { entityType: 'payment', entityId: orderId, detail: { amount } })
    res.status(201).json({ orderId, amountPaise: amount, mode: 'sandbox' })
  })

  // Sandbox only: plays the gateway's part by sending a signed webhook event
  // through the same handler a real gateway would reach. No money moves.
  r.post('/family/fees/sandbox-pay', requirePerm('family.view'), (req, res) => {
    if (gatewayMode() !== 'sandbox') throw forbidden('gateway.live')
    const s = schoolOf(req)
    const p = one("SELECT * FROM payments WHERE gateway_order_id = ? AND school_id = ? AND payer_user_id = ?", text(req.body.orderId, 60), s, req.user.id)
    if (!p) throw notFound()
    const success = req.body.outcome !== 'failure'
    const raw = JSON.stringify({
      id: `evt_${crypto.randomBytes(9).toString('hex')}`,
      type: success ? 'payment.captured' : 'payment.failed',
      data: { order_id: p.gateway_order_id, payment_id: `pay_${crypto.randomBytes(9).toString('hex')}`, amount: p.amount_paise },
    })
    const out = handleGatewayEvent(raw, signPayload(raw))
    const after = one('SELECT id, status, receipt_no FROM payments WHERE id = ?', p.id)
    res.json({ result: out.result, status: after.status, receiptNo: after.receipt_no, paymentId: after.id })
  })
}

// The webhook needs the raw body to check the signature.
export function webhookHandler(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  if (!webhookSecret()) return res.status(503).json({ error: 'gateway.not_configured' })
  const out = handleGatewayEvent(raw, req.get('x-vidyanexus-signature'))
  res.status(out.status).json({ result: out.result })
}

