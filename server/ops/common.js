// Shared building blocks for the operations modules: document numbers, the
// in-app inbox, double-entry posting, approvals and lookups.
import { ROLES } from '../../shared/roles.js'
import { currentYear } from '../access.js'
import { all, one, run } from '../db.js'
import { isoDate } from '../dates.js'
import { HttpError, bad, forbidden, notFound } from '../http.js'
import { financialYearFor } from '../tenancy.js'

export const insertId = (sql, ...p) => Number(run(sql, ...p).lastInsertRowid)

// Module screens work inside one school. Group-level workspaces only see roll-ups.
export function schoolOf(req) {
  if (!req.ctx?.schoolId) throw forbidden('school.required')
  return req.ctx.schoolId
}

export function yearOf(schoolId) {
  const y = currentYear(schoolId)
  if (!y) throw new HttpError(409, 'year.missing')
  return y
}

// ---------- Validation ----------

// Money arrives as integer paise. Anything else is refused rather than rounded.
export function paise(v, { allowZero = false } = {}) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0 || (!allowZero && n === 0) || n > 10_000_000_000) throw bad('invalid.amount')
  return n
}

export function oneOf(v, options, code = 'invalid') {
  if (!options.includes(v)) throw bad(code)
  return v
}

export function date(v, code = 'invalid.date') {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad(code)
  return v
}

// Optimistic concurrency: a stale screen cannot overwrite someone else's change.
export function checkVersion(row, version) {
  if (version !== undefined && version !== null && Number(version) !== row.version) throw new HttpError(409, 'conflict.stale')
}

// Maker-checker: the person who asked for something cannot approve it.
export function notSelf(requesterId, approverId) {
  if (requesterId === approverId) throw forbidden('approval.self')
}

export const conflict = (code) => new HttpError(409, code)

// ---------- Document numbers ----------

// Gap-free running numbers per school, kind and period, e.g. RCPT/2026-27/000001.
export function nextSeq(schoolId, kind, period) {
  return one(
    `INSERT INTO doc_sequences (school_id, kind, period, next_no) VALUES (?, ?, ?, 1)
     ON CONFLICT (school_id, kind, period) DO UPDATE SET next_no = next_no + 1
     RETURNING next_no`,
    schoolId, kind, period,
  ).next_no
}
export const nextNumber = (schoolId, kind, period, width = 6) => `${kind}/${period}/${String(nextSeq(schoolId, kind, period)).padStart(width, '0')}`

export const fyPeriod = (d = isoDate()) => financialYearFor(d).label.replace('FY ', '')
export const ayPeriod = (schoolId) => yearOf(schoolId).label

// ---------- People ----------

const ACTIVE = `m.status = 'active' AND m.valid_from <= :today AND (m.valid_to IS NULL OR m.valid_to >= :today)`

// Everyone whose active membership in this school carries the permission.
export function usersWithPerm(schoolId, perm) {
  const rows = all(
    `SELECT m.id, m.user_id, m.role FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.school_id = :school AND u.disabled_at IS NULL AND ${ACTIVE}`,
    { school: schoolId, today: isoDate() },
  )
  const ids = new Set()
  for (const m of rows) {
    const has = ROLES[m.role]?.perms.includes(perm) || one('SELECT 1 AS x FROM membership_grants WHERE membership_id = ? AND permission = ?', m.id, perm)
    if (has) ids.add(m.user_id)
  }
  return [...ids]
}

export function usersWithRole(schoolId, role) {
  return all(`SELECT DISTINCT m.user_id FROM memberships m WHERE m.school_id = :school AND m.role = :role AND ${ACTIVE}`, { school: schoolId, role, today: isoDate() }).map((r) => r.user_id)
}

export function staffUsers(schoolId) {
  const kinds = new Set(['admin', 'teacher', 'worker'])
  const rows = all(`SELECT DISTINCT m.user_id, m.role FROM memberships m WHERE m.school_id = :school AND ${ACTIVE}`, { school: schoolId, today: isoDate() })
  return [...new Set(rows.filter((r) => kinds.has(ROLES[r.role]?.kind)).map((r) => r.user_id))]
}

// A student of this school in the current year, with class details.
export function studentOf(schoolId, studentId) {
  const year = yearOf(schoolId)
  const s = one(
    `SELECT u.id, u.name, u.first_name_en, u.first_name_kn, e.admission_no, e.section_id, sec.label_en AS section_en, sec.label_kn AS section_kn, g.level AS grade_level
     FROM enrollments e JOIN users u ON u.id = e.student_user_id
     JOIN sections sec ON sec.id = e.section_id JOIN grades g ON g.id = sec.grade_id
     WHERE e.school_id = ? AND e.academic_year_id = ? AND e.student_user_id = ? AND e.status = 'active'`,
    schoolId, year.id, Number(studentId),
  )
  if (!s) throw notFound()
  return s
}

