// Health (infirmary visits) and safeguarding. Any employee can report a
// concern; only the safeguarding officer role can read cases. Urgent reports
// alert the safeguarding officers and the principal straight away, by a fixed
// rule (no AI involved), and the alert never contains the details.
import { audit, requirePerm } from '../access.js'
import { all, one, run, transaction } from '../db.js'
import { addDays, isoDate } from '../dates.js'
import { bad, id, notFound, required, text } from '../http.js'
import { childrenFor, conflict, fyPeriod, guardiansOf, insertId, nextNumber, notify, oneOf, queueOutbox, schoolOf, studentOf, usersWithPerm, usersWithRole } from './common.js'

const CATEGORIES = ['bullying', 'neglect', 'abuse', 'self_harm', 'online', 'other']
const SEVERITIES = ['low', 'medium', 'high', 'urgent']

const visitView = (v) => ({
  id: v.id,
  student: v.student,
  studentId: v.student_user_id,
  complaint: v.complaint,
  actionTaken: v.action_taken,
  sentHome: Boolean(v.sent_home),
  guardianInformed: Boolean(v.guardian_informed),
  recordedBy: v.recorded_name,
  at: v.visited_at,
})
const VISITS = 'SELECT v.*, u.name AS student, r.name AS recorded_name FROM infirmary_visits v JOIN users u ON u.id = v.student_user_id JOIN users r ON r.id = v.recorded_by'

// Alerts for a new or escalated case. Never includes the summary.
function alert(schoolId, c, escalated) {
  const officers = usersWithPerm(schoolId, 'safeguarding.view')
  const urgent = c.severity === 'urgent'
  const to = urgent ? [...officers, ...usersWithRole(schoolId, 'principal')] : officers
  notify(schoolId, to, {
    title: urgent
      ? { en: `URGENT safeguarding concern ${c.number}`, kn: `ತುರ್ತು ಮಕ್ಕಳ ಸುರಕ್ಷತಾ ಕಾಳಜಿ ${c.number}` }
      : { en: `New safeguarding concern ${c.number} (${c.severity})`, kn: `ಹೊಸ ಮಕ್ಕಳ ಸುರಕ್ಷತಾ ಕಾಳಜಿ ${c.number}` },
    body: urgent
      ? { en: 'Act now. Details are in the safeguarding register (officers only).', kn: 'ತಕ್ಷಣ ಕ್ರಮ ಕೈಗೊಳ್ಳಿ. ವಿವರಗಳು ಸುರಕ್ಷತಾ ದಾಖಲೆಯಲ್ಲಿವೆ (ಅಧಿಕಾರಿಗಳಿಗೆ ಮಾತ್ರ).' }
      : { en: 'Details are in the safeguarding register.', kn: 'ವಿವರಗಳು ಸುರಕ್ಷತಾ ದಾಖಲೆಯಲ್ಲಿವೆ.' },
    link: '/safeguarding',
    source: `safeguarding:${c.id}:${escalated ? 'escalated' : 'new'}`,
    kind: urgent ? 'urgent' : 'alert',
  })
  if (urgent) {
    for (const u of all(`SELECT mobile FROM users WHERE id IN (${to.map(() => '?').join(',') || 'NULL'}) AND mobile IS NOT NULL`, ...to)) {
      queueOutbox(schoolId, 'sms', u.mobile, 'safeguarding_urgent', { number: c.number })
    }
  }
  return to.length
}

