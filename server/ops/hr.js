// HR: leave (request, balance, approval) and payroll (prepare, approve, pay,
// payslips). Payroll deduction rules are school settings to be verified by
// the school's own auditor; the seeded values are examples only.
import crypto from 'node:crypto'
import { audit, requirePerm } from '../access.js'
import { all, one, run, transaction } from '../db.js'
import { addDays, isoDate, parseDate } from '../dates.js'
import { bad, forbidden, id, notFound, text } from '../http.js'
import { checkVersion, conflict, date, insertId, notSelf, notify, paise, postJournal, schoolOf, usersWithPerm } from './common.js'

// ---------- Leave ----------

function employeeOf(schoolId, userId) {
  return one("SELECT * FROM employees WHERE school_id = ? AND user_id = ? AND status != 'exited'", schoolId, userId)
}

// Working days between two dates, Sundays excluded.
export function leaveDays(from, to) {
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) if (parseDate(d).getDay() !== 0) n++
  return n
}

const calYear = (d = isoDate()) => d.slice(0, 4)

function balancesFor(schoolId, employeeId) {
  const y = calYear()
  return all('SELECT * FROM leave_types WHERE school_id = ? ORDER BY paid DESC, code', schoolId).map((t) => {
    const used = one("SELECT COALESCE(SUM(days), 0) AS n FROM leave_requests WHERE employee_id = ? AND leave_type_id = ? AND status = 'approved' AND substr(from_date, 1, 4) = ?", employeeId, t.id, y).n
    const pending = one("SELECT COALESCE(SUM(days), 0) AS n FROM leave_requests WHERE employee_id = ? AND leave_type_id = ? AND status = 'pending' AND substr(from_date, 1, 4) = ?", employeeId, t.id, y).n
    return {
      id: t.id,
      code: t.code,
      name: { en: t.name_en, kn: t.name_kn },
      paid: Boolean(t.paid),
      allowed: t.paid ? t.days_per_year : null,
      used,
      pending,
      left: t.paid ? t.days_per_year - used - pending : null,
    }
  })
}

const leaveView = (l) => ({
  id: l.id,
  type: { en: l.type_en, kn: l.type_kn },
  typeCode: l.type_code,
  from: l.from_date,
  to: l.to_date,
  days: l.days,
  reason: l.reason,
  status: l.status,
  decisionNote: l.decision_note,
  decidedBy: l.decided_name ?? '',
  employee: l.employee_name,
  employeeNo: l.employee_no,
  createdAt: l.created_at,
})
const LEAVE_ROWS = `SELECT l.*, t.name_en AS type_en, t.name_kn AS type_kn, t.code AS type_code, u.name AS employee_name, e.employee_no, e.user_id, d.name AS decided_name
  FROM leave_requests l JOIN leave_types t ON t.id = l.leave_type_id JOIN employees e ON e.id = l.employee_id JOIN users u ON u.id = e.user_id
  LEFT JOIN users d ON d.id = l.decided_by`

// ---------- Payroll ----------

const daysInMonth = (month) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()

function rulesOf(schoolId) {
  return all('SELECT * FROM payroll_rules WHERE school_id = ? ORDER BY kind, code', schoolId)
}

// Unpaid leave days that fall inside the month.
function lopDays(employeeId, month) {
  const first = `${month}-01`
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
  let n = 0
  for (const l of all(
    "SELECT l.from_date, l.to_date FROM leave_requests l JOIN leave_types t ON t.id = l.leave_type_id WHERE l.employee_id = ? AND l.status = 'approved' AND t.paid = 0 AND l.to_date >= ? AND l.from_date <= ?",
    employeeId, first, last,
  )) {
    n += leaveDays(l.from_date > first ? l.from_date : first, l.to_date < last ? l.to_date : last)
  }
  return n
}

