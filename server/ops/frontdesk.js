// Library, reception (visitors and verified pickup), and lookups used by the
// front-desk screens.
import { audit, currentYear, requirePerm } from '../access.js'
import { all, one, run, transaction } from '../db.js'
import { addDays, isoDate } from '../dates.js'
import { bad, forbidden, id, notFound, required, text } from '../http.js'
import { childrenFor, conflict, guardiansOf, insertId, nextNumber, nextSeq, notify, oneOf, postJournal, requireWorkspace, schoolOf, studentOf } from './common.js'

// School library settings (change here or make them school settings later).
export const LIBRARY = { studentLimit: 2, staffLimit: 5, loanDays: 14, finePerDayPaise: 100, maxFinePaise: 10000 }

// ---------- Lookups ----------

// Student search for the desks that need it. Names and classes only.
export function registerLookups(r) {
  const DESKS = ['students.view', 'fees.view', 'admissions.manage', 'transport.manage', 'library.manage', 'visitors.manage', 'health.record', 'safeguarding.report', 'safeguarding.view']
  r.get('/lookup/students', requirePerm(DESKS), (req, res) => {
    const s = schoolOf(req)
    const year = currentYear(s)
    const q = `%${text(req.query.q, 60)}%`
    res.json({
      students: all(
        `SELECT u.id, u.name, e.admission_no, sec.label_en, sec.label_kn FROM enrollments e JOIN users u ON u.id = e.student_user_id JOIN sections sec ON sec.id = e.section_id
         WHERE e.school_id = ? AND e.academic_year_id = ? AND e.status = 'active' AND (u.name LIKE ? OR e.admission_no LIKE ?) ORDER BY u.name LIMIT 20`,
        s, year?.id ?? -1, q, q,
      ).map((x) => ({ id: x.id, name: x.name, admissionNo: x.admission_no, section: { en: x.label_en, kn: x.label_kn } })),
    })
  })

  // Guardians of a student, for consent and pickup checks.
  r.get('/lookup/students/:id/guardians', requirePerm(['transport.manage', 'visitors.manage', 'fees.view', 'students.view']), (req, res) => {
    const s = schoolOf(req)
    const st = studentOf(s, id(req.params.id))
    res.json({
      student: { id: st.id, name: st.name, admissionNo: st.admission_no, section: { en: st.section_en, kn: st.section_kn } },
      guardians: guardiansOf(s, st.id).map((g) => ({
        id: g.guardian_user_id, name: g.name, relationship: g.relationship, canPickup: Boolean(g.can_pickup), mobileEnd: g.mobile ? g.mobile.slice(-4) : '', restriction: g.restriction_note,
      })),
    })
  })
}

// ---------- Library ----------

function loanRows(where, ...params) {
  const today = isoDate()
  return all(
    `SELECT l.*, b.title, b.author, c.accession_no, u.name AS borrower FROM library_loans l JOIN book_copies c ON c.id = l.copy_id JOIN books b ON b.id = c.book_id
     JOIN users u ON u.id = l.borrower_user_id WHERE ${where} ORDER BY l.returned_on IS NOT NULL, l.due_on, l.id DESC LIMIT 200`,
    ...params,
  ).map((l) => {
    const late = !l.returned_on && l.due_on < today ? Math.floor((Date.parse(today) - Date.parse(l.due_on)) / 864e5) : 0
    return {
      id: l.id, title: l.title, author: l.author, accessionNo: l.accession_no, borrower: l.borrower, borrowerId: l.borrower_user_id, issuedOn: l.issued_on, dueOn: l.due_on, returnedOn: l.returned_on,
      overdueDays: late, finePaise: l.returned_on ? l.fine_paise : Math.min(late * LIBRARY.finePerDayPaise, LIBRARY.maxFinePaise), fineStatus: l.fine_status,
    }
  })
}

