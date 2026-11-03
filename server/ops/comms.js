// Messages (EN + KN, approval for bulk or sensitive ones), the in-app inbox
// for everyone, and the helpdesk (tickets, with confidential grievances).
import { audit, currentYear, requirePerm } from '../access.js'
import { all, one, run, transaction } from '../db.js'
import { bad, forbidden, id, notFound, required, text } from '../http.js'
import { conflict, fyPeriod, insertId, nextNumber, notSelf, notify, oneOf, queueOutbox, requireWorkspace, schoolOf, staffUsers, usersWithPerm } from './common.js'

const AUDIENCES = ['all_guardians', 'all_staff', 'section_guardians', 'everyone']
const CATEGORIES = ['fees', 'academic', 'transport', 'it', 'facility', 'other', 'grievance']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const SLA_HOURS = { urgent: 4, high: 24, normal: 72, low: 120 }

function guardianRecipients(schoolId, sectionId) {
  const year = currentYear(schoolId)
  return all(
    `SELECT DISTINCT u.id, u.mobile FROM guardian_links l JOIN users u ON u.id = l.guardian_user_id
     JOIN enrollments e ON e.student_user_id = l.student_user_id AND e.school_id = l.school_id AND e.academic_year_id = ? AND e.status = 'active'
     WHERE l.school_id = ? AND l.status = 'active' AND l.verified_at IS NOT NULL AND l.can_receive_comms = 1 AND u.disabled_at IS NULL ${sectionId ? 'AND e.section_id = ?' : ''}`,
    ...[year?.id ?? -1, schoolId, ...(sectionId ? [sectionId] : [])],
  )
}

function recipients(schoolId, audience, sectionId) {
  const staff = () => staffUsers(schoolId).map((uid) => ({ id: uid, mobile: null }))
  if (audience === 'all_staff') return staff()
  if (audience === 'section_guardians') return guardianRecipients(schoolId, sectionId)
  if (audience === 'all_guardians') return guardianRecipients(schoolId)
  const seen = new Map()
  for (const r of [...guardianRecipients(schoolId), ...staff()]) if (!seen.has(r.id)) seen.set(r.id, r)
  return [...seen.values()]
}

// Anything wider than one class, or marked sensitive, needs a second person.
const needsApproval = (audience, sensitive) => audience !== 'section_guardians' || sensitive

function send(schoolId, m) {
  const list = recipients(schoolId, m.audience, m.section_id)
  notify(schoolId, list.map((r) => r.id), {
    title: { en: m.title_en, kn: m.title_kn },
    body: { en: m.body_en, kn: m.body_kn },
    link: '/inbox',
    source: `message:${m.id}`,
    kind: 'message',
  })
  for (const r of list) if (r.mobile) queueOutbox(schoolId, 'sms', r.mobile, 'school_message', { messageId: m.id })
  run("UPDATE messages SET status = 'sent', recipient_count = ?, sent_at = datetime('now') WHERE id = ?", list.length, m.id)
  return list.length
}

const ticketView = (t, me) => ({
  id: t.id,
  number: t.number,
  category: t.category,
  subject: t.subject,
  body: t.body,
  priority: t.priority,
  status: t.status,
  raisedBy: t.raised_name,
  assignedTo: t.assigned_to,
  assignee: t.assignee ?? '',
  dueAt: t.due_at,
  overdue: !['resolved', 'closed'].includes(t.status) && t.due_at < new Date().toISOString(),
  resolution: t.resolution,
  createdAt: t.created_at,
  resolvedAt: t.resolved_at,
  mine: t.raised_by === me,
})
const TICKETS = 'SELECT t.*, r.name AS raised_name, a.name AS assignee FROM tickets t JOIN users r ON r.id = t.raised_by LEFT JOIN users a ON a.id = t.assigned_to'

// Who may handle a ticket: grievances only with the grievance permission.
const canHandle = (req, t) => req.ctx.perms.has('helpdesk.manage') && (t.category !== 'grievance' || req.ctx.perms.has('helpdesk.grievance'))

function ticketFor(req, ticketId) {
  const t = one(`${TICKETS} WHERE t.id = ? AND t.school_id = ?`, ticketId, schoolOf(req))
  if (!t) throw notFound()
  if (t.raised_by !== req.user.id && !canHandle(req, t)) {
    audit(req, 'helpdesk.denied', { outcome: 'denied', entityType: 'ticket', entityId: t.number })
    throw forbidden()
  }
  return t
}