// Verified, active guardians of a child, optionally only those allowed a given thing.
export function guardiansOf(schoolId, studentId, flag) {
  const cond = flag ? `AND l.${oneOf(flag, ['can_pickup', 'can_view_fees', 'can_view_health', 'can_receive_comms'])} = 1` : ''
  return all(
    `SELECT l.*, u.name, u.mobile, u.email FROM guardian_links l JOIN users u ON u.id = l.guardian_user_id
     WHERE l.school_id = ? AND l.student_user_id = ? AND l.status = 'active' AND l.verified_at IS NOT NULL AND u.disabled_at IS NULL ${cond}
     ORDER BY l.is_primary DESC, u.name`,
    schoolId, studentId,
  )
}

// The children a guardian may see for a purpose (fees, health, ...).
export function childrenFor(req, flag) {
  const year = currentYear(req.ctx.schoolId)
  const cond = flag ? `AND l.${oneOf(flag, ['can_pickup', 'can_view_fees', 'can_view_health', 'can_receive_comms'])} = 1` : ''
  return all(
    `SELECT u.id, u.name, u.first_name_en, u.first_name_kn, e.admission_no, sec.label_en AS section_en, sec.label_kn AS section_kn
     FROM guardian_links l JOIN users u ON u.id = l.student_user_id
     LEFT JOIN enrollments e ON e.student_user_id = u.id AND e.school_id = l.school_id AND e.academic_year_id = ? AND e.status = 'active'
     LEFT JOIN sections sec ON sec.id = e.section_id
     WHERE l.school_id = ? AND l.guardian_user_id = ? AND l.status = 'active' AND l.verified_at IS NOT NULL ${cond}
     ORDER BY u.name`,
    year?.id ?? -1, req.ctx.schoolId, req.user.id,
  )
}

export const nameOf = (userId) => (userId ? one('SELECT name FROM users WHERE id = ?', userId)?.name ?? '' : '')

// ---------- Inbox ----------

// Writes an in-app notification for each person (deduplicated).
export function notify(schoolId, userIds, { title, body = { en: '', kn: '' }, link = '', source = '', kind = 'info' }) {
  const ids = [...new Set(userIds.filter(Boolean))]
  for (const uid of ids) {
    run(
      'INSERT INTO notifications (school_id, user_id, kind, title_en, title_kn, body_en, body_kn, link, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      schoolId, uid, kind, title.en, title.kn, body.en ?? '', body.kn ?? '', link, source,
    )
  }
  return ids.length
}

// Queues an SMS/email for the delivery adapter (not connected in this build).
export function queueOutbox(schoolId, channel, recipient, template, payload = {}) {
  if (!recipient) return
  run('INSERT INTO outbox (school_id, channel, recipient, template, payload) VALUES (?, ?, ?, ?, ?)', schoolId, channel, recipient, template, JSON.stringify(payload))
}

// ---------- Accounting ----------

// Starting chart of accounts. Codes are referenced by the automatic postings.
export const CHART = [
  ['1000', 'Cash in hand', 'ಕೈಯಲ್ಲಿರುವ ನಗದು', 'asset'],
  ['1010', 'Bank account', 'ಬ್ಯಾಂಕ್ ಖಾತೆ', 'asset'],
  ['1020', 'Payment gateway clearing', 'ಪಾವತಿ ಗೇಟ್‌ವೇ ತೀರುವೆ', 'asset'],
  ['1100', 'Fees receivable', 'ಬರಬೇಕಾದ ಶುಲ್ಕ', 'asset'],
  ['1300', 'Fixed assets', 'ಸ್ಥಿರ ಆಸ್ತಿಗಳು', 'asset'],
  ['2000', 'Fees received in advance', 'ಮುಂಗಡ ಶುಲ್ಕ', 'liability'],
  ['2100', 'Suppliers payable', 'ಪೂರೈಕೆದಾರರಿಗೆ ಕೊಡಬೇಕಾದದ್ದು', 'liability'],
  ['2200', 'Salaries payable', 'ಕೊಡಬೇಕಾದ ವೇತನ', 'liability'],
  ['2300', 'Payroll deductions payable', 'ಕೊಡಬೇಕಾದ ವೇತನ ಕಡಿತಗಳು', 'liability'],
  ['3000', 'General fund', 'ಸಾಮಾನ್ಯ ನಿಧಿ', 'equity'],
  ['4000', 'Tuition fee income', 'ಬೋಧನಾ ಶುಲ್ಕ ಆದಾಯ', 'income'],
  ['4010', 'Transport fee income', 'ಸಾರಿಗೆ ಶುಲ್ಕ ಆದಾಯ', 'income'],
  ['4020', 'Other fee income', 'ಇತರ ಶುಲ್ಕ ಆದಾಯ', 'income'],
  ['4100', 'Library fines', 'ಗ್ರಂಥಾಲಯ ದಂಡ', 'income'],
  ['5000', 'Salaries and wages', 'ವೇತನಗಳು', 'expense'],
  ['5010', 'Employer contributions', 'ಉದ್ಯೋಗದಾತರ ಕೊಡುಗೆ', 'expense'],
  ['5100', 'Purchases and supplies', 'ಖರೀದಿ ಮತ್ತು ಸರಬರಾಜು', 'expense'],
  ['5200', 'Bank and gateway charges', 'ಬ್ಯಾಂಕ್ ಮತ್ತು ಗೇಟ್‌ವೇ ಶುಲ್ಕ', 'expense'],
  ['5300', 'Fee concessions', 'ಶುಲ್ಕ ರಿಯಾಯಿತಿ', 'expense'],
]