// Deterministic: the same inputs always give the same payslips and hash.
export function computePayroll(schoolId, month) {
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
  const rules = rulesOf(schoolId).filter((r) => r.enabled)
  const basicRule = rules.find((r) => r.kind === 'component' && r.code === 'BASIC')
  const employees = all(
    `SELECT e.id, e.employee_no, u.name,
       (SELECT monthly_gross_paise FROM employee_compensation c WHERE c.employee_id = e.id AND c.effective_from <= ? ORDER BY c.effective_from DESC, c.id DESC LIMIT 1) AS gross,
       (SELECT bank_account_last4 FROM employee_compensation c WHERE c.employee_id = e.id AND c.effective_from <= ? ORDER BY c.effective_from DESC, c.id DESC LIMIT 1) AS last4
     FROM employees e JOIN users u ON u.id = e.user_id
     WHERE e.school_id = ? AND e.status != 'exited' AND (e.joined_on IS NULL OR e.joined_on <= ?) ORDER BY e.employee_no`,
    last, last, schoolId, last,
  ).filter((e) => e.gross)
  const dim = daysInMonth(month)
  const slips = employees.map((e) => {
    const lop = lopDays(e.id, month)
    const lopPaise = Math.round((e.gross * lop) / dim)
    const earned = e.gross - lopPaise
    const basic = basicRule ? Math.round((earned * basicRule.percent_bp) / 10000) : earned
    const lines = []
    for (const r of rules.filter((x) => x.kind !== 'component')) {
      if (r.min_gross_paise != null && earned < r.min_gross_paise) continue
      if (r.max_gross_paise != null && earned > r.max_gross_paise) continue
      let amount = r.fixed_paise
      if (r.basis !== 'fixed') {
        const base = Math.min(r.basis === 'basic' ? basic : earned, r.base_cap_paise ?? Number.MAX_SAFE_INTEGER)
        amount = Math.round((base * r.percent_bp) / 10000)
      }
      if (amount > 0) lines.push({ code: r.code, name: { en: r.name_en, kn: r.name_kn }, kind: r.kind, amountPaise: amount })
    }
    const deductions = lines.filter((l) => l.kind === 'deduction').reduce((s, l) => s + l.amountPaise, 0)
    const employer = lines.filter((l) => l.kind === 'employer').reduce((s, l) => s + l.amountPaise, 0)
    const prev = one(
      `SELECT p.net_paise FROM payslips p JOIN payroll_runs r ON r.id = p.run_id WHERE p.employee_id = ? AND r.status IN ('approved', 'paid') AND r.month < ? ORDER BY r.month DESC LIMIT 1`,
      e.id, month,
    )?.net_paise
    const net = earned - deductions
    const flags = []
    if (prev != null && prev > 0 && Math.abs(net - prev) / prev > 0.1) flags.push('variance')
    if (prev == null) flags.push('first_pay')
    if (!e.last4) flags.push('no_bank')
    if (lop) flags.push('lop')
    return {
      employeeId: e.id, employeeNo: e.employee_no, name: e.name, daysInMonth: dim, lopDays: lop, grossPaise: e.gross, lopPaise, earnedPaise: earned, basicPaise: basic,
      deductions: lines, deductionsPaise: deductions, employerPaise: employer, netPaise: net, previousNetPaise: prev ?? null, flags, bankLast4: e.last4 ?? '',
    }
  })
  const inputs = { month, rules: rules.map((r) => [r.code, r.kind, r.basis, r.percent_bp, r.fixed_paise, r.base_cap_paise, r.min_gross_paise, r.max_gross_paise]), staff: slips.map((s) => [s.employeeId, s.grossPaise, s.lopDays, s.bankLast4]) }
  const hash = crypto.createHash('sha256').update(JSON.stringify(inputs)).digest('hex')
  const total = (k) => slips.reduce((a, s) => a + s[k], 0)
  return {
    slips,
    hash,
    totals: { grossPaise: total('earnedPaise'), deductionsPaise: total('deductionsPaise'), netPaise: total('netPaise'), employerPaise: total('employerPaise') },
    flags: slips.filter((s) => s.flags.some((f) => f === 'variance' || f === 'no_bank')).length,
    unverifiedRules: rules.filter((r) => !r.verified_by).map((r) => r.code),
  }
}