export function registerComms(r) {
  // ----- Messages -----

  r.get('/messages', requirePerm(['messages.send', 'messages.approve']), (req, res) => {
    const s = schoolOf(req)
    const year = currentYear(s)
    res.json({
      canSend: req.ctx.perms.has('messages.send'),
      canApprove: req.ctx.perms.has('messages.approve'),
      sections: all('SELECT id, label_en, label_kn FROM sections WHERE school_id = ? AND academic_year_id = ? ORDER BY label_en', s, year?.id ?? -1).map((x) => ({ id: x.id, label: { en: x.label_en, kn: x.label_kn } })),
      messages: all(
        `SELECT m.*, c.name AS created_name, a.name AS approved_name, sec.label_en, sec.label_kn FROM messages m JOIN users c ON c.id = m.created_by LEFT JOIN users a ON a.id = m.approved_by
         LEFT JOIN sections sec ON sec.id = m.section_id WHERE m.school_id = ? ORDER BY m.status = 'pending_approval' DESC, m.id DESC LIMIT 100`,
        s,
      ).map((m) => ({
        id: m.id, audience: m.audience, section: m.label_en ? { en: m.label_en, kn: m.label_kn } : null, title: { en: m.title_en, kn: m.title_kn }, body: { en: m.body_en, kn: m.body_kn },
        sensitive: Boolean(m.sensitive), status: m.status, recipients: m.recipient_count, createdBy: m.created_name, approvedBy: m.approved_name ?? '', mine: m.created_by === req.user.id, createdAt: m.created_at, sentAt: m.sent_at,
      })),
    })
  })

  r.post('/messages/preview', requirePerm('messages.send'), (req, res) => {
    const s = schoolOf(req)
    const audience = oneOf(req.body.audience, AUDIENCES)
    const sectionId = audience === 'section_guardians' ? id(req.body.sectionId) : null
    res.json({ count: recipients(s, audience, sectionId).length, needsApproval: needsApproval(audience, Boolean(req.body.sensitive)) })
  })

  r.post('/messages', requirePerm('messages.send'), (req, res) => {
    const s = schoolOf(req)
    const audience = oneOf(req.body.audience, AUDIENCES)
    let sectionId = null
    if (audience === 'section_guardians') {
      sectionId = id(req.body.sectionId)
      if (!one('SELECT 1 AS x FROM sections WHERE id = ? AND school_id = ?', sectionId, s)) throw bad('invalid.section')
    }
    const sensitive = Boolean(req.body.sensitive)
    const out = transaction(() => {
      const mid = insertId(
        'INSERT INTO messages (school_id, audience, section_id, title_en, title_kn, body_en, body_kn, sensitive, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        s, audience, sectionId, required(req.body.titleEn, 120), required(req.body.titleKn, 120), required(req.body.bodyEn, 2000), required(req.body.bodyKn, 2000), sensitive ? 1 : 0, req.user.id,
      )
      if (needsApproval(audience, sensitive)) {
        notify(s, usersWithPerm(s, 'messages.approve').filter((u) => u !== req.user.id), {
          title: { en: 'Message waiting for approval', kn: 'ಅನುಮೋದನೆಗಾಗಿ ಕಾಯುತ್ತಿರುವ ಸಂದೇಶ' },
          body: { en: req.body.titleEn, kn: req.body.titleKn },
          link: '/messages',
          source: `message-approval:${mid}`,
          kind: 'approval',
        })
        return { id: mid, status: 'pending_approval' }
      }
      return { id: mid, status: 'sent', recipients: send(s, one('SELECT * FROM messages WHERE id = ?', mid)) }
    })
    audit(req, 'messages.created', { entityType: 'message', entityId: out.id, detail: { audience, sensitive, status: out.status } })
    res.status(201).json(out)
  })

  r.post('/messages/:id/decide', requirePerm('messages.approve'), (req, res) => {
    const s = schoolOf(req)
    const m = one('SELECT * FROM messages WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!m) throw notFound()
    if (m.status !== 'pending_approval') throw conflict('already.decided')
    notSelf(m.created_by, req.user.id)
    const approve = req.body.approve === true
    const count = transaction(() => {
      run('UPDATE messages SET approved_by = ? WHERE id = ?', req.user.id, m.id)
      if (!approve) {
        run("UPDATE messages SET status = 'rejected' WHERE id = ?", m.id)
        return 0
      }
      return send(s, m)
    })
    audit(req, approve ? 'messages.approved_sent' : 'messages.rejected', { entityType: 'message', entityId: m.id, detail: { recipients: count } })
    res.json({ ok: true, recipients: count })
  })

  // ----- Inbox (everyone) -----

  const inboxWhere = (req) => {
    const ids = req.ctx.schoolIds?.length ? req.ctx.schoolIds : [-1]
    return { sql: `user_id = ? AND (school_id IS NULL OR school_id IN (${ids.map(() => '?').join(',')}))`, params: [req.user.id, ...ids] }
  }

  r.get('/inbox', requireWorkspace, (req, res) => {
    const w = inboxWhere(req)
    res.json({
      unread: one(`SELECT COUNT(*) AS n FROM notifications WHERE ${w.sql} AND read_at IS NULL`, ...w.params).n,
      items: all(`SELECT * FROM notifications WHERE ${w.sql} ORDER BY id DESC LIMIT 100`, ...w.params).map((n) => ({
        id: n.id, kind: n.kind, title: { en: n.title_en, kn: n.title_kn }, body: { en: n.body_en, kn: n.body_kn }, link: n.link, at: n.created_at, read: Boolean(n.read_at),
      })),
    })
  })

  r.get('/inbox/count', requireWorkspace, (req, res) => {
    const w = inboxWhere(req)
    res.json({ unread: one(`SELECT COUNT(*) AS n FROM notifications WHERE ${w.sql} AND read_at IS NULL`, ...w.params).n })
  })

  r.post('/inbox/read', requireWorkspace, (req, res) => {
    const w = inboxWhere(req)
    if (req.body.id) run(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND ${w.sql}`, id(req.body.id), ...w.params)
    else run(`UPDATE notifications SET read_at = datetime('now') WHERE read_at IS NULL AND ${w.sql}`, ...w.params)
    res.json({ ok: true })
  })

  // ----- Helpdesk -----

  r.post('/helpdesk/tickets', requirePerm('helpdesk.raise'), (req, res) => {
    const s = schoolOf(req)
    const category = oneOf(req.body.category, CATEGORIES)
    const priority = oneOf(req.body.priority ?? 'normal', PRIORITIES)
    const due = new Date(Date.now() + SLA_HOURS[priority] * 3600e3).toISOString()
    const out = transaction(() => {
      const number = nextNumber(s, 'TKT', fyPeriod(), 5)
      const tid = insertId(
        'INSERT INTO tickets (school_id, number, raised_by, category, subject, body, priority, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        s, number, req.user.id, category, required(req.body.subject, 160), required(req.body.body, 4000), priority, due,
      )
      const handlers = usersWithPerm(s, category === 'grievance' ? 'helpdesk.grievance' : 'helpdesk.manage').filter((u) => u !== req.user.id)
      notify(s, handlers, {
        title: { en: `New ${category === 'grievance' ? 'confidential grievance' : 'helpdesk request'} ${number}`, kn: `ಹೊಸ ${category === 'grievance' ? 'ಗೋಪ್ಯ ದೂರು' : 'ಸಹಾಯ ಕೋರಿಕೆ'} ${number}` },
        body: category === 'grievance' ? { en: '', kn: '' } : { en: req.body.subject, kn: req.body.subject },
        link: '/helpdesk',
        source: `ticket:${tid}`,
        kind: priority === 'urgent' ? 'alert' : 'info',
      })
      return { id: tid, number, dueAt: due }
    })
    audit(req, 'helpdesk.raised', { entityType: 'ticket', entityId: out.number, detail: { category, priority } })
    res.status(201).json(out)
  })

  r.get('/helpdesk/mine', requirePerm('helpdesk.raise'), (req, res) => {
    const s = schoolOf(req)
    res.json({ tickets: all(`${TICKETS} WHERE t.school_id = ? AND t.raised_by = ? ORDER BY t.id DESC LIMIT 50`, s, req.user.id).map((t) => ticketView(t, req.user.id)) })
  })

  r.get('/helpdesk/tickets', requirePerm('helpdesk.manage'), (req, res) => {
    const s = schoolOf(req)
    const grievance = req.ctx.perms.has('helpdesk.grievance')
    res.json({
      canGrievance: grievance,
      handlers: usersWithPerm(s, 'helpdesk.manage').map((u) => ({ id: u, name: one('SELECT name FROM users WHERE id = ?', u).name })),
      tickets: all(
        `${TICKETS} WHERE t.school_id = ? ${grievance ? '' : "AND t.category != 'grievance'"} ORDER BY t.status IN ('resolved', 'closed'), t.due_at LIMIT 200`,
        s,
      ).map((t) => ticketView(t, req.user.id)),
    })
  })

  r.get('/helpdesk/tickets/:id', requirePerm(['helpdesk.raise', 'helpdesk.manage']), (req, res) => {
    const t = ticketFor(req, id(req.params.id))
    res.json({
      ticket: ticketView(t, req.user.id),
      canHandle: canHandle(req, t),
      comments: all('SELECT c.body, c.created_at, u.name, c.user_id FROM ticket_comments c JOIN users u ON u.id = c.user_id WHERE c.ticket_id = ? ORDER BY c.id', t.id).map((c) => ({
        body: c.body, at: c.created_at, by: c.name, mine: c.user_id === req.user.id,
      })),
    })
  })

  r.post('/helpdesk/tickets/:id/comments', requirePerm(['helpdesk.raise', 'helpdesk.manage']), (req, res) => {
    const s = schoolOf(req)
    const t = ticketFor(req, id(req.params.id))
    if (t.status === 'closed') throw conflict('ticket.closed')
    run('INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)', t.id, req.user.id, required(req.body.body, 4000))
    const other = t.raised_by === req.user.id ? (t.assigned_to ? [t.assigned_to] : []) : [t.raised_by]
    notify(s, other, { title: { en: `Reply on ${t.number}`, kn: `${t.number} ಗೆ ಉತ್ತರ` }, link: '/helpdesk', source: `ticket:${t.id}:comment` })
    res.status(201).json({ ok: true })
  })

  r.patch('/helpdesk/tickets/:id', requirePerm('helpdesk.manage'), (req, res) => {
    const s = schoolOf(req)
    const t = ticketFor(req, id(req.params.id))
    if (!canHandle(req, t)) throw forbidden()
    const status = req.body.status === undefined ? t.status : oneOf(req.body.status, ['open', 'in_progress', 'resolved', 'closed'])
    const priority = req.body.priority === undefined ? t.priority : oneOf(req.body.priority, PRIORITIES)
    const resolution = req.body.resolution === undefined ? t.resolution : text(req.body.resolution, 2000)
    if ((status === 'resolved' || status === 'closed') && !resolution) throw bad('resolution.required')
    let assigned = t.assigned_to
    if (req.body.assignedTo !== undefined) {
      assigned = req.body.assignedTo ? id(req.body.assignedTo) : null
      const pool = usersWithPerm(s, t.category === 'grievance' ? 'helpdesk.grievance' : 'helpdesk.manage')
      if (assigned && !pool.includes(assigned)) throw bad('invalid.assignee')
    }
    run(
      `UPDATE tickets SET status = ?, priority = ?, resolution = ?, assigned_to = ?, resolved_at = CASE WHEN ? IN ('resolved', 'closed') THEN COALESCE(resolved_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE NULL END WHERE id = ?`,
      status, priority, resolution, assigned, status, t.id,
    )
    if (status !== t.status && status === 'resolved') notify(s, [t.raised_by], { title: { en: `${t.number} resolved`, kn: `${t.number} ಪರಿಹರಿಸಲಾಗಿದೆ` }, body: { en: resolution, kn: resolution }, link: '/helpdesk', source: `ticket:${t.id}:resolved` })
    if (assigned && assigned !== t.assigned_to) notify(s, [assigned], { title: { en: `${t.number} assigned to you`, kn: `${t.number} ನಿಮಗೆ ನಿಯೋಜಿಸಲಾಗಿದೆ` }, link: '/helpdesk', source: `ticket:${t.id}:assigned` })
    audit(req, 'helpdesk.updated', { entityType: 'ticket', entityId: t.number, detail: { status, priority, assigned } })
    res.json({ ok: true })
  })
}