// Accepts an admission number, an employee number or an email.
function findBorrower(schoolId, ref) {
  const v = required(ref, 120)
  const u =
    one("SELECT user_id AS id FROM login_identifiers WHERE school_id = ? AND value = ? COLLATE NOCASE", schoolId, v) ??
    one('SELECT id FROM users WHERE email = ? COLLATE NOCASE', v)
  if (!u) throw notFound()
  const m = all("SELECT role FROM memberships WHERE user_id = ? AND school_id = ? AND status = 'active'", u.id, schoolId)
  if (!m.length) throw notFound()
  return { id: u.id, student: m.some((x) => x.role === 'student'), staff: m.some((x) => !['student', 'guardian'].includes(x.role)) }
}

export function registerLibrary(r) {
  r.get('/library', requirePerm('library.manage'), (req, res) => {
    const s = schoolOf(req)
    const q = `%${text(req.query.q, 60)}%`
    res.json({
      settings: LIBRARY,
      books: all(
        `SELECT b.*, (SELECT COUNT(*) FROM book_copies c WHERE c.book_id = b.id AND c.status != 'withdrawn') AS copies,
                (SELECT COUNT(*) FROM book_copies c WHERE c.book_id = b.id AND c.status = 'available') AS available,
                (SELECT group_concat(c.accession_no, ', ') FROM book_copies c WHERE c.book_id = b.id AND c.status = 'available') AS available_list
         FROM books b WHERE b.school_id = ? AND (b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?) ORDER BY b.title LIMIT 200`,
        s, q, q, q,
      ).map((b) => ({ id: b.id, title: b.title, author: b.author, isbn: b.isbn, language: b.language, subject: b.subject, copies: b.copies, available: b.available, availableCopies: b.available_list ?? '' })),
      loans: loanRows("l.school_id = ? AND (l.returned_on IS NULL OR l.fine_status = 'due')", s),
      stats: {
        onLoan: one('SELECT COUNT(*) AS n FROM library_loans WHERE school_id = ? AND returned_on IS NULL', s).n,
        overdue: one('SELECT COUNT(*) AS n FROM library_loans WHERE school_id = ? AND returned_on IS NULL AND due_on < ?', s, isoDate()).n,
        titles: one('SELECT COUNT(*) AS n FROM books WHERE school_id = ?', s).n,
      },
    })
  })

  r.post('/library/books', requirePerm('library.manage'), (req, res) => {
    const s = schoolOf(req)
    const copies = Number(req.body.copies ?? 1)
    if (!Number.isInteger(copies) || copies < 1 || copies > 50) throw bad('invalid.qty')
    const out = transaction(() => {
      const bid = insertId(
        'INSERT INTO books (school_id, isbn, title, author, language, subject) VALUES (?, ?, ?, ?, ?, ?)',
        s, text(req.body.isbn, 20), required(req.body.title, 200), text(req.body.author, 120), oneOf(req.body.language ?? 'en', ['en', 'kn', 'hi', 'other']), text(req.body.subject, 60),
      )
      const acc = []
      for (let i = 0; i < copies; i++) {
        const no = `ACC-${String(nextSeq(s, 'ACC', 'all')).padStart(5, '0')}`
        run('INSERT INTO book_copies (school_id, book_id, accession_no) VALUES (?, ?, ?)', s, bid, no)
        acc.push(no)
      }
      return { id: bid, accessionNos: acc }
    })
    audit(req, 'library.book_added', { entityType: 'book', entityId: out.id, detail: { copies } })
    res.status(201).json(out)
  })

  r.post('/library/issue', requirePerm('library.manage'), (req, res) => {
    const s = schoolOf(req)
    const copy = one('SELECT * FROM book_copies WHERE school_id = ? AND accession_no = ? COLLATE NOCASE', s, required(req.body.accessionNo, 20))
    if (!copy) throw notFound()
    if (copy.status !== 'available') throw conflict('library.not_available')
    const who = findBorrower(s, req.body.borrower)
    const limit = who.staff ? LIBRARY.staffLimit : LIBRARY.studentLimit
    if (one('SELECT COUNT(*) AS n FROM library_loans WHERE borrower_user_id = ? AND school_id = ? AND returned_on IS NULL', who.id, s).n >= limit) throw conflict('library.limit')
    if (one("SELECT 1 AS x FROM library_loans WHERE borrower_user_id = ? AND school_id = ? AND fine_status = 'due'", who.id, s)) throw conflict('library.fine_due')
    const due = addDays(isoDate(), LIBRARY.loanDays)
    const lid = transaction(() => {
      run("UPDATE book_copies SET status = 'on_loan' WHERE id = ?", copy.id)
      return insertId('INSERT INTO library_loans (school_id, copy_id, borrower_user_id, issued_by, issued_on, due_on) VALUES (?, ?, ?, ?, ?, ?)', s, copy.id, who.id, req.user.id, isoDate(), due)
    })
    audit(req, 'library.issued', { entityType: 'library_loan', entityId: lid })
    res.status(201).json({ id: lid, dueOn: due })
  })

  r.post('/library/return', requirePerm('library.manage'), (req, res) => {
    const s = schoolOf(req)
    const copy = one('SELECT * FROM book_copies WHERE school_id = ? AND accession_no = ? COLLATE NOCASE', s, required(req.body.accessionNo, 20))
    if (!copy) throw notFound()
    const loan = one('SELECT * FROM library_loans WHERE copy_id = ? AND returned_on IS NULL', copy.id)
    if (!loan) throw conflict('library.not_on_loan')
    const today = isoDate()
    const late = loan.due_on < today ? Math.floor((Date.parse(today) - Date.parse(loan.due_on)) / 864e5) : 0
    const fine = Math.min(late * LIBRARY.finePerDayPaise, LIBRARY.maxFinePaise)
    transaction(() => {
      run('UPDATE library_loans SET returned_on = ?, fine_paise = ?, fine_status = ? WHERE id = ?', today, fine, fine ? 'due' : 'none', loan.id)
      run("UPDATE book_copies SET status = 'available' WHERE id = ?", copy.id)
    })
    audit(req, 'library.returned', { entityType: 'library_loan', entityId: loan.id, detail: { lateDays: late, fine } })
    res.json({ ok: true, lateDays: late, finePaise: fine })
  })

  // Collect or waive a fine. Waiving needs a reason; collecting posts to the books.
  r.post('/library/loans/:id/fine', requirePerm('library.manage'), (req, res) => {
    const s = schoolOf(req)
    const loan = one("SELECT * FROM library_loans WHERE id = ? AND school_id = ? AND fine_status = 'due'", id(req.params.id), s)
    if (!loan) throw notFound()
    const action = oneOf(req.body.action, ['paid', 'waived'])
    const reason = text(req.body.reason, 200)
    if (action === 'waived' && !reason) throw bad('reason.required')
    transaction(() => {
      run('UPDATE library_loans SET fine_status = ? WHERE id = ?', action, loan.id)
      if (action === 'paid') {
        postJournal({
          schoolId: s,
          narration: `Library fine, loan ${loan.id}`,
          source: 'manual',
          sourceRef: `library-fine:${loan.id}`,
          lines: [
            { account: '1000', debit: loan.fine_paise },
            { account: '4100', credit: loan.fine_paise },
          ],
          preparedBy: req.user.id,
          approvedBy: req.user.id,
        })
      }
    })
    audit(req, `library.fine_${action}`, { entityType: 'library_loan', entityId: loan.id, detail: { amount: loan.fine_paise, reason } })
    res.json({ ok: true })
  })

  // A student's own loans, and a parent's view of their children's.
  r.get('/me/library', requireWorkspace, (req, res) => {
    const s = schoolOf(req)
    const ids = req.ctx.kind === 'guardian' ? childrenFor(req).map((c) => c.id) : [req.user.id]
    if (!ids.length) return res.json({ loans: [], settings: LIBRARY })
    res.json({
      settings: LIBRARY,
      loans: loanRows(`l.school_id = ? AND l.borrower_user_id IN (${ids.map(() => '?').join(',')}) AND (l.returned_on IS NULL OR l.returned_on >= ?)`, s, ...ids, addDays(isoDate(), -60)),
    })
  })
}

