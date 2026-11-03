// Acceptance checks for the operations modules: money is posted once and
// balances, people cannot approve their own requests, restricted records stay
// restricted, and children are released only to approved adults.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { startApp } from './helpers.js'

let app
let one
let all
let codeAt
let currentStep
const sessions = new Map()

const P = {
  principal: ['principal@vidyanexus.school', 'admin1234', 'principal'],
  accountant: ['kiran.m@vidyanexus.school', 'admin1234', 'accountant'],
  kiranParent: ['kiran.m@vidyanexus.school', 'admin1234', 'guardian'],
  hr: ['hr@vidyanexus.school', 'admin1234', 'hr'],
  reception: ['reception@vidyanexus.school', 'admin1234', 'receptionist'],
  dsl: ['safeguarding@vidyanexus.school', 'admin1234', 'safeguarding_officer'],
  suresh: ['suresh.k@vidyanexus.school', 'parent123', 'guardian'],
  dola: ['dola.ramesh@vidyanexus.school', 'teacher123', 'teacher'],
  driver: ['manjunath.b@vidyanexus.school', 'staff1234', 'driver'],
  nurse: ['nurse@vidyanexus.school', 'staff1234', 'nurse'],
  librarian: ['librarian@vidyanexus.school', 'staff1234', 'librarian'],
  stores: ['stores@vidyanexus.school', 'staff1234', 'inventory'],
}
const idOf = (email) => one('SELECT id FROM users WHERE email = ?', email).id
const JASON = () => idOf('jason@vidyanexus.school')
const RAHUL = () => idOf('rahul.k@vidyanexus.school')

// One signed-in browser per person and role, reused across tests.
async function as(key) {
  if (sessions.has(key)) return sessions.get(key)
  const [email, password, role] = P[key]
  const c = app.client()
  const s = await c.login(email, password)
  const w = s.workspaces.find((x) => x.role === role)
  assert.ok(w, `${email} has no ${role} workspace`)
  if (s.active?.id !== w.id || s.mfaPending) {
    const body = { membershipId: w.id }
    if (w.privileged) {
      app.db.run('UPDATE users SET mfa_last_step = NULL WHERE email = ?', email)
      body.code = codeAt(one('SELECT mfa_secret FROM users WHERE email = ?', email).mfa_secret, currentStep())
    }
    const r = await c.post('/workspaces/active', body)
    assert.equal(r.status, 200, JSON.stringify(r.data))
  }
  sessions.set(key, c)
  return c
}

const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.data))
  return r.data
}

function trialBalance() {
  const t = one('SELECT SUM(debit_paise) AS dr, SUM(credit_paise) AS cr FROM journal_lines')
  return t
}

before(async () => {
  app = await startApp()
  one = app.db.one
  all = app.db.all
  ;({ codeAt, currentStep } = await import('../server/totp.js'))
})
after(() => app.close())

describe('demo data', () => {
  test('every module has seeded data and the books balance', () => {
    assert.ok(one('SELECT COUNT(*) AS n FROM fee_demands').n > 0)
    assert.ok(one("SELECT COUNT(*) AS n FROM payments WHERE status = 'captured'").n >= 2)
    assert.ok(one('SELECT COUNT(*) AS n FROM admission_applications').n >= 4)
    assert.ok(one('SELECT COUNT(*) AS n FROM payroll_runs').n === 1)
    const tb = trialBalance()
    assert.equal(tb.dr, tb.cr)
  })
})