export function registerCare(r) {
  // ----- Health -----

  r.get('/infirmary', requirePerm('health.view'), (req, res) => {
    const s = schoolOf(req)
    audit(req, 'health.read', { entityType: 'infirmary', entityId: 'register' })
    res.json({
      canRecord: req.ctx.perms.has('health.record'),
      today: one('SELECT COUNT(*) AS n FROM infirmary_visits WHERE school_id = ? AND substr(visited_at, 1, 10) = ?', s, isoDate()).n,
      visits: all(`${VISITS} WHERE v.school_id = ? AND v.visited_at >= ? ORDER BY v.id DESC LIMIT 200`, s, addDays(isoDate(), -30)).map(visitView),
    })
  })

  r.get('/infirmary/students/:id', requirePerm('health.view'), (req, res) => {
    const s = schoolOf(req)
    const st = studentOf(s, id(req.params.id))
    audit(req, 'health.read', { entityType: 'student', entityId: st.id })
    res.json({
      student: { id: st.id, name: st.name, admissionNo: st.admission_no, section: { en: st.section_en, kn: st.section_kn } },
      notes: all("SELECT body, created_at FROM student_notes WHERE school_id = ? AND student_user_id = ? AND kind = 'health' ORDER BY id DESC", s, st.id),
      visits: all(`${VISITS} WHERE v.school_id = ? AND v.student_user_id = ? ORDER BY v.id DESC LIMIT 50`, s, st.id).map(visitView),
      guardians: guardiansOf(s, st.id).map((g) => ({ name: g.name, relationship: g.relationship, mobile: g.mobile })),
    })
  })

  r.post('/infirmary/visits', requirePerm('health.record'), (req, res) => {
    const s = schoolOf(req)
    const st = studentOf(s, id(req.body.studentId))
    const complaint = required(req.body.complaint, 300)
    const action = required(req.body.actionTaken, 300)
    const vid = transaction(() => {
      const v = insertId(
        'INSERT INTO infirmary_visits (school_id, student_user_id, complaint, action_taken, sent_home, guardian_informed, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        s, st.id, complaint, action, req.body.sentHome ? 1 : 0, req.body.guardianInformed ? 1 : 0, req.user.id,
      )
      // Details go only to guardians whose link allows health information.
      notify(s, guardiansOf(s, st.id, 'can_view_health').map((g) => g.guardian_user_id), {
        title: { en: `${st.name} visited the school nurse`, kn: `${st.name} ಶಾಲಾ ದಾದಿಯನ್ನು ಭೇಟಿಯಾದರು` },
        body: { en: `${complaint}. ${action}.${req.body.sentHome ? ' Sent home.' : ''}`, kn: `${complaint}. ${action}.${req.body.sentHome ? ' ಮನೆಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.' : ''}` },
        link: '/health',
        source: `infirmary:${v}`,
        kind: 'health',
      })
      return v
    })
    audit(req, 'health.visit_recorded', { entityType: 'student', entityId: st.id, detail: { visit: vid } })
    res.status(201).json({ id: vid })
  })

  r.get('/family/health', requirePerm('family.view'), (req, res) => {
    const s = schoolOf(req)
    res.json({
      children: childrenFor(req, 'can_view_health').map((c) => ({
        id: c.id,
        name: c.name,
        firstName: { en: c.first_name_en, kn: c.first_name_kn },
        visits: all(`${VISITS} WHERE v.school_id = ? AND v.student_user_id = ? ORDER BY v.id DESC LIMIT 20`, s, c.id).map(visitView),
      })),
    })
  })

  // ----- Safeguarding -----

  r.post('/safeguarding/reports', requirePerm('safeguarding.report'), (req, res) => {
    const s = schoolOf(req)
    const studentId = req.body.studentId ? studentOf(s, id(req.body.studentId)).id : null
    const severity = oneOf(req.body.severity, SEVERITIES)
    const out = transaction(() => {
      const number = nextNumber(s, 'SG', fyPeriod(), 4)
      const cid = insertId(
        'INSERT INTO safeguarding_cases (school_id, number, student_user_id, category, severity, summary, reported_by, escalated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = \'urgent\' THEN strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') END)',
        s, number, studentId, oneOf(req.body.category, CATEGORIES), severity, required(req.body.summary, 2000), req.user.id, severity,
      )
      const alerted = alert(s, { id: cid, number, severity }, false)
      return { id: cid, number, alerted }
    })
    audit(req, 'safeguarding.reported', { entityType: 'safeguarding_case', entityId: out.number, detail: { severity, alerted: out.alerted } })
    // The reporter gets a reference number, not access to the case.
    res.status(201).json({ number: out.number, alerted: out.alerted > 0 })
  })

  r.get('/safeguarding/mine', requirePerm('safeguarding.report'), (req, res) => {
    const s = schoolOf(req)
    res.json({ reports: all('SELECT number, severity, created_at FROM safeguarding_cases WHERE school_id = ? AND reported_by = ? ORDER BY id DESC LIMIT 20', s, req.user.id) })
  })

  r.get('/safeguarding/cases', requirePerm('safeguarding.view'), (req, res) => {
    const s = schoolOf(req)
    audit(req, 'safeguarding.read', { entityType: 'safeguarding_case', entityId: 'register' })
    res.json({
      officers: usersWithPerm(s, 'safeguarding.view').map((u) => ({ id: u, name: one('SELECT name FROM users WHERE id = ?', u).name })),
      cases: all(
        `SELECT c.*, u.name AS student, r.name AS reporter, a.name AS assignee FROM safeguarding_cases c LEFT JOIN users u ON u.id = c.student_user_id
         JOIN users r ON r.id = c.reported_by LEFT JOIN users a ON a.id = c.assigned_to WHERE c.school_id = ?
         ORDER BY c.status = 'closed', CASE c.severity WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, c.id DESC LIMIT 200`,
        s,
      ).map((c) => ({
        id: c.id, number: c.number, student: c.student ?? '', category: c.category, severity: c.severity, status: c.status, reporter: c.reporter, assignee: c.assignee ?? '', assignedTo: c.assigned_to,
        escalatedAt: c.escalated_at, createdAt: c.created_at, closedAt: c.closed_at,
      })),
    })
  })

  r.get('/safeguarding/cases/:id', requirePerm('safeguarding.view'), (req, res) => {
    const s = schoolOf(req)
    const c = one('SELECT c.*, u.name AS student, r.name AS reporter FROM safeguarding_cases c LEFT JOIN users u ON u.id = c.student_user_id JOIN users r ON r.id = c.reported_by WHERE c.id = ? AND c.school_id = ?', id(req.params.id), s)
    if (!c) throw notFound()
    audit(req, 'safeguarding.read', { entityType: 'safeguarding_case', entityId: c.number })
    res.json({
      case: { id: c.id, number: c.number, student: c.student ?? '', category: c.category, severity: c.severity, status: c.status, summary: c.summary, reporter: c.reporter, assignedTo: c.assigned_to, createdAt: c.created_at, escalatedAt: c.escalated_at },
      notes: all('SELECT n.body, n.written_at, u.name FROM safeguarding_notes n JOIN users u ON u.id = n.written_by WHERE n.case_id = ? ORDER BY n.id', c.id).map((n) => ({ body: n.body, at: n.written_at, by: n.name })),
    })
  })

  r.post('/safeguarding/cases/:id/notes', requirePerm('safeguarding.view'), (req, res) => {
    const s = schoolOf(req)
    const c = one('SELECT * FROM safeguarding_cases WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!c) throw notFound()
    run('INSERT INTO safeguarding_notes (case_id, body, written_by) VALUES (?, ?, ?)', c.id, required(req.body.body, 4000), req.user.id)
    audit(req, 'safeguarding.note_added', { entityType: 'safeguarding_case', entityId: c.number })
    res.status(201).json({ ok: true })
  })

  r.patch('/safeguarding/cases/:id', requirePerm('safeguarding.view'), (req, res) => {
    const s = schoolOf(req)
    const c = one('SELECT * FROM safeguarding_cases WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!c) throw notFound()
    const status = req.body.status === undefined ? c.status : oneOf(req.body.status, ['open', 'investigating', 'closed'])
    const severity = req.body.severity === undefined ? c.severity : oneOf(req.body.severity, SEVERITIES)
    let assigned = c.assigned_to
    if (req.body.assignedTo !== undefined) {
      assigned = req.body.assignedTo ? id(req.body.assignedTo) : null
      if (assigned && !usersWithPerm(s, 'safeguarding.view').includes(assigned)) throw bad('invalid.assignee')
    }
    if (status === 'closed' && c.status !== 'closed' && !one('SELECT 1 AS x FROM safeguarding_notes WHERE case_id = ?', c.id)) throw conflict('case.note_required')
    const escalate = severity === 'urgent' && c.severity !== 'urgent'
    transaction(() => {
      run(
        `UPDATE safeguarding_cases SET status = ?, severity = ?, assigned_to = ?, closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE NULL END,
           escalated_at = CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE escalated_at END WHERE id = ?`,
        status, severity, assigned, status, escalate ? 1 : 0, c.id,
      )
      if (escalate) alert(s, { id: c.id, number: c.number, severity }, true)
    })
    audit(req, 'safeguarding.updated', { entityType: 'safeguarding_case', entityId: c.number, detail: { status, severity, assigned } })
    res.json({ ok: true })
  })
}