export function ensureChart(schoolId) {
  for (const [code, en, kn, type] of CHART) {
    run('INSERT OR IGNORE INTO ledger_accounts (school_id, code, name_en, name_kn, type) VALUES (?, ?, ?, ?, ?)', schoolId, code, en, kn, type)
  }
}

export function isLocked(schoolId, entryDate) {
  return !!one('SELECT 1 AS x FROM period_locks WHERE school_id = ? AND month = ?', schoolId, entryDate.slice(0, 7))
}

// Posts a balanced journal. The same (source, sourceRef) is posted only once, so
// retries and re-runs never double-count. Locked months refuse new entries.
export function postJournal({ schoolId, entryDate = isoDate(), narration, source, sourceRef, lines, preparedBy = null, approvedBy = null, reversesId = null }) {
  const existing = one('SELECT id FROM journals WHERE school_id = ? AND source = ? AND source_ref = ?', schoolId, source, sourceRef)
  if (existing) return existing.id
  const clean = lines.filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0)
  const dr = clean.reduce((s, l) => s + (l.debit ?? 0), 0)
  const cr = clean.reduce((s, l) => s + (l.credit ?? 0), 0)
  if (!clean.length || dr !== cr || dr <= 0) throw bad('journal.unbalanced')
  if (isLocked(schoolId, entryDate)) throw conflict('period.locked')
  ensureChart(schoolId)
  const number = nextNumber(schoolId, 'JV', fyPeriod(entryDate))
  const jid = insertId(
    'INSERT INTO journals (school_id, number, entry_date, narration, source, source_ref, reverses_id, prepared_by, approved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    schoolId, number, entryDate, narration, source, sourceRef, reversesId, preparedBy, approvedBy,
  )
  for (const l of clean) {
    const acc = one('SELECT id FROM ledger_accounts WHERE school_id = ? AND code = ?', schoolId, l.account)
    if (!acc) throw bad('account.unknown')
    if ((l.debit ?? 0) > 0 && (l.credit ?? 0) > 0) throw bad('journal.unbalanced')
    run('INSERT INTO journal_lines (journal_id, account_id, debit_paise, credit_paise) VALUES (?, ?, ?, ?)', jid, acc.id, l.debit ?? 0, l.credit ?? 0)
  }
  return jid
}

// Posts the mirror image of a journal (debits become credits).
export function reverseJournal(schoolId, journalId, { narration, sourceRef, preparedBy, approvedBy, entryDate = isoDate() }) {
  const j = one('SELECT * FROM journals WHERE id = ? AND school_id = ?', journalId, schoolId)
  if (!j) throw notFound()
  if (one('SELECT 1 AS x FROM journals WHERE reverses_id = ?', j.id)) throw conflict('journal.already_reversed')
  const lines = all('SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l JOIN ledger_accounts a ON a.id = l.account_id WHERE l.journal_id = ?', j.id)
  return postJournal({
    schoolId,
    entryDate,
    narration: narration ?? `Reversal of ${j.number}`,
    source: 'reversal',
    sourceRef: sourceRef ?? `rev:${j.id}`,
    lines: lines.map((l) => ({ account: l.code, debit: l.credit_paise, credit: l.debit_paise })),
    preparedBy,
    approvedBy,
    reversesId: j.id,
  })
}

// Pages through a list with ?limit.
export const limitOf = (req, def = 200) => Math.min(Math.max(Number(req.query.limit) || def, 1), 1000)

// Any signed-in person with an open (MFA-complete) workspace.
export function requireWorkspace(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth.required' })
  if (!req.ctx) return res.status(403).json({ error: 'workspace.required' })
  if (req.ctx.mfaPending) return res.status(403).json({ error: 'mfa.required' })
  next()
}