// Calculates and stores a draft run for the month.
export function storeRun(s, month, preparedBy) {
  if (one("SELECT 1 AS x FROM payroll_runs WHERE school_id = ? AND month = ? AND status != 'cancelled'", s, month)) throw conflict('payroll.exists')
  const c = computePayroll(s, month)
  if (!c.slips.length) throw conflict('payroll.no_staff')
  const runId = insertId(
    `INSERT INTO payroll_runs (school_id, month, inputs_hash, total_gross_paise, total_deductions_paise, total_net_paise, total_employer_paise, flags, prepared_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    s, month, c.hash, c.totals.grossPaise, c.totals.deductionsPaise, c.totals.netPaise, c.totals.employerPaise, c.flags, preparedBy,
  )
  for (const p of c.slips) {
    run(
      `INSERT INTO payslips (run_id, school_id, employee_id, days_in_month, lop_days, gross_paise, lop_paise, earned_paise, deductions, deductions_paise, employer_paise, net_paise, previous_net_paise, flag, bank_last4)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      runId, s, p.employeeId, p.daysInMonth, p.lopDays, p.grossPaise, p.lopPaise, p.earnedPaise, JSON.stringify(p.deductions), p.deductionsPaise, p.employerPaise, p.netPaise, p.previousNetPaise, p.flags.join(','), p.bankLast4,
    )
  }
  return { id: runId, hash: c.hash, totals: c.totals, unverifiedRules: c.unverifiedRules }
}

function runView(r, withDetail) {
  const out = {
    id: r.id,
    month: r.month,
    status: r.status,
    totals: { grossPaise: r.total_gross_paise, deductionsPaise: r.total_deductions_paise, netPaise: r.total_net_paise, employerPaise: r.total_employer_paise },
    flags: r.flags,
    employees: one('SELECT COUNT(*) AS n FROM payslips WHERE run_id = ?', r.id).n,
    preparedBy: r.prepared_name,
    approvedBy: r.approved_name ?? '',
    approvedAt: r.approved_at,
    paidAt: r.paid_at,
    version: r.version,
    inputsHash: r.inputs_hash.slice(0, 12),
  }
  if (withDetail) {
    out.payslips = all('SELECT p.*, e.employee_no, u.name FROM payslips p JOIN employees e ON e.id = p.employee_id JOIN users u ON u.id = e.user_id WHERE p.run_id = ? ORDER BY e.employee_no', r.id).map(slipView)
  }
  return out
}

const slipView = (p) => ({
  id: p.id,
  employeeNo: p.employee_no,
  name: p.name,
  daysInMonth: p.days_in_month,
  lopDays: p.lop_days,
  grossPaise: p.gross_paise,
  lopPaise: p.lop_paise,
  earnedPaise: p.earned_paise,
  deductions: JSON.parse(p.deductions),
  deductionsPaise: p.deductions_paise,
  employerPaise: p.employer_paise,
  netPaise: p.net_paise,
  previousNetPaise: p.previous_net_paise,
  flags: p.flag ? p.flag.split(',') : [],
  bankLast4: p.bank_last4,
})

const RUN_ROWS = 'SELECT r.*, p.name AS prepared_name, a.name AS approved_name FROM payroll_runs r JOIN users p ON p.id = r.prepared_by LEFT JOIN users a ON a.id = r.approved_by'