describe('admissions', () => {
  test('duplicates are caught, transitions are checked, and missing documents block verification', async () => {
    const c = await as('reception')
    const body = { childName: 'Ishaan Patil', gradeLevel: 3, guardianName: 'Neha Patil', guardianMobile: '98450 77777', guardianRelationship: 'mother' }
    const first = ok(await c.post('/admissions', body), 201)
    const dup = await c.post('/admissions', body)
    assert.equal(dup.status, 409)
    assert.equal(dup.data.error, 'admission.duplicate')
    const bad = await c.post(`/admissions/${first.id}/status`, { status: 'offered', version: 1 })
    assert.equal(bad.data.error, 'admission.bad_transition')
    const rohan = one("SELECT id, version FROM admission_applications WHERE child_name = 'Rohan Gowda'")
    const docs = await c.post(`/admissions/${rohan.id}/status`, { status: 'documents_verified', version: rohan.version })
    assert.equal(docs.status, 409)
    assert.ok(docs.data.missing.includes('transfer_certificate'))
  })

  test('a stale screen cannot overwrite a newer change', async () => {
    const c = await as('reception')
    const a = one("SELECT id, version FROM admission_applications WHERE child_name = 'Ananya Hegde'")
    ok(await c.patch(`/admissions/${a.id}`, { version: a.version, notes: 'Called back' }))
    const stale = await c.patch(`/admissions/${a.id}`, { version: a.version, notes: 'Old screen' })
    assert.equal(stale.status, 409)
    assert.equal(stale.data.error, 'conflict.stale')
  })

  test('enrolling creates one student, a verified guardian link and the fees, and repeating it creates nothing new', async () => {
    const c = await as('reception')
    const a = one("SELECT id, version FROM admission_applications WHERE child_name = 'Kavya Rao'")
    const out = ok(await c.post(`/admissions/${a.id}/enroll`, { version: a.version }), 201)
    assert.match(out.admissionNo, /^VPS-BLR-\d{2}-\d{4}$/)
    assert.ok(out.feesCreated > 0)
    assert.match(out.guardianLink, /^\/reset\//)
    const again = ok(await c.post(`/admissions/${a.id}/enroll`, { version: a.version }))
    assert.equal(again.repeated, true)
    assert.equal(again.studentId, out.studentId)
    assert.equal(one('SELECT COUNT(*) AS n FROM enrollments WHERE student_user_id = ?', out.studentId).n, 1)
    const link = one('SELECT * FROM guardian_links WHERE student_user_id = ?', out.studentId)
    assert.ok(link.verified_at)
    assert.equal(link.status, 'active')
    assert.equal(one("SELECT COUNT(*) AS n FROM users WHERE mobile = '+919900334455'").n, 1)
  })

  test('teachers cannot open admissions', async () => {
    const c = await as('dola')
    assert.equal((await c.get('/admissions')).status, 403)
  })
})

describe('fees and payments', () => {
  test('a repeated counter payment returns the first receipt instead of charging twice', async () => {
    const c = await as('accountant')
    const before = one('SELECT COUNT(*) AS n FROM payments').n
    const body = { studentId: RAHUL(), amountPaise: 500000, method: 'cash', idempotencyKey: 'counter-test-1' }
    const a = ok(await c.post('/fees/payments', body), 201)
    const b = ok(await c.post('/fees/payments', body))
    assert.equal(b.repeated, true)
    assert.equal(b.receiptNo, a.receiptNo)
    assert.equal(one('SELECT COUNT(*) AS n FROM payments').n, before + 1)
    assert.match(a.receiptNo, /^RCPT\/\d{4}-\d{2}\/\d{6}$/)
  })

  test('payments clear the oldest dues first and any extra becomes credit', async () => {
    const c = await as('accountant')
    const kavya = one("SELECT student_user_id AS id FROM admission_applications WHERE child_name = 'Kavya Rao'").id
    const ledger = ok(await c.get(`/fees/students/${kavya}`))
    const due = ledger.summary.duePaise
    const out = ok(await c.post('/fees/payments', { studentId: kavya, amountPaise: due + 100000, method: 'upi', reference: 'UPI 7781' }), 201)
    assert.equal(out.allocated, due)
    assert.equal(out.advance, 100000)
    const after = ok(await c.get(`/fees/students/${kavya}`))
    assert.equal(after.summary.duePaise, 0)
    assert.equal(after.creditPaise, 100000)
  })

  test('refunds need a second person, cannot exceed credit, and post to the books', async () => {
    const acc = await as('accountant')
    const kavya = one("SELECT student_user_id AS id FROM admission_applications WHERE child_name = 'Kavya Rao'").id
    const payment = one("SELECT id FROM payments WHERE student_user_id = ? AND status = 'captured' ORDER BY id DESC", kavya).id
    const tooMuch = await acc.post('/fees/refunds', { paymentId: payment, amountPaise: 100001, reason: 'Overpaid' })
    assert.equal(tooMuch.data.error, 'refund.exceeds_credit')
    const r = ok(await acc.post('/fees/refunds', { paymentId: payment, amountPaise: 100000, reason: 'Overpaid at counter' }), 201)
    assert.equal((await acc.post(`/fees/refunds/${r.id}/decide`, { approve: true })).status, 403)
    const pr = await as('principal')
    ok(await pr.post(`/fees/refunds/${r.id}/decide`, { approve: true }))
    ok(await acc.post(`/fees/refunds/${r.id}/pay`, { reference: 'NEFT 99812' }))
    assert.ok(one("SELECT id FROM journals WHERE source = 'fee_refund' AND source_ref = ?", `refund:${r.id}`))
  })

  test('a concession asked for by the accountant is approved by the principal and reduces the dues', async () => {
    const pr = await as('principal')
    const conc = one("SELECT id FROM fee_concessions WHERE status = 'pending'")
    const before = one("SELECT SUM(concession_paise) AS n FROM fee_demands WHERE student_user_id = ? AND status = 'open'", RAHUL()).n
    const out = ok(await pr.post(`/fees/concessions/${conc.id}/decide`, { approve: true }))
    assert.ok(out.appliedPaise > 0)
    assert.ok(one("SELECT SUM(concession_paise) AS n FROM fee_demands WHERE student_user_id = ? AND status = 'open'", RAHUL()).n > before)
  })

  test("parents see only their own children's fees and receipts", async () => {
    const c = await as('suresh')
    const f = ok(await c.get('/family/fees'))
    assert.deepEqual(f.children.map((x) => x.id), [JASON()])
    const rahulPayment = one("SELECT id FROM payments WHERE student_user_id = ? AND status = 'captured'", RAHUL()).id
    assert.equal((await c.get(`/family/receipts/${rahulPayment}`)).status, 403)
  })

  test('online payment: sandbox checkout is captured once, duplicates and forged events change nothing', async () => {
    const c = await as('suresh')
    const due = ok(await c.get('/family/fees')).children[0].summary.duePaise
    assert.equal((await c.post('/family/fees/checkout', { studentId: JASON(), amountPaise: due + 1 })).data.error, 'amount.exceeds_due')
    const order = ok(await c.post('/family/fees/checkout', { studentId: JASON(), amountPaise: 200000, idempotencyKey: 'web-1' }), 201)
    const paid = ok(await c.post('/family/fees/sandbox-pay', { orderId: order.orderId }))
    assert.equal(paid.status, 'captured')
    assert.match(paid.receiptNo, /^RCPT\//)

    const { signPayload } = await import('../server/ops/fees.js')
    const event = (id, data, type = 'payment.captured') => JSON.stringify({ id, type, data })
    const send = (raw, sig = signPayload(raw)) => fetch(`${app.base}/payments/webhook`, { method: 'POST', headers: { 'x-vidyanexus-signature': sig, 'content-type': 'application/json' }, body: raw })
    const payments = () => one('SELECT COUNT(*) AS n FROM payments WHERE status = ?', 'captured').n
    const before = payments()
    const raw = event('evt_dup_test', { order_id: order.orderId, payment_id: 'pay_x', amount: 200000 })
    assert.equal((await (await send(raw)).json()).result, 'ignored:already_captured')
    assert.equal((await (await send(raw)).json()).result, 'duplicate')
    const forged = await send(event('evt_forged', { order_id: order.orderId, amount: 1 }), 'deadbeef')
    assert.equal(forged.status, 401)
    assert.equal(payments(), before)

    // Amount mismatch becomes an exception for the fee office.
    const order2 = ok(await c.post('/family/fees/checkout', { studentId: JASON(), amountPaise: 50000 }), 201)
    assert.equal((await (await send(event('evt_mismatch', { order_id: order2.orderId, amount: 40000 }))).json()).result, 'exception:amount_mismatch')
    const ex = ok(await (await as('accountant')).get('/fees/exceptions'))
    assert.ok(ex.events.some((e) => e.eventId === 'evt_mismatch' && e.open))

    // A "failed" that arrives before "captured" still ends captured.
    const order3 = ok(await c.post('/family/fees/checkout', { studentId: JASON(), amountPaise: 30000 }), 201)
    await send(event('evt_f1', { order_id: order3.orderId, amount: 30000 }, 'payment.failed'))
    assert.equal((await (await send(event('evt_c1', { order_id: order3.orderId, payment_id: 'pay_late', amount: 30000 }))).json()).result, 'captured_after_failure')

    // Settlement moves money from the gateway clearing account to the bank, less charges.
    const settled = await (await send(event('evt_settle', { settlement_id: 'setl_1', items: [{ payment_id: 'pay_late', fee: 600 }] }, 'settlement.processed'))).json()
    assert.equal(settled.result, 'settled:1')
    const j = one("SELECT id FROM journals WHERE source = 'settlement'")
    const lines = all('SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l JOIN ledger_accounts a ON a.id = l.account_id WHERE l.journal_id = ? ORDER BY a.code', j.id)
    assert.deepEqual(lines.map((l) => [l.code, l.debit_paise, l.credit_paise]), [['1010', 29400, 0], ['1020', 0, 30000], ['5200', 600, 0]])
  })
})

describe('accounting', () => {
  test('every automatic posting balances and posted journals cannot be edited', () => {
    const tb = trialBalance()
    assert.equal(tb.dr, tb.cr)
    for (const j of all('SELECT journal_id, SUM(debit_paise) AS dr, SUM(credit_paise) AS cr FROM journal_lines GROUP BY journal_id')) assert.equal(j.dr, j.cr)
    assert.throws(() => app.db.run('UPDATE journal_lines SET debit_paise = debit_paise + 1 WHERE id = 1'), /immutable/)
    assert.throws(() => app.db.run('DELETE FROM journals WHERE id = 1'), /immutable/)
  })

  test('manual journals are approved by someone else, and locked months refuse entries', async () => {
    const acc = await as('accountant')
    const lines = [
      { account: '5100', debitPaise: 25000 },
      { account: '1000', creditPaise: 25000 },
    ]
    assert.equal((await acc.post('/accounts/drafts', { narration: 'x', lines: [{ account: '5100', debitPaise: 100 }, { account: '1000', creditPaise: 99 }] })).data.error, 'journal.unbalanced')
    const d = ok(await acc.post('/accounts/drafts', { narration: 'Petty cash: chalk', lines }), 201)
    assert.equal((await acc.post(`/accounts/drafts/${d.id}/decide`, { approve: true })).status, 403)
    const pr = await as('principal')
    const done = ok(await pr.post(`/accounts/drafts/${d.id}/decide`, { approve: true }))
    assert.ok(done.journalId)
    const tb = ok(await acc.get('/accounts/trial-balance'))
    assert.equal(tb.balanced, true)

    const month = '2025-01'
    ok(await acc.post('/accounts/locks', { month }))
    const locked = await acc.post('/accounts/drafts', { narration: 'Back-dated', date: '2025-01-20', lines })
    assert.equal(locked.data.error, 'period.locked')
  })
})

describe('HR: leave and payroll', () => {
  test('overlapping leave is refused and nobody approves their own leave', async () => {
    const dola = await as('dola')
    const mine = ok(await dola.get('/me/leave'))
    const pending = mine.requests.find((r) => r.status === 'pending')
    const overlap = await dola.post('/me/leave', { typeId: mine.balances[0].id, from: pending.from, to: pending.to })
    assert.equal(overlap.data.error, 'leave.overlap')

    const hr = await as('hr')
    const hrLeave = ok(await hr.get('/me/leave'))
    const day = '2026-12-21'
    const req = ok(await hr.post('/me/leave', { typeId: hrLeave.balances[0].id, from: day, to: day, reason: 'Personal' }), 201)
    const self = await hr.post(`/hr/leave/${req.id}/decide`, { approve: true })
    assert.equal(self.data.error, 'approval.self')
    ok(await (await as('principal')).post(`/hr/leave/${req.id}/decide`, { approve: true }))
  })

  test('payroll: HR prepares, the principal approves without seeing individual pay, staff see their payslip', async () => {
    const run = one("SELECT * FROM payroll_runs WHERE status = 'draft'")
    const hr = await as('hr')
    assert.equal((await hr.post(`/hr/payroll/runs/${run.id}/approve`, {})).status, 403)
    const pr = await as('principal')
    const view = ok(await pr.get(`/hr/payroll/runs/${run.id}`))
    assert.equal(view.run.payslips, undefined)
    assert.ok(view.run.totals.netPaise > 0)
    assert.ok(ok(await hr.get(`/hr/payroll/runs/${run.id}`)).run.payslips.length > 0)
    ok(await pr.post(`/hr/payroll/runs/${run.id}/approve`, {}))
    const j = one("SELECT id FROM journals WHERE source = 'payroll' AND source_ref = ?", `run:${run.id}`)
    assert.ok(j)
    assert.equal((await pr.get(`/hr/payroll/runs/${run.id}/bank.csv`)).status, 403)
    assert.equal((await hr.get(`/hr/payroll/runs/${run.id}/bank.csv`)).status, 200)
    const slips = ok(await (await as('driver')).get('/me/payslips'))
    assert.equal(slips.payslips.length, 1)
    assert.equal(slips.payslips[0].month, run.month)
  })

  test('the same inputs give the same payroll, and changed inputs block approval until it is re-prepared', async () => {
    const { computePayroll } = await import('../server/ops/hr.js')
    const school = one("SELECT id FROM schools WHERE code = 'VPS-BLR'").id
    const month = new Date().toISOString().slice(0, 7)
    assert.equal(computePayroll(school, month).hash, computePayroll(school, month).hash)
    const hr = await as('hr')
    const r = ok(await hr.post('/hr/payroll/runs', { month }), 201)
    app.db.run("UPDATE employee_compensation SET monthly_gross_paise = monthly_gross_paise + 100000 WHERE employee_id = (SELECT id FROM employees WHERE employee_no = 'EMP-0201')")
    const stale = await (await as('principal')).post(`/hr/payroll/runs/${r.id}/approve`, {})
    assert.equal(stale.data.error, 'payroll.stale')
  })
})

describe('transport', () => {
  test('consent and capacity are enforced when adding a child to a route', async () => {
    const pr = await as('principal')
    const t = ok(await pr.get('/transport'))
    const r7 = t.routes.find((r) => r.code === 'R7')
    const kavya = one("SELECT student_user_id AS id FROM admission_applications WHERE child_name = 'Kavya Rao'").id
    const v = ok(await pr.post('/transport/vehicles', { regNo: 'KA-02-ZZ-0001', capacity: 1 }), 201)
    ok(await pr.patch(`/transport/routes/${r7.id}`, { vehicleId: v.id }))
    const stop = ok(await pr.post(`/transport/routes/${r7.id}/stops`, { name: 'Banashankari temple', pickupTime: '07:10', dropTime: '15:45' }), 201)
    const noConsent = await pr.post('/transport/allocations', { studentId: kavya, routeId: r7.id, stopId: stop.id, consentGuardianId: idOf('suresh.k@vidyanexus.school') })
    assert.equal(noConsent.data.error, 'consent.required')
    const guardian = one('SELECT guardian_user_id AS id FROM guardian_links WHERE student_user_id = ?', kavya).id
    ok(await pr.post('/transport/allocations', { studentId: kavya, routeId: r7.id, stopId: stop.id, consentGuardianId: guardian }), 201)
    const ishaan = one("SELECT e.student_user_id AS id FROM enrollments e WHERE e.student_user_id NOT IN (SELECT student_user_id FROM transport_allocations) AND e.status = 'active' LIMIT 1").id
    const g2 = one("SELECT guardian_user_id AS id FROM guardian_links WHERE student_user_id = ? AND status = 'active'", ishaan)
    if (g2) assert.equal((await pr.post('/transport/allocations', { studentId: ishaan, routeId: r7.id, stopId: stop.id, consentGuardianId: g2.id })).data.error, 'route.full')
  })

  test('a trip cannot be closed with children unaccounted for unless a note is written, and parents are told about boarding', async () => {
    const d = await as('driver')
    const today = ok(await d.get('/trips/today'))
    const r4 = today.routes.find((r) => r.code === 'R4')
    assert.ok(r4, 'driver sees route 4')
    assert.ok(!today.routes.some((r) => r.code === 'R7'), 'driver does not see other routes')
    const trip = ok(await d.post('/trips', { routeId: r4.id, direction: 'to_school' }), 201)
    ok(await d.post(`/trips/${trip.id}/events`, { studentId: JASON(), event: 'boarded' }))
    const closing = await d.post(`/trips/${trip.id}/close`, {})
    assert.equal(closing.data.error, 'trip.unaccounted')
    ok(await d.post(`/trips/${trip.id}/events`, { studentId: JASON(), event: 'alighted' }))
    ok(await d.post(`/trips/${trip.id}/events`, { studentId: RAHUL(), event: 'absent' }))
    ok(await d.post(`/trips/${trip.id}/close`, {}))
    const inbox = ok(await (await as('suresh')).get('/inbox'))
    assert.ok(inbox.items.some((n) => n.title.en.includes('on the bus to school')))
    const fam = ok(await (await as('suresh')).get('/family/transport'))
    assert.equal(fam.children[0].route.code, 'R4')
  })
})

describe('purchasing, stores and assets', () => {
  test('requisition to payment with a three-way match and separate approvers', async () => {
    const acc = await as('accountant')
    const pr = await as('principal')
    const q = one("SELECT id FROM requisitions WHERE status = 'submitted'")
    assert.equal((await acc.post(`/procurement/requisitions/${q.id}/decide`, { approve: true })).status, 403)
    ok(await pr.post(`/procurement/requisitions/${q.id}/decide`, { approve: true }))
    const vendor = one("SELECT id FROM vendors WHERE name = 'Bengaluru Tech Supplies'").id
    const po = ok(await acc.post('/procurement/orders', { vendorId: vendor, requisitionId: q.id }), 201)
    const line = one('SELECT id FROM po_lines WHERE po_id = ?', po.id)
    const grn = ok(await (await as('stores')).post(`/procurement/orders/${po.id}/receive`, { lines: [{ poLineId: line.id, qty: 1 }] }), 201)
    assert.equal(grn.assets.length, 1)
    const over = await acc.post(`/procurement/orders/${po.id}/receive`, { lines: [{ poLineId: line.id, qty: 5 }] })
    assert.equal(over.data.error, 'receipt.exceeds_order')
    // Billed for two, received one: a mismatch that needs a written reason.
    const inv = ok(await acc.post('/procurement/invoices', { poId: po.id, invoiceNo: 'BTS/889', invoiceDate: '2026-11-01', amountPaise: 2 * 4200000 }), 201)
    assert.equal(inv.status, 'mismatch')
    assert.equal((await acc.post('/procurement/invoices', { poId: po.id, invoiceNo: 'bts/889', invoiceDate: '2026-11-01', amountPaise: 100 })).data.error, 'invoice.duplicate')
    assert.equal((await pr.post(`/procurement/invoices/${inv.id}/decide`, { approve: true })).data.error, 'reason.required')
    ok(await pr.post(`/procurement/invoices/${inv.id}/decide`, { approve: false, note: 'Second unit not delivered yet' }))
    const inv2 = ok(await acc.post('/procurement/invoices', { poId: po.id, invoiceNo: 'BTS/890', invoiceDate: '2026-11-02', amountPaise: 4200000 }), 201)
    assert.equal(inv2.status, 'matched')
    ok(await pr.post(`/procurement/invoices/${inv2.id}/decide`, { approve: true }))
    ok(await acc.post(`/procurement/invoices/${inv2.id}/pay`, { reference: 'NEFT 5512' }))
    assert.ok(one("SELECT id FROM journals WHERE source = 'purchase_payment'"))
  })

  test('stock cannot go below zero', async () => {
    const st = await as('stores')
    const paper = one("SELECT id FROM items WHERE sku = 'PAPER-A4'").id
    assert.equal((await st.post('/stores/issue', { itemId: paper, qty: 1000, issuedTo: 'Office' })).data.error, 'stock.insufficient')
    ok(await st.post('/stores/issue', { itemId: paper, qty: 5, issuedTo: 'Class 7A' }))
  })
})

describe('library', () => {
  test('loan limits, overdue fines, and waivers with a reason', async () => {
    const lib = await as('librarian')
    const jasonAdm = one('SELECT admission_no FROM enrollments WHERE student_user_id = ?', JASON()).admission_no
    const free = all("SELECT accession_no FROM book_copies WHERE status = 'available' ORDER BY id LIMIT 3").map((r) => r.accession_no)
    ok(await lib.post('/library/issue', { accessionNo: free[0], borrower: jasonAdm }), 201)
    assert.equal((await lib.post('/library/issue', { accessionNo: free[1], borrower: jasonAdm })).data.error, 'library.limit')
    const overdue = one('SELECT c.accession_no, l.id FROM library_loans l JOIN book_copies c ON c.id = l.copy_id WHERE l.borrower_user_id = ? AND l.due_on < date(\'now\') AND l.returned_on IS NULL', JASON())
    const ret = ok(await lib.post('/library/return', { accessionNo: overdue.accession_no }))
    assert.ok(ret.lateDays >= 1 && ret.finePaise === ret.lateDays * 100)
    assert.equal((await lib.post('/library/issue', { accessionNo: free[1], borrower: jasonAdm })).data.error, 'library.fine_due')
    assert.equal((await lib.post(`/library/loans/${overdue.id}/fine`, { action: 'waived' })).data.error, 'reason.required')
    ok(await lib.post(`/library/loans/${overdue.id}/fine`, { action: 'waived', reason: 'First time, returned in good condition' }))
  })
})

describe('reception: early pickup', () => {
  test('a child is released to an approved guardian, and anyone else needs a recorded override by an authorised person', async () => {
    const rec = await as('reception')
    const p1 = ok(await rec.post('/reception/pickups', { studentId: JASON(), reason: 'Dentist appointment', pickupName: 'Suresh K.' }), 201)
    ok(await rec.post(`/reception/pickups/${p1.id}/release`, { guardianId: idOf('suresh.k@vidyanexus.school') }))

    const p2 = ok(await rec.post('/reception/pickups', { studentId: RAHUL(), reason: 'Fever', pickupName: 'Uncle Mohan' }), 201)
    // Suresh is a verified guardian, but not Rahul's.
    assert.equal((await rec.post(`/reception/pickups/${p2.id}/release`, { guardianId: idOf('suresh.k@vidyanexus.school') })).data.error, 'pickup.not_approved')
    assert.equal((await rec.post(`/reception/pickups/${p2.id}/release`, { override: true, overrideReason: 'Father called the office' })).data.error, 'pickup.override_required')
    const pr = await as('principal')
    const out = ok(await pr.post(`/reception/pickups/${p2.id}/release`, { override: true, overrideReason: 'Father phoned the principal and confirmed Mohan' }))
    assert.equal(out.verification, 'override')
    assert.ok(one("SELECT id FROM audit_events WHERE action = 'reception.pickup_override'"))
  })
})

describe('health and safeguarding', () => {
  test('an urgent concern alerts the safeguarding officer and the principal at once, without details, and the reporter cannot read cases', async () => {
    const dola = await as('dola')
    const r = ok(await dola.post('/safeguarding/reports', { studentId: RAHUL(), category: 'self_harm', severity: 'urgent', summary: 'Synthetic test: worrying note found in notebook.' }), 201)
    assert.match(r.number, /^SG\//)
    assert.equal((await dola.get('/safeguarding/cases')).status, 403)
    for (const key of ['dsl', 'principal']) {
      const inbox = ok(await (await as(key)).get('/inbox'))
      const n = inbox.items.find((i) => i.title.en === `URGENT safeguarding concern ${r.number}`)
      assert.ok(n, `${key} was alerted`)
      assert.ok(!n.body.en.includes('notebook'))
    }
    assert.equal((await (await as('principal')).get('/safeguarding/cases')).status, 403)
    const cases = ok(await (await as('dsl')).get('/safeguarding/cases'))
    assert.ok(cases.cases.some((c) => c.number === r.number && c.escalatedAt))
  })

  test('nurse visits reach only guardians allowed to see health information', async () => {
    const nurse = await as('nurse')
    ok(await nurse.post('/infirmary/visits', { studentId: JASON(), complaint: 'Scraped knee', actionTaken: 'Cleaned and dressed', guardianInformed: true }), 201)
    ok(await nurse.post('/infirmary/visits', { studentId: RAHUL(), complaint: 'Cough', actionTaken: 'Rested', guardianInformed: true }), 201)
    const suresh = ok(await (await as('suresh')).get('/family/health'))
    assert.ok(suresh.children[0].visits.some((v) => v.complaint === 'Scraped knee'))
    // Kiran's link to Rahul does not include health information.
    const kiran = ok(await (await as('kiranParent')).get('/family/health'))
    assert.equal(kiran.children.length, 0)
    assert.equal((await (await as('dola')).get('/infirmary')).status, 403)
  })
})

describe('messages and helpdesk', () => {
  test('bulk messages need a second person; class messages go straight out to the inbox', async () => {
    const pr = await as('principal')
    const msg = { titleEn: 'Holiday', titleKn: 'ರಜೆ', bodyEn: 'School closed on Friday.', bodyKn: 'ಶುಕ್ರವಾರ ಶಾಲೆಗೆ ರಜೆ.' }
    const bulk = ok(await pr.post('/messages', { ...msg, audience: 'all_guardians' }), 201)
    assert.equal(bulk.status, 'pending_approval')
    assert.equal((await pr.post(`/messages/${bulk.id}/decide`, { approve: true })).data.error, 'approval.self')
    const sec = one("SELECT id FROM sections WHERE label_en = 'Class 7A' AND school_id = (SELECT id FROM schools WHERE code = 'VPS-BLR')").id
    const out = ok(await pr.post('/messages', { ...msg, titleEn: 'Class 7A picnic', audience: 'section_guardians', sectionId: sec }), 201)
    assert.equal(out.status, 'sent')
    assert.ok(out.recipients >= 1)
    const inbox = ok(await (await as('suresh')).get('/inbox'))
    assert.ok(inbox.items.some((i) => i.title.en === 'Class 7A picnic'))
  })

  test('confidential grievances are hidden from general helpdesk staff', async () => {
    const suresh = await as('suresh')
    const g = ok(await suresh.post('/helpdesk/tickets', { category: 'grievance', subject: 'Private matter', body: 'Synthetic grievance text.' }), 201)
    const n = ok(await suresh.post('/helpdesk/tickets', { category: 'facility', subject: 'Broken tap', body: 'Ground floor washroom.' }), 201)
    const rec = await as('reception')
    const list = ok(await rec.get('/helpdesk/tickets'))
    assert.ok(list.tickets.some((t) => t.number === n.number))
    assert.ok(!list.tickets.some((t) => t.number === g.number))
    assert.equal((await rec.get(`/helpdesk/tickets/${g.id}`)).status, 403)
    assert.ok(ok(await (await as('principal')).get('/helpdesk/tickets')).tickets.some((t) => t.number === g.number))
    const res = await rec.patch(`/helpdesk/tickets/${n.id}`, { status: 'resolved' })
    assert.equal(res.data.error, 'resolution.required')
    ok(await rec.patch(`/helpdesk/tickets/${n.id}`, { status: 'resolved', resolution: 'Plumber fixed it' }))
  })
})

describe('isolation and the approvals queue', () => {
  test("one school's staff cannot reach another school's students", async () => {
    const acc = await as('accountant')
    const nikhil = idOf('nikhil@sahyadri.school')
    assert.equal((await acc.get(`/fees/students/${nikhil}`)).status, 404)
    assert.equal((await acc.post('/fees/payments', { studentId: nikhil, amountPaise: 100, method: 'cash' })).status, 404)
  })

  test("the approvals queue lists what is waiting for this person and leaves out their own requests", async () => {
    const acc = await as('accountant')
    ok(await acc.post('/accounts/drafts', { narration: 'Queue check', lines: [{ account: '5100', debitPaise: 100 }, { account: '1000', creditPaise: 100 }] }), 201)
    const mine = ok(await acc.get('/approvals'))
    assert.ok(!mine.items.some((i) => i.key === 'journals'))
    const pr = ok(await (await as('principal')).get('/approvals'))
    assert.ok(pr.items.some((i) => i.key === 'journals'))
    assert.ok(pr.items.some((i) => i.key === 'messages') === false)
  })

  test('the books still balance after everything above', () => {
    const tb = trialBalance()
    assert.equal(tb.dr, tb.cr)
  })
})
