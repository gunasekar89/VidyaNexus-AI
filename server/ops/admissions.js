// Admissions: enquiry → application → documents → offer → acceptance →
// enrollment. Enrollment creates the student, finds or creates the guardian,
// links them (verified), and raises the year's fees, all in one transaction.
import crypto from 'node:crypto'
import { audit, requirePerm } from '../access.js'
import { hashPassword, newToken, sha256 } from '../auth.js'
import { all, one, run, transaction } from '../db.js'
import { addDays, isoDate } from '../dates.js'
import { bad, id, notFound, required, text } from '../http.js'
import { normalizeMobile } from '../identity.js'
import { enrollStudent } from '../tenancy.js'
import { checkVersion, conflict, date, insertId, nextNumber, nextSeq, notify, oneOf, queueOutbox, schoolOf, yearOf } from './common.js'
import { generateForStudent } from './fees.js'

const STATUSES = ['enquiry', 'applied', 'documents_verified', 'offered', 'accepted', 'enrolled', 'waitlisted', 'rejected', 'withdrawn']
const NEXT = {
  enquiry: ['applied', 'rejected', 'withdrawn'],
  applied: ['documents_verified', 'waitlisted', 'rejected', 'withdrawn'],
  documents_verified: ['offered', 'waitlisted', 'rejected', 'withdrawn'],
  waitlisted: ['offered', 'rejected', 'withdrawn'],
  offered: ['accepted', 'rejected', 'withdrawn'],
  accepted: ['withdrawn'],
}
const NEEDS_REASON = ['waitlisted', 'rejected', 'withdrawn']
const SOURCES = ['walk_in', 'website', 'phone', 'referral', 'sibling', 'event', 'other']
const RELATIONSHIPS = ['mother', 'father', 'guardian', 'grandparent', 'other']
const DOCS = ['birth_certificate', 'address_proof', 'transfer_certificate', 'photo']

const view = (a) => ({
  id: a.id,
  number: a.number,
  childName: a.child_name,
  childDob: a.child_dob,
  gradeLevel: a.grade_level,
  previousSchool: a.previous_school,
  guardianName: a.guardian_name,
  guardianRelationship: a.guardian_relationship,
  guardianMobile: a.guardian_mobile,
  guardianEmail: a.guardian_email,
  source: a.source,
  status: a.status,
  docs: Object.fromEntries(DOCS.map((d) => [d, Boolean(a[`docs_${d}`])])),
  offerSectionId: a.offer_section_id,
  offerSection: a.offer_section_en ? { en: a.offer_section_en, kn: a.offer_section_kn } : null,
  offerExpiresOn: a.offer_expires_on,
  decisionReason: a.decision_reason,
  notes: a.notes,
  followUpOn: a.follow_up_on,
  studentUserId: a.student_user_id,
  version: a.version,
  createdAt: a.created_at,
  updatedAt: a.updated_at,
  next: NEXT[a.status] ?? [],
})

const ROW = `SELECT a.*, sec.label_en AS offer_section_en, sec.label_kn AS offer_section_kn FROM admission_applications a LEFT JOIN sections sec ON sec.id = a.offer_section_id`

function load(schoolId, appId) {
  const a = one(`${ROW} WHERE a.id = ? AND a.school_id = ?`, appId, schoolId)
  if (!a) throw notFound()
  return a
}

// Seats in a section: enrolled students plus offers still holding a seat.
function seats(schoolId, sectionId, exceptAppId = 0) {
  const sec = one('SELECT capacity FROM sections WHERE id = ? AND school_id = ?', sectionId, schoolId)
  const enrolled = one("SELECT COUNT(*) AS n FROM enrollments WHERE section_id = ? AND status = 'active'", sectionId).n
  const held = one(
    "SELECT COUNT(*) AS n FROM admission_applications WHERE offer_section_id = ? AND status IN ('offered', 'accepted') AND id != ? AND (offer_expires_on IS NULL OR offer_expires_on >= ?)",
    sectionId, exceptAppId, isoDate(),
  ).n
  return { capacity: sec.capacity, enrolled, held, free: sec.capacity - enrolled - held }
}

function sectionsFor(schoolId, yearId, gradeLevel) {
  return all(
    `SELECT sec.id, sec.label_en, sec.label_kn FROM sections sec JOIN grades g ON g.id = sec.grade_id
     WHERE sec.school_id = ? AND sec.academic_year_id = ? ${gradeLevel ? 'AND g.level = ?' : ''} ORDER BY sec.label_en`,
    ...[schoolId, yearId, ...(gradeLevel ? [gradeLevel] : [])],
  ).map((s) => ({ id: s.id, label: { en: s.label_en, kn: s.label_kn }, ...seats(schoolId, s.id) }))
}