// ---------- Reception ----------

const pickupView = (p) => ({
  id: p.id,
  student: p.student,
  studentId: p.student_user_id,
  section: p.label_en ? { en: p.label_en, kn: p.label_kn } : null,
  reason: p.reason,
  pickupName: p.pickup_name,
  verification: p.verification,
  overrideReason: p.override_reason,
  status: p.status,
  recordedBy: p.recorded_name,
  decidedBy: p.decided_name ?? '',
  createdAt: p.created_at,
  releasedAt: p.released_at,
})

export function registerReception(r) {
  r.get('/reception', requirePerm('visitors.manage'), (req, res) => {
    const s = schoolOf(req)
    const today = isoDate()
    const year = currentYear(s)
    res.json({
      canOverride: req.ctx.perms.has('pickup.override'),
      visitors: all(
        "SELECT v.*, u.name AS recorded_name FROM visitors v JOIN users u ON u.id = v.recorded_by WHERE v.school_id = ? AND (v.checked_out_at IS NULL OR substr(v.checked_in_at, 1, 10) >= ?) ORDER BY v.checked_out_at IS NULL DESC, v.id DESC LIMIT 100",
        s, addDays(today, -1),
      ).map((v) => ({ id: v.id, passNo: v.pass_no, name: v.name, mobile: v.mobile, purpose: v.purpose, host: v.host, kind: v.kind, in: v.checked_in_at, out: v.checked_out_at, recordedBy: v.recorded_name })),
      pickups: all(
        `SELECT p.*, u.name AS student, sec.label_en, sec.label_kn, r.name AS recorded_name, d.name AS decided_name FROM pickup_requests p JOIN users u ON u.id = p.student_user_id
         LEFT JOIN enrollments e ON e.student_user_id = p.student_user_id AND e.school_id = p.school_id AND e.academic_year_id = ? LEFT JOIN sections sec ON sec.id = e.section_id
         JOIN users r ON r.id = p.recorded_by LEFT JOIN users d ON d.id = p.decided_by
         WHERE p.school_id = ? AND (p.status = 'waiting' OR substr(p.created_at, 1, 10) >= ?) ORDER BY p.status = 'waiting' DESC, p.id DESC LIMIT 100`,
        year?.id ?? -1, s, addDays(today, -1),
      ).map(pickupView),
      onSite: one('SELECT COUNT(*) AS n FROM visitors WHERE school_id = ? AND checked_out_at IS NULL', s).n,
    })
  })

  r.post('/reception/visitors', requirePerm('visitors.manage'), (req, res) => {
    const s = schoolOf(req)
    const pass = nextNumber(s, 'VIS', isoDate().replace(/-/g, ''), 3)
    const vid = insertId(
      'INSERT INTO visitors (school_id, pass_no, name, mobile, purpose, host, kind, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      s, pass, required(req.body.name, 120), text(req.body.mobile, 20), required(req.body.purpose, 200), text(req.body.host, 120),
      oneOf(req.body.kind ?? 'visitor', ['visitor', 'parent', 'contractor', 'delivery', 'official']), req.user.id,
    )
    audit(req, 'reception.visitor_in', { entityType: 'visitor', entityId: pass })
    res.status(201).json({ id: vid, passNo: pass })
  })

  r.post('/reception/visitors/:id/checkout', requirePerm('visitors.manage'), (req, res) => {
    const s = schoolOf(req)
    const v = one('SELECT * FROM visitors WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!v) throw notFound()
    if (v.checked_out_at) throw conflict('visitor.already_out')
    run("UPDATE visitors SET checked_out_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", v.id)
    audit(req, 'reception.visitor_out', { entityType: 'visitor', entityId: v.pass_no })
    res.json({ ok: true })
  })

  r.post('/reception/pickups', requirePerm('visitors.manage'), (req, res) => {
    const s = schoolOf(req)
    const st = studentOf(s, id(req.body.studentId))
    if (one("SELECT 1 AS x FROM pickup_requests WHERE school_id = ? AND student_user_id = ? AND status = 'waiting'", s, st.id)) throw conflict('pickup.exists')
    const pid = insertId('INSERT INTO pickup_requests (school_id, student_user_id, reason, pickup_name, recorded_by) VALUES (?, ?, ?, ?, ?)', s, st.id, required(req.body.reason, 200), required(req.body.pickupName, 120), req.user.id)
    audit(req, 'reception.pickup_requested', { entityType: 'pickup', entityId: pid, detail: { student: st.id } })
    res.status(201).json({ id: pid })
  })

  // A child is released only to a verified guardian allowed to pick up, unless
  // someone with override permission records why (audited and the family is told).
  r.post('/reception/pickups/:id/release', requirePerm('visitors.manage'), (req, res) => {
    const s = schoolOf(req)
    const p = one('SELECT * FROM pickup_requests WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!p) throw notFound()
    if (p.status !== 'waiting') throw conflict('pickup.closed')
    const approved = guardiansOf(s, p.student_user_id, 'can_pickup')
    const gid = req.body.guardianId ? Number(req.body.guardianId) : null
    const match = gid ? approved.find((g) => g.guardian_user_id === gid) : null
    let verification
    if (match) verification = 'approved_guardian'
    else {
      const reason = text(req.body.overrideReason, 300)
      if (!req.body.override || reason.length < 10) {
        audit(req, 'reception.pickup_refused_unlisted', { outcome: 'denied', entityType: 'pickup', entityId: p.id })
        throw forbidden('pickup.not_approved')
      }
      if (!req.ctx.perms.has('pickup.override')) {
        audit(req, 'reception.pickup_override_denied', { outcome: 'denied', entityType: 'pickup', entityId: p.id })
        throw forbidden('pickup.override_required')
      }
      verification = 'override'
    }
    const st = one('SELECT name FROM users WHERE id = ?', p.student_user_id)
    transaction(() => {
      run(
        "UPDATE pickup_requests SET status = 'released', verification = ?, pickup_guardian_user_id = ?, override_reason = ?, decided_by = ?, released_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        verification, match?.guardian_user_id ?? null, verification === 'override' ? text(req.body.overrideReason, 300) : '', req.user.id, p.id,
      )
      notify(s, guardiansOf(s, p.student_user_id, 'can_receive_comms').map((g) => g.guardian_user_id), {
        title: { en: `${st.name} left school early with ${match?.name ?? p.pickup_name}`, kn: `${st.name} ${match?.name ?? p.pickup_name} ಅವರೊಂದಿಗೆ ಬೇಗ ಶಾಲೆಯಿಂದ ತೆರಳಿದರು` },
        body: { en: `Reason: ${p.reason}`, kn: `ಕಾರಣ: ${p.reason}` },
        source: `pickup:${p.id}`,
        kind: verification === 'override' ? 'alert' : 'info',
      })
    })
    audit(req, verification === 'override' ? 'reception.pickup_override' : 'reception.pickup_released', { entityType: 'pickup', entityId: p.id, detail: { verification, guardian: match?.guardian_user_id, overrideReason: req.body.overrideReason } })
    res.json({ ok: true, verification })
  })

  r.post('/reception/pickups/:id/refuse', requirePerm('visitors.manage'), (req, res) => {
    const s = schoolOf(req)
    const p = one('SELECT * FROM pickup_requests WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!p) throw notFound()
    if (p.status !== 'waiting') throw conflict('pickup.closed')
    run("UPDATE pickup_requests SET status = 'refused', decided_by = ? WHERE id = ?", req.user.id, p.id)
    audit(req, 'reception.pickup_refused', { entityType: 'pickup', entityId: p.id, detail: { reason: text(req.body.reason, 200) } })
    res.json({ ok: true })
  })
}