export function registerHr(r) {
  // ----- Leave: self-service -----

  r.get('/me/leave', requirePerm('self.service'), (req, res) => {
    const s = schoolOf(req)
    const e = employeeOf(s, req.user.id)
    if (!e) return res.json({ employee: false, balances: [], requests: [] })
    res.json({
      employee: true,
      balances: balancesFor(s, e.id),
      requests: all(`${LEAVE_ROWS} WHERE l.employee_id = ? ORDER BY l.from_date DESC LIMIT 50`, e.id).map(leaveView),
    })
  })

  r.post('/me/leave', requirePerm('self.service'), (req, res) => {
    const s = schoolOf(req)
    const e = employeeOf(s, req.user.id)
    if (!e) throw forbidden('employee.missing')
    const type = one('SELECT * FROM leave_types WHERE id = ? AND school_id = ?', id(req.body.typeId), s)
    if (!type) throw notFound()
    const from = date(req.body.from)
    const to = date(req.body.to)
    if (to < from) throw bad('invalid.range')
    if (from.slice(0, 4) !== to.slice(0, 4)) throw bad('leave.cross_year')
    const days = leaveDays(from, to)
    if (!days) throw bad('leave.no_working_days')
    if (one("SELECT 1 AS x FROM leave_requests WHERE employee_id = ? AND status IN ('pending', 'approved') AND from_date <= ? AND to_date >= ?", e.id, to, from)) throw conflict('leave.overlap')
    if (type.paid) {
      const b = balancesFor(s, e.id).find((x) => x.id === type.id)
      if (b.left < days) throw conflict('leave.insufficient')
    }
    const lid = insertId('INSERT INTO leave_requests (school_id, employee_id, leave_type_id, from_date, to_date, days, reason) VALUES (?, ?, ?, ?, ?, ?, ?)', s, e.id, type.id, from, to, days, text(req.body.reason, 300))
    notify(s, usersWithPerm(s, 'leave.approve').filter((u) => u !== req.user.id), {
      title: { en: `Leave request: ${req.user.name}`, kn: `ರಜೆ ಕೋರಿಕೆ: ${req.user.name}` },
      body: { en: `${type.name_en}, ${days} day(s) from ${from}.`, kn: `${type.name_kn}, ${from} ರಿಂದ ${days} ದಿನ.` },
      link: '/leave-approvals',
      source: `leave:${lid}`,
      kind: 'approval',
    })
    audit(req, 'leave.requested', { entityType: 'leave_request', entityId: lid, detail: { days, type: type.code } })
    res.status(201).json({ id: lid, days })
  })

  r.post('/me/leave/:id/cancel', requirePerm('self.service'), (req, res) => {
    const s = schoolOf(req)
    const e = employeeOf(s, req.user.id)
    const l = e && one('SELECT * FROM leave_requests WHERE id = ? AND employee_id = ?', id(req.params.id), e.id)
    if (!l) throw notFound()
    if (l.status !== 'pending' && !(l.status === 'approved' && l.from_date > isoDate())) throw conflict('leave.not_cancellable')
    run("UPDATE leave_requests SET status = 'cancelled' WHERE id = ?", l.id)
    audit(req, 'leave.cancelled', { entityType: 'leave_request', entityId: l.id })
    res.json({ ok: true })
  })

  // ----- Leave: approvers -----

  r.get('/hr/leave', requirePerm('leave.approve'), (req, res) => {
    const s = schoolOf(req)
    res.json({
      pending: all(`${LEAVE_ROWS} WHERE l.school_id = ? AND l.status = 'pending' ORDER BY l.from_date`, s).map((l) => ({ ...leaveView(l), mine: l.user_id === req.user.id })),
      recent: all(`${LEAVE_ROWS} WHERE l.school_id = ? AND l.status != 'pending' ORDER BY l.id DESC LIMIT 50`, s).map(leaveView),
      onLeaveToday: all(`${LEAVE_ROWS} WHERE l.school_id = ? AND l.status = 'approved' AND l.from_date <= ? AND l.to_date >= ?`, s, isoDate(), isoDate()).map(leaveView),
    })
  })

  r.post('/hr/leave/:id/decide', requirePerm('leave.approve'), (req, res) => {
    const s = schoolOf(req)
    const l = one(`${LEAVE_ROWS} WHERE l.id = ? AND l.school_id = ?`, id(req.params.id), s)
    if (!l) throw notFound()
    if (l.status !== 'pending') throw conflict('already.decided')
    notSelf(l.user_id, req.user.id)
    const approve = req.body.approve === true
    const note = text(req.body.note, 300)
    if (!approve && !note) throw bad('reason.required')
    run("UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = datetime('now'), decision_note = ? WHERE id = ?", approve ? 'approved' : 'rejected', req.user.id, note, l.id)
    notify(s, [l.user_id], {
      title: approve ? { en: 'Leave approved', kn: 'ರಜೆ ಅನುಮೋದಿಸಲಾಗಿದೆ' } : { en: 'Leave not approved', kn: 'ರಜೆ ಅನುಮೋದಿಸಲಾಗಿಲ್ಲ' },
      body: { en: `${l.type_en}, ${l.from_date} to ${l.to_date}. ${note}`, kn: `${l.type_kn}, ${l.from_date} ರಿಂದ ${l.to_date}. ${note}` },
      link: '/leave',
      source: `leave:${l.id}`,
    })
    audit(req, approve ? 'leave.approved' : 'leave.rejected', { entityType: 'leave_request', entityId: l.id })
    res.json({ ok: true })
  })

  // ----- Payroll -----

  const canSeePay = (req) => req.ctx.perms.has('hr.compensation.view')

  r.get('/hr/payroll', requirePerm(['payroll.prepare', 'payroll.approve']), (req, res) => {
    const s = schoolOf(req)
    res.json({
      canPrepare: req.ctx.perms.has('payroll.prepare'),
      canApprove: req.ctx.perms.has('payroll.approve'),
      canSeePay: canSeePay(req),
      runs: all(`${RUN_ROWS} WHERE r.school_id = ? ORDER BY r.month DESC, r.id DESC LIMIT 24`, s).map((x) => ({ ...runView(x, false), mine: x.prepared_by === req.user.id })),
      rules: rulesOf(s).map((x) => ({
        id: x.id, code: x.code, name: { en: x.name_en, kn: x.name_kn }, kind: x.kind, basis: x.basis, percentBp: x.percent_bp, fixedPaise: x.fixed_paise,
        baseCapPaise: x.base_cap_paise, minGrossPaise: x.min_gross_paise, maxGrossPaise: x.max_gross_paise, enabled: Boolean(x.enabled), verifiedBy: x.verified_by,
      })),
    })
  })

  // Rule changes are audited with the before and after values.
  r.patch('/hr/payroll/rules/:id', requirePerm('payroll.prepare'), (req, res) => {
    const s = schoolOf(req)
    const rule = one('SELECT * FROM payroll_rules WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!rule) throw notFound()
    const pct = req.body.percentBp === undefined ? rule.percent_bp : Number(req.body.percentBp)
    if (!Number.isInteger(pct) || pct < 0 || pct > 10000) throw bad('invalid.percent')
    const opt = (k, cur) => (req.body[k] === undefined ? cur : req.body[k] === null || req.body[k] === '' ? null : paise(req.body[k], { allowZero: true }))
    const next = {
      percent_bp: pct,
      fixed_paise: req.body.fixedPaise === undefined ? rule.fixed_paise : paise(req.body.fixedPaise, { allowZero: true }),
      base_cap_paise: opt('baseCapPaise', rule.base_cap_paise),
      min_gross_paise: opt('minGrossPaise', rule.min_gross_paise),
      max_gross_paise: opt('maxGrossPaise', rule.max_gross_paise),
      enabled: req.body.enabled === undefined ? rule.enabled : req.body.enabled ? 1 : 0,
      verified_by: req.body.verifiedBy === undefined ? rule.verified_by : text(req.body.verifiedBy, 120),
    }
    run(
      'UPDATE payroll_rules SET percent_bp = ?, fixed_paise = ?, base_cap_paise = ?, min_gross_paise = ?, max_gross_paise = ?, enabled = ?, verified_by = ? WHERE id = ?',
      next.percent_bp, next.fixed_paise, next.base_cap_paise, next.min_gross_paise, next.max_gross_paise, next.enabled, next.verified_by, rule.id,
    )
    audit(req, 'payroll.rule_changed', { entityType: 'payroll_rule', entityId: rule.code, detail: { before: { ...rule, id: undefined }, after: next } })
    res.json({ ok: true })
  })

  const prepare = (req, s, month) => {
    const out = storeRun(s, month, req.user.id)
    notify(s, usersWithPerm(s, 'payroll.approve').filter((u) => u !== req.user.id), {
      title: { en: `Payroll ${month} ready for approval`, kn: `${month} ವೇತನ ಅನುಮೋದನೆಗೆ ಸಿದ್ಧ` },
      link: '/payroll',
      source: `payroll:${out.id}`,
      kind: 'approval',
    })
    audit(req, 'payroll.prepared', { entityType: 'payroll_run', entityId: out.id, detail: { month, hash: out.hash, totals: out.totals } })
    return { id: out.id, unverifiedRules: out.unverifiedRules }
  }

  r.post('/hr/payroll/runs', requirePerm('payroll.prepare'), (req, res) => {
    const s = schoolOf(req)
    const month = String(req.body.month ?? '')
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('invalid.month')
    if (month > isoDate().slice(0, 7)) throw bad('payroll.future_month')
    res.status(201).json(transaction(() => prepare(req, s, month)))
  })

  // Replaces a draft with one calculated from today's inputs (e.g. after a late leave approval).
  r.post('/hr/payroll/runs/:id/recompute', requirePerm('payroll.prepare'), (req, res) => {
    const s = schoolOf(req)
    const x = one('SELECT * FROM payroll_runs WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!x) throw notFound()
    if (x.status !== 'draft') throw conflict('payroll.not_draft')
    const out = transaction(() => {
      run("UPDATE payroll_runs SET status = 'cancelled' WHERE id = ?", x.id)
      return prepare(req, s, x.month)
    })
    audit(req, 'payroll.recomputed', { entityType: 'payroll_run', entityId: x.id, detail: { replacedBy: out.id } })
    res.status(201).json(out)
  })

  // Approvers without pay access see totals and flags only, not individual pay.
  r.get('/hr/payroll/runs/:id', requirePerm(['payroll.prepare', 'payroll.approve']), (req, res) => {
    const s = schoolOf(req)
    const x = one(`${RUN_ROWS} WHERE r.id = ? AND r.school_id = ?`, id(req.params.id), s)
    if (!x) throw notFound()
    const detail = canSeePay(req)
    if (detail) audit(req, 'hr.compensation.read', { entityType: 'payroll_run', entityId: x.id })
    const current = x.status === 'draft' ? computePayroll(s, x.month) : null
    res.json({
      run: { ...runView(x, detail), mine: x.prepared_by === req.user.id },
      stale: current ? current.hash !== x.inputs_hash : false,
      unverifiedRules: current ? current.unverifiedRules : [],
      flagged: all("SELECT p.flag, e.employee_no FROM payslips p JOIN employees e ON e.id = p.employee_id WHERE p.run_id = ? AND p.flag != ''", x.id).map((p) => ({ employeeNo: p.employee_no, flags: p.flag.split(',') })),
    })
  })

  r.post('/hr/payroll/runs/:id/approve', requirePerm('payroll.approve'), (req, res) => {
    const s = schoolOf(req)
    const x = one('SELECT * FROM payroll_runs WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!x) throw notFound()
    checkVersion(x, req.body.version)
    if (x.status !== 'draft') throw conflict('payroll.not_draft')
    notSelf(x.prepared_by, req.user.id)
    // The approver approves exactly what was prepared: if anything changed since, it must be re-prepared.
    if (computePayroll(s, x.month).hash !== x.inputs_hash) throw conflict('payroll.stale')
    const lastDay = `${x.month}-${String(daysInMonth(x.month)).padStart(2, '0')}`
    transaction(() => {
      run("UPDATE payroll_runs SET status = 'approved', approved_by = ?, approved_at = datetime('now'), version = version + 1 WHERE id = ?", req.user.id, x.id)
      postJournal({
        schoolId: s,
        entryDate: lastDay < isoDate() ? lastDay : isoDate(),
        narration: `Payroll ${x.month}`,
        source: 'payroll',
        sourceRef: `run:${x.id}`,
        lines: [
          { account: '5000', debit: x.total_gross_paise },
          { account: '5010', debit: x.total_employer_paise },
          { account: '2200', credit: x.total_net_paise },
          { account: '2300', credit: x.total_deductions_paise + x.total_employer_paise },
        ],
        preparedBy: x.prepared_by,
        approvedBy: req.user.id,
      })
      notify(s, all('SELECT e.user_id FROM payslips p JOIN employees e ON e.id = p.employee_id WHERE p.run_id = ?', x.id).map((p) => p.user_id), {
        title: { en: `Payslip for ${x.month} is ready`, kn: `${x.month} ವೇತನ ಚೀಟಿ ಸಿದ್ಧವಾಗಿದೆ` },
        link: '/payslips',
        source: `payslip:${x.id}`,
      })
    })
    audit(req, 'payroll.approved', { entityType: 'payroll_run', entityId: x.id, detail: { month: x.month, net: x.total_net_paise } })
    res.json({ ok: true })
  })

  r.post('/hr/payroll/runs/:id/cancel', requirePerm('payroll.prepare'), (req, res) => {
    const s = schoolOf(req)
    const x = one('SELECT * FROM payroll_runs WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!x) throw notFound()
    if (x.status !== 'draft') throw conflict('payroll.not_draft')
    run("UPDATE payroll_runs SET status = 'cancelled' WHERE id = ?", x.id)
    audit(req, 'payroll.cancelled', { entityType: 'payroll_run', entityId: x.id })
    res.json({ ok: true })
  })

  r.post('/hr/payroll/runs/:id/paid', requirePerm('payroll.prepare'), (req, res) => {
    const s = schoolOf(req)
    const x = one('SELECT * FROM payroll_runs WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!x) throw notFound()
    if (x.status !== 'approved') throw conflict('payroll.not_approved')
    const reference = text(req.body.reference, 80)
    if (!reference) throw bad('reference.required')
    transaction(() => {
      run("UPDATE payroll_runs SET status = 'paid', paid_at = datetime('now'), version = version + 1 WHERE id = ?", x.id)
      postJournal({
        schoolId: s,
        narration: `Salaries paid for ${x.month} (${reference})`,
        source: 'payroll_payment',
        sourceRef: `run:${x.id}`,
        lines: [
          { account: '2200', debit: x.total_net_paise },
          { account: '1010', credit: x.total_net_paise },
        ],
        preparedBy: req.user.id,
        approvedBy: x.approved_by,
      })
    })
    audit(req, 'payroll.paid', { entityType: 'payroll_run', entityId: x.id, detail: { reference } })
    res.json({ ok: true })
  })

  // Bank upload file. Only people with pay access, and only for approved runs.
  r.get('/hr/payroll/runs/:id/bank.csv', requirePerm('payroll.prepare'), (req, res) => {
    const s = schoolOf(req)
    if (!canSeePay(req)) throw forbidden()
    const x = one('SELECT * FROM payroll_runs WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!x) throw notFound()
    if (!['approved', 'paid'].includes(x.status)) throw conflict('payroll.not_approved')
    const rows = all('SELECT e.employee_no, u.name, p.bank_last4, p.net_paise FROM payslips p JOIN employees e ON e.id = p.employee_id JOIN users u ON u.id = e.user_id WHERE p.run_id = ? ORDER BY e.employee_no', x.id)
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`
    const csv = ['employee_no,name,account_last4,amount_inr', ...rows.map((r) => [r.employee_no, r.name, r.bank_last4, (r.net_paise / 100).toFixed(2)].map(esc).join(','))].join('\n')
    audit(req, 'payroll.bank_file_downloaded', { entityType: 'payroll_run', entityId: x.id })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="salaries-${x.month}.csv"`)
    res.send(csv)
  })

  r.get('/me/payslips', requirePerm('self.service'), (req, res) => {
    const s = schoolOf(req)
    const e = employeeOf(s, req.user.id)
    if (!e) return res.json({ payslips: [] })
    res.json({
      payslips: all(
        `SELECT p.*, r.month, r.status AS run_status, e.employee_no, u.name FROM payslips p JOIN payroll_runs r ON r.id = p.run_id JOIN employees e ON e.id = p.employee_id JOIN users u ON u.id = e.user_id
         WHERE p.employee_id = ? AND r.status IN ('approved', 'paid') ORDER BY r.month DESC LIMIT 24`,
        e.id,
      ).map((p) => ({ ...slipView(p), month: p.month, paid: p.run_status === 'paid' })),
    })
  })
}