function fields(body, partial = false) {
  const out = {}
  const set = (k, v) => {
    if (!partial || body[k] !== undefined) out[k] = v()
  }
  set('childName', () => required(body.childName, 120))
  set('childDob', () => (body.childDob ? date(body.childDob) : null))
  set('gradeLevel', () => {
    const g = Number(body.gradeLevel)
    if (!Number.isInteger(g) || g < 1 || g > 12) throw bad('invalid.grade')
    return g
  })
  set('previousSchool', () => text(body.previousSchool, 160))
  set('guardianName', () => required(body.guardianName, 120))
  set('guardianRelationship', () => oneOf(body.guardianRelationship ?? 'guardian', RELATIONSHIPS))
  set('guardianMobile', () => {
    const m = normalizeMobile(body.guardianMobile)
    if (!m) throw bad('invalid.mobile')
    return m
  })
  set('guardianEmail', () => {
    const e = text(body.guardianEmail, 160).toLowerCase()
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad('invalid.email')
    return e
  })
  set('source', () => oneOf(body.source ?? 'walk_in', SOURCES))
  set('notes', () => text(body.notes, 1000))
  set('followUpOn', () => (body.followUpOn ? date(body.followUpOn) : null))
  for (const d of DOCS) if (body.docs && body.docs[d] !== undefined) out[`docs_${d}`] = body.docs[d] ? 1 : 0
  return out
}

const COLUMN = {
  childName: 'child_name', childDob: 'child_dob', gradeLevel: 'grade_level', previousSchool: 'previous_school', guardianName: 'guardian_name',
  guardianRelationship: 'guardian_relationship', guardianMobile: 'guardian_mobile', guardianEmail: 'guardian_email', source: 'source', notes: 'notes', followUpOn: 'follow_up_on',
}

// A one-time "set your password" link that lasts a week, for handing over at the desk.
function setupLink(userId, by) {
  const token = newToken()
  run('INSERT INTO password_resets (token_hash, user_id, expires_at, created_by) VALUES (?, ?, ?, ?)', sha256(token), userId, new Date(Date.now() + 7 * 864e5).toISOString(), by)
  return `/reset/${token}`
}

export function registerAdmissions(r) {
  r.get('/admissions', requirePerm('admissions.manage'), (req, res) => {
    const s = schoolOf(req)
    const year = yearOf(s)
    const status = req.query.status && STATUSES.includes(req.query.status) ? req.query.status : null
    const q = `%${text(req.query.q, 60)}%`
    const rows = all(
      `${ROW} WHERE a.school_id = ? AND a.academic_year_id = ? ${status ? 'AND a.status = ?' : ''} AND (a.child_name LIKE ? OR a.number LIKE ? OR a.guardian_mobile LIKE ?)
       ORDER BY a.updated_at DESC, a.id DESC LIMIT 300`,
      ...[s, year.id, ...(status ? [status] : []), q, q, q],
    )
    const counts = Object.fromEntries(STATUSES.map((st) => [st, 0]))
    for (const c of all('SELECT status, COUNT(*) AS n FROM admission_applications WHERE school_id = ? AND academic_year_id = ? GROUP BY status', s, year.id)) counts[c.status] = c.n
    res.json({
      year: year.label,
      counts,
      followUpsDue: one("SELECT COUNT(*) AS n FROM admission_applications WHERE school_id = ? AND follow_up_on <= ? AND status IN ('enquiry', 'applied', 'documents_verified', 'waitlisted', 'offered')", s, isoDate()).n,
      applications: rows.map(view),
      sources: SOURCES,
      relationships: RELATIONSHIPS,
    })
  })

  r.get('/admissions/:id', requirePerm('admissions.manage'), (req, res) => {
    const s = schoolOf(req)
    const a = load(s, id(req.params.id))
    const existing = one('SELECT id, name FROM users WHERE mobile = ? OR (? != \'\' AND email = ?)', a.guardian_mobile, a.guardian_email, a.guardian_email)
    res.json({
      application: view(a),
      sections: sectionsFor(s, a.academic_year_id, a.grade_level),
      existingGuardian: existing ? { name: existing.name } : null,
      history: all("SELECT a.at, a.action, a.detail, u.name FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.school_id = ? AND a.entity_type = 'admission' AND a.entity_id = ? ORDER BY a.id", s, String(a.id)).map((h) => ({
        at: h.at, action: h.action, by: h.name, detail: JSON.parse(h.detail),
      })),
    })
  })

  r.post('/admissions', requirePerm('admissions.manage'), (req, res) => {
    const s = schoolOf(req)
    const year = yearOf(s)
    const f = fields(req.body)
    const dup = one(
      "SELECT number FROM admission_applications WHERE school_id = ? AND academic_year_id = ? AND guardian_mobile = ? AND lower(child_name) = lower(?) AND status NOT IN ('rejected', 'withdrawn')",
      s, year.id, f.guardianMobile, f.childName,
    )
    if (dup && req.body.force !== true) return res.status(409).json({ error: 'admission.duplicate', number: dup.number })
    const status = req.body.status === 'applied' ? 'applied' : 'enquiry'
    const appId = transaction(() =>
      insertId(
        `INSERT INTO admission_applications (school_id, academic_year_id, number, child_name, child_dob, grade_level, previous_school, guardian_name, guardian_relationship,
           guardian_mobile, guardian_email, source, status, notes, follow_up_on, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        s, year.id, nextNumber(s, 'APP', year.label, 5), f.childName, f.childDob, f.gradeLevel, f.previousSchool, f.guardianName, f.guardianRelationship,
        f.guardianMobile, f.guardianEmail, f.source, status, f.notes, f.followUpOn, req.user.id,
      ),
    )
    audit(req, 'admission.created', { entityType: 'admission', entityId: appId, detail: { status } })
    res.status(201).json({ id: appId, application: view(load(s, appId)) })
  })

  // Edits details. The version stops two people overwriting each other.
  r.patch('/admissions/:id', requirePerm('admissions.manage'), (req, res) => {
    const s = schoolOf(req)
    const a = load(s, id(req.params.id))
    checkVersion(a, req.body.version)
    if (['enrolled', 'rejected', 'withdrawn'].includes(a.status)) throw conflict('admission.closed')
    const f = fields(req.body, true)
    const sets = Object.entries(f).map(([k, v]) => [COLUMN[k] ?? k, v])
    if (!sets.length) return res.json({ application: view(a) })
    run(`UPDATE admission_applications SET ${sets.map(([c]) => `${c} = ?`).join(', ')}, version = version + 1, updated_at = datetime('now') WHERE id = ? AND version = ?`, ...sets.map(([, v]) => v), a.id, a.version)
    audit(req, 'admission.updated', { entityType: 'admission', entityId: a.id, detail: { fields: Object.keys(f) } })
    res.json({ application: view(load(s, a.id)) })
  })

  r.post('/admissions/:id/status', requirePerm('admissions.manage'), (req, res) => {
    const s = schoolOf(req)
    const a = load(s, id(req.params.id))
    checkVersion(a, req.body.version)
    const to = oneOf(req.body.status, STATUSES)
    if (!(NEXT[a.status] ?? []).includes(to)) throw conflict('admission.bad_transition')
    const reason = text(req.body.reason, 300)
    if (NEEDS_REASON.includes(to) && !reason) throw bad('reason.required')
    let sectionId = a.offer_section_id
    let expires = a.offer_expires_on
    if (to === 'documents_verified') {
      const missing = DOCS.filter((d) => !a[`docs_${d}`] && (d !== 'transfer_certificate' || a.previous_school))
      if (missing.length) return res.status(409).json({ error: 'admission.documents_missing', missing })
    }
    if (to === 'offered') {
      sectionId = id(req.body.sectionId)
      const ok = sectionsFor(s, a.academic_year_id, a.grade_level).find((x) => x.id === sectionId)
      if (!ok) throw bad('invalid.section')
      if (seats(s, sectionId, a.id).free <= 0) throw conflict('section.full')
      expires = req.body.offerExpiresOn ? date(req.body.offerExpiresOn) : addDays(isoDate(), 14)
    }
    if (to === 'accepted' && a.offer_expires_on && a.offer_expires_on < isoDate()) throw conflict('offer.expired')
    run(
      `UPDATE admission_applications SET status = ?, offer_section_id = ?, offer_expires_on = ?, decision_reason = CASE WHEN ? != '' THEN ? ELSE decision_reason END,
         version = version + 1, updated_at = datetime('now') WHERE id = ? AND version = ?`,
      to, sectionId, expires, reason, reason, a.id, a.version,
    )
    if (to === 'offered') queueOutbox(s, 'sms', a.guardian_mobile, 'admission_offer', { number: a.number, child: a.child_name, expires })
    audit(req, 'admission.status_changed', { entityType: 'admission', entityId: a.id, detail: { from: a.status, to, reason } })
    res.json({ application: view(load(s, a.id)) })
  })

  // Converts an accepted application into an enrolled student. Repeating the
  // call returns the same student; it never creates a second one.
  r.post('/admissions/:id/enroll', requirePerm('admissions.manage'), (req, res) => {
    const s = schoolOf(req)
    const a = load(s, id(req.params.id))
    if (a.status === 'enrolled') {
      const e = one('SELECT admission_no FROM enrollments WHERE school_id = ? AND student_user_id = ?', s, a.student_user_id)
      return res.json({ repeated: true, studentId: a.student_user_id, admissionNo: e?.admission_no })
    }
    checkVersion(a, req.body.version)
    if (a.status !== 'accepted') throw conflict('admission.not_accepted')
    const school = one('SELECT * FROM schools WHERE id = ?', s)
    const year = yearOf(s)
    const out = transaction(() => {
      const sec = one('SELECT * FROM sections WHERE id = ? AND school_id = ?', a.offer_section_id, s)
      const occupied = one("SELECT COUNT(*) AS n FROM enrollments WHERE section_id = ? AND status = 'active'", sec.id).n
      if (occupied >= sec.capacity) throw conflict('section.full')

      // Guardian: reuse the existing account with this mobile or email.
      let guardian = one('SELECT * FROM users WHERE mobile = ?', a.guardian_mobile) ?? (a.guardian_email ? one('SELECT * FROM users WHERE email = ?', a.guardian_email) : null)
      let guardianLink = null
      if (!guardian) {
        const email = a.guardian_email && !one('SELECT 1 AS x FROM users WHERE email = ?', a.guardian_email) ? a.guardian_email : `guardian.${a.guardian_mobile.replace(/\D/g, '')}@family.invalid`
        const gid = insertId(
          `INSERT INTO users (email, mobile, password_hash, role, name, first_name_en, first_name_kn, school_en, school_kn, class_name_en, class_name_kn)
           VALUES (?, ?, ?, 'guardian', ?, ?, ?, '', '', '', '')`,
          email, a.guardian_mobile, hashPassword(crypto.randomBytes(18).toString('base64')), a.guardian_name, a.guardian_name.split(' ')[0], a.guardian_name.split(' ')[0],
        )
        guardian = one('SELECT * FROM users WHERE id = ?', gid)
        guardianLink = setupLink(gid, req.user.id)
      }
      if (!one("SELECT 1 AS x FROM memberships WHERE user_id = ? AND school_id = ? AND role = 'guardian' AND status = 'active'", guardian.id, s)) {
        run("INSERT INTO memberships (user_id, school_id, role, created_by) VALUES (?, ?, 'guardian', ?)", guardian.id, s, req.user.id)
      }

      // Student: a new person with an admission number they sign in with.
      const admissionNo = `${school.code}-${year.label.slice(2, 4)}-${String(nextSeq(s, 'ADMNO', year.label)).padStart(4, '0')}`
      const first = a.child_name.split(' ')[0]
      const sid = insertId(
        `INSERT INTO users (email, password_hash, role, name, first_name_en, first_name_kn, school_en, school_kn, class_name_en, class_name_kn, guardian, phone)
         VALUES (?, ?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `${admissionNo.toLowerCase()}@students.invalid`, hashPassword(crypto.randomBytes(18).toString('base64')), a.child_name, first, first,
        school.name_en, school.name_kn, sec.label_en, sec.label_kn, a.guardian_name, a.guardian_mobile,
      )
      enrollStudent({ schoolId: s, yearId: year.id, sectionId: sec.id, userId: sid, admissionNo })
      run(
        `INSERT INTO guardian_links (school_id, guardian_user_id, student_user_id, relationship, is_primary, can_pickup, can_view_fees, can_view_health, can_receive_comms, verified_at, verified_by, status)
         VALUES (?, ?, ?, ?, 1, 1, 1, 1, 1, datetime('now'), ?, 'active')`,
        s, guardian.id, sid, a.guardian_relationship, req.user.id,
      )
      const feesCreated = generateForStudent(s, sid, req.user.id)
      run("UPDATE admission_applications SET status = 'enrolled', student_user_id = ?, guardian_user_id = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?", sid, guardian.id, a.id)
      if (!guardianLink) {
        notify(s, [guardian.id], {
          title: { en: `${a.child_name} is enrolled`, kn: `${a.child_name} ದಾಖಲಾಗಿದ್ದಾರೆ` },
          body: { en: `Admission number ${admissionNo}, ${sec.label_en}.`, kn: `ದಾಖಲಾತಿ ಸಂಖ್ಯೆ ${admissionNo}, ${sec.label_kn}.` },
          link: '/',
          source: `admission:${a.id}`,
        })
      }
      queueOutbox(s, 'sms', a.guardian_mobile, 'admission_enrolled', { child: a.child_name, admissionNo })
      return { studentId: sid, guardianId: guardian.id, admissionNo, feesCreated, guardianLink, studentLink: setupLink(sid, req.user.id), existingGuardian: !guardianLink }
    })
    audit(req, 'admission.enrolled', { entityType: 'admission', entityId: a.id, detail: { studentId: out.studentId, admissionNo: out.admissionNo, feesCreated: out.feesCreated } })
    res.status(201).json(out)
  })
}
