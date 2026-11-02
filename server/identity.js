import express from 'express'
import QRCode from 'qrcode'
import { ENTRY_CARDS, ROLES, isPrivilegedRole, roleLabel } from '../shared/roles.js'
import { aiEnabled } from './ai.js'
import { activeMemberships, audit, currentYear, guardianChildren, listWorkspaces, loadContext, requirePerm } from './access.js'
import {
  burnPasswordCheck,
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  newToken,
  publicUser,
  rateLimit,
  requireUser,
  setSessionCookie,
  sha256,
  verifyPassword,
} from './auth.js'
import { all, one, run, transaction } from './db.js'
import { addDays, isoDate } from './dates.js'
import { HttpError, bad, forbidden, id, notFound, required, text, wrap } from './http.js'
import { demoAccounts } from './seed.js'
import { studentHomework, scopedAnnouncements, studentAwards, toResult, upcomingExams } from './student.js'
import { addEmployee, addMembership, demoIdentities } from './tenancy.js'
import { codeAt, currentStep, newSecret, otpauthUri, verify as verifyTotp } from './totp.js'

export const identity = express.Router()
identity.use(express.json({ limit: '100kb' }))

const portalOf = (v) => (ENTRY_CARDS.includes(v) ? v : null)
const nowIso = () => new Date().toISOString()

// ---------- Session payload ----------

function sessionPayload(req) {
  const user = one('SELECT * FROM users WHERE id = ?', req.user.id)
  const workspaces = listWorkspaces(user.id)
  const found = req.ctx ? workspaces.find((w) => w.id === req.ctx.membership.id) : null
  // The permission list is only for showing the right menus; the server re-checks every request.
  const active = found ? { ...found, permissions: req.ctx.mfaPending ? [] : [...req.ctx.perms] } : null
  return {
    user: publicUser(user, req.ctx),
    workspaces,
    active,
    mfaPending: Boolean(req.ctx?.mfaPending),
    portal: req.user.portal ?? null,
    aiEnabled: aiEnabled(),
  }
}

// ---------- Sign in ----------

const loginLimit = rateLimit({ windowMs: 15 * 60e3, max: Number(process.env.LOGIN_RATE_LIMIT) || 20 })

// Indian mobile numbers: accepts "98450 12345", "+91 98450 12345", "098450-12345".
export function normalizeMobile(v) {
  const digits = String(v ?? '').replace(/[^\d+]/g, '')
  const bare = digits.replace(/^\+?91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '')
  return /^\d{10}$/.test(bare) ? `+91${bare}` : null
}

// Finds the account for an email, mobile number, or student/employee ID (the
// last one needs the institution code). Every miss looks the same to the caller.
function findAccount(identifier, institution) {
  const value = text(identifier, 200)
  if (!value) return null
  if (value.includes('@')) return one('SELECT * FROM users WHERE email = ?', value.toLowerCase())
  const mobile = normalizeMobile(value)
  if (mobile) return one('SELECT * FROM users WHERE mobile = ?', mobile)
  const code = text(institution, 40)
  if (!code) return null
  return one(
    `SELECT u.* FROM login_identifiers li JOIN schools s ON s.id = li.school_id JOIN users u ON u.id = li.user_id
     WHERE s.code = ? AND s.status = 'active' AND li.value = ?`,
    code,
    value,
  )
}

function activate(req, membershipId) {
  run('UPDATE sessions SET active_membership_id = ? WHERE token = ?', membershipId, req.user.token)
  req.user.active_membership_id = membershipId
}

identity.post(
  '/auth/login',
  loginLimit,
  wrap(async (req, res) => {
    const portal = portalOf(req.body.portal)
    const identifier = req.body.identifier ?? req.body.email
    const password = String(req.body.password ?? '')
    const user = findAccount(identifier, req.body.institution)
    if (!user || user.disabled_at || !verifyPassword(password, user.password_hash)) {
      if (!user) burnPasswordCheck(password)
      audit(req, 'auth.login', { outcome: 'failed', userId: user?.id ?? null, detail: { portal } })
      return res.status(401).json({ error: 'auth.invalid' })
    }
    const session = createSession(user.id, { portal })
    setSessionCookie(res, session)
    req.user = { ...user, token: session.token, active_membership_id: null, mfa_at: null, portal }
    audit(req, 'auth.login', { userId: user.id, detail: { portal } })

    // Open a workspace straight away only when the choice is obvious and needs no second factor.
    const workspaces = listWorkspaces(user.id)
    const matching = portal ? workspaces.filter((w) => w.cards.includes(portal)) : workspaces
    const pick = matching.length === 1 ? matching[0] : workspaces.length === 1 ? workspaces[0] : null
    if (pick && !pick.privileged) activate(req, pick.id)
    loadContext(req, res, () => {})
    res.json(sessionPayload(req))
  }),
)

identity.post('/auth/logout', (req, res) => {
  if (req.user) {
    audit(req, 'auth.logout')
    destroySession(req.user.token)
  }
  clearSessionCookie(res)
  res.json({ ok: true })
})

identity.get('/me', requireUser, (req, res) => res.json(sessionPayload(req)))

// Demo accounts for each entry card, shown only while they still use their
// default passwords. Demo admin accounts show their current MFA code, because
// the demo has no phone to scan a QR code with. Synthetic data only.
identity.get('/auth/demo', (req, res) => {
  if (process.env.SHOW_DEMO_LOGINS === 'false') return res.json({ accounts: [] })
  const portal = portalOf(req.query.portal)
  const list = [
    { key: 'student', card: 'family', ...demoAccounts.student },
    { key: 'guardian', ...demoIdentities.guardian },
    { key: 'teacher', card: 'staff', ...demoAccounts.teacher },
    { key: 'driver', ...demoIdentities.driver },
    { key: 'principal', ...demoIdentities.principal },
    { key: 'trustee', ...demoIdentities.trustee },
    { key: 'accountantParent', ...demoIdentities.accountantParent },
    { key: 'hr', ...demoIdentities.hr },
  ]
  const accounts = list
    .filter((a) => !portal || a.card === portal || (a.key === 'accountantParent' && portal === 'family'))
    .map((a) => {
      const u = one('SELECT password_hash, mfa_secret, mfa_enabled_at FROM users WHERE email = ?', a.email)
      if (!u || !verifyPassword(a.password, u.password_hash)) return null
      return {
        key: a.key,
        email: a.email,
        password: a.password,
        employeeId: a.employeeId,
        mfaCode: u.mfa_enabled_at && u.mfa_secret ? codeAt(u.mfa_secret, currentStep()) : null,
      }
    })
    .filter(Boolean)
  res.json({ accounts, institution: 'VPS-BLR' })
})

// ---------- Workspaces ----------

const mfaLimit = rateLimit({ windowMs: 10 * 60e3, max: 10, key: (req) => `mfa:${req.user?.id ?? req.ip}` })

function checkMfaCode(req, user, code) {
  const step = verifyTotp(user.mfa_secret, code, { lastStep: user.mfa_last_step })
  if (step === null) {
    audit(req, 'auth.mfa', { outcome: 'failed' })
    throw new HttpError(401, 'mfa.invalid')
  }
  run('UPDATE users SET mfa_last_step = ? WHERE id = ?', step, user.id)
  run('UPDATE sessions SET mfa_at = ? WHERE token = ?', nowIso(), req.user.token)
  req.user.mfa_at = nowIso()
  audit(req, 'auth.mfa')
}

// Switch to one of the signed-in person's own verified memberships.
identity.post('/workspaces/active', requireUser, mfaLimit, (req, res) => {
  const membershipId = id(req.body.membershipId)
  const m = activeMemberships(req.user.id).find((x) => x.id === membershipId)
  if (!m) {
    audit(req, 'workspace.switch', { outcome: 'denied', entityType: 'membership', entityId: membershipId })
    throw forbidden()
  }
  if (isPrivilegedRole(m.role) && !req.user.mfa_at) {
    const user = one('SELECT * FROM users WHERE id = ?', req.user.id)
    if (!user.mfa_enabled_at) return res.status(403).json({ error: 'mfa.setup_required' })
    if (!req.body.code) return res.status(403).json({ error: 'mfa.required' })
    checkMfaCode(req, user, req.body.code)
  }
  activate(req, m.id)
  audit(req, 'workspace.switch', { entityType: 'membership', entityId: m.id, schoolId: m.school_id, detail: { role: m.role } })
  req.ctx = null
  loadContext(req, res, () => res.json(sessionPayload(req)))
})

// ---------- MFA enrolment ----------

identity.post(
  '/mfa/setup',
  requireUser,
  wrap(async (req, res) => {
    const user = one('SELECT * FROM users WHERE id = ?', req.user.id)
    if (user.mfa_enabled_at) throw bad('mfa.already_enabled')
    const secret = newSecret()
    run('UPDATE users SET mfa_secret = ? WHERE id = ?', secret, user.id)
    const uri = otpauthUri(secret, user.email)
    const qr = await QRCode.toString(uri, { type: 'svg', margin: 1 })
    res.json({ secret, uri, qr })
  }),
)

identity.post('/mfa/enable', requireUser, mfaLimit, (req, res) => {
  const user = one('SELECT * FROM users WHERE id = ?', req.user.id)
  if (user.mfa_enabled_at) throw bad('mfa.already_enabled')
  if (!user.mfa_secret) throw bad('mfa.setup_first')
  const step = verifyTotp(user.mfa_secret, req.body.code)
  if (step === null) throw new HttpError(401, 'mfa.invalid')
  run('UPDATE users SET mfa_enabled_at = ?, mfa_last_step = ? WHERE id = ?', nowIso(), step, user.id)
  run('UPDATE sessions SET mfa_at = ? WHERE token = ?', nowIso(), req.user.token)
  audit(req, 'auth.mfa_enabled', { entityType: 'user', entityId: user.id })
  res.json({ ok: true })
})

// ---------- Password recovery ----------

const recoverLimit = rateLimit({ windowMs: 15 * 60e3, max: 5 })

function createReset(userId, createdBy = null) {
  const token = newToken()
  run('INSERT INTO password_resets (token_hash, user_id, expires_at, created_by) VALUES (?, ?, ?, ?)', sha256(token), userId, new Date(Date.now() + 60 * 60e3).toISOString(), createdBy)
  return token
}

// Always answers the same way, whether or not the account exists. The link is
// queued for email; no email provider is connected yet, so school admins can
// also issue a reset link from the People screen.
identity.post('/auth/recover', recoverLimit, (req, res) => {
  const user = findAccount(req.body.identifier, req.body.institution)
  if (user && !user.disabled_at) {
    const token = createReset(user.id)
    run("INSERT INTO outbox (channel, recipient, template, payload) VALUES ('email', ?, 'password_reset', ?)", user.email, JSON.stringify({ path: `/reset/${token}` }))
    audit(req, 'auth.recover_requested', { userId: user.id })
  }
  res.json({ ok: true })
})

identity.post('/auth/reset', recoverLimit, (req, res) => {
  const token = text(req.body.token, 200)
  const password = String(req.body.password ?? '')
  if (password.length < 8) throw bad('auth.shortPassword')
  const row = one('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', sha256(token), nowIso())
  if (!row) throw bad('reset.invalid')
  transaction(() => {
    run('UPDATE password_resets SET used_at = ? WHERE token_hash = ?', nowIso(), row.token_hash)
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), row.user_id)
    run('DELETE FROM sessions WHERE user_id = ?', row.user_id)
  })
  audit(req, 'auth.password_reset', { userId: row.user_id, entityType: 'user', entityId: row.user_id })
  res.json({ ok: true })
})

// ---------- Invitations ----------

// Roles a school can invite to. Group roles are set up by the provider, and
// students join through enrollment, not invitations.
const INVITABLE = Object.keys(ROLES).filter((r) => ROLES[r].level !== 'group' && r !== 'student')
// Roles that can themselves invite others need someone who can manage members.
const canInviteRole = (ctx, role) => INVITABLE.includes(role) && (!ROLES[role].perms.includes('members.invite') || ctx.perms.has('members.manage'))

identity.post(
  '/admin/invitations',
  requirePerm('members.invite'),
  wrap(async (req, res) => {
    const b = req.body
    const school = req.ctx.schoolId
    if (!school) throw bad('school.required')
    const role = String(b.role ?? '')
    if (!canInviteRole(req.ctx, role)) throw forbidden()
    const email = required(b.email, 200).toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('invalid.email')
    const name = required(b.name, 80)
    const scopes = {}
    if (role === 'teacher') {
      const year = currentYear(school)
      const ids = (Array.isArray(b.sectionIds) ? b.sectionIds : []).map(Number)
      const valid = all('SELECT id FROM sections WHERE school_id = ? AND academic_year_id = ?', school, year?.id ?? -1).map((r) => r.id)
      if (!ids.length || ids.some((x) => !valid.includes(x))) throw bad('invalid.section')
      scopes.sections = ids
    }
    if (role === 'guardian') {
      const studentId = id(b.studentId)
      const enrolled = one("SELECT 1 AS x FROM enrollments WHERE school_id = ? AND student_user_id = ? AND status = 'active'", school, studentId)
      if (!enrolled) throw bad('invalid.student')
      const relationship = ['mother', 'father', 'guardian', 'grandparent', 'other'].includes(b.relationship) ? b.relationship : 'guardian'
      scopes.guardianOf = { studentId, relationship, canPickup: Boolean(b.canPickup), canViewFees: Boolean(b.canViewFees) }
    }
    const token = newToken()
    const invId = Number(
      run(
        'INSERT INTO invitations (school_id, email, name, role, scopes, token_hash, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        school, email, name, role, JSON.stringify(scopes), sha256(token), req.user.id, addDays(isoDate(), 7) + 'T23:59:59Z',
      ).lastInsertRowid,
    )
    run("INSERT INTO outbox (school_id, channel, recipient, template, payload) VALUES (?, 'email', ?, 'invitation', ?)", school, email, JSON.stringify({ path: `/invite/${token}` }))
    audit(req, 'member.invited', { entityType: 'invitation', entityId: invId, detail: { role, email } })
    res.json({ ok: true, link: `/invite/${token}` })
  }),
)

identity.get('/admin/invitations', requirePerm('members.invite'), (req, res) => {
  res.json({
    invitations: all(
      `SELECT i.id, i.email, i.name, i.role, i.expires_at, i.created_at, u.name AS invited_by FROM invitations i JOIN users u ON u.id = i.invited_by
       WHERE i.school_id = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ? ORDER BY i.id DESC`,
      req.ctx.schoolId,
      nowIso(),
    ).map((i) => ({ ...i, roleLabel: roleLabel(i.role) })),
  })
})

identity.delete('/admin/invitations/:id', requirePerm('members.invite'), (req, res) => {
  const { changes } = run('UPDATE invitations SET revoked_at = ? WHERE id = ? AND school_id = ? AND accepted_at IS NULL', nowIso(), id(req.params.id), req.ctx.schoolId)
  if (!changes) throw notFound()
  audit(req, 'member.invite_revoked', { entityType: 'invitation', entityId: req.params.id })
  res.json({ ok: true })
})

const inviteByToken = (token) =>
  one(
    `SELECT i.*, s.name_en AS school_en, s.name_kn AS school_kn, s.code AS school_code FROM invitations i JOIN schools s ON s.id = i.school_id
     WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?`,
    sha256(text(token, 200)),
    nowIso(),
  )

identity.get('/invitations/:token', (req, res) => {
  const inv = inviteByToken(req.params.token)
  if (!inv) throw notFound()
  const existing = one('SELECT 1 AS x FROM users WHERE email = ?', inv.email)
  res.json({ name: inv.name, email: inv.email, role: inv.role, roleLabel: roleLabel(inv.role), school: { en: inv.school_en, kn: inv.school_kn }, existingAccount: Boolean(existing) })
})

identity.post(
  '/invitations/:token/accept',
  loginLimit,
  wrap(async (req, res) => {
    const inv = inviteByToken(req.params.token)
    if (!inv) throw notFound()
    const password = String(req.body.password ?? '')
    let user = one('SELECT * FROM users WHERE email = ?', inv.email)
    if (user) {
      // An existing account proves it is theirs with its current password.
      if (!verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'auth.invalid' })
    } else if (password.length < 8) throw bad('auth.shortPassword')
    const scopes = JSON.parse(inv.scopes)
    const def = ROLES[inv.role]
    transaction(() => {
      if (!user) {
        const first = inv.name.split(/\s+/)[0]
        const legacy = { learner: 'student', teacher: 'teacher', guardian: 'guardian', admin: 'admin', worker: 'staff' }[def.kind]
        const uid = Number(
          run(
            `INSERT INTO users (email, password_hash, role, name, first_name_en, first_name_kn, school_en, school_kn, class_name_en, class_name_kn)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '')`,
            inv.email, hashPassword(password), legacy, inv.name, first, first, inv.school_en, inv.school_kn,
          ).lastInsertRowid,
        )
        user = one('SELECT * FROM users WHERE id = ?', uid)
      }
      if (one("SELECT 1 AS x FROM memberships WHERE user_id = ? AND school_id = ? AND role = ? AND status = 'active'", user.id, inv.school_id, inv.role)) {
        throw bad('member.exists')
      }
      addMembership({ userId: user.id, schoolId: inv.school_id, role: inv.role, sections: scopes.sections ?? [], createdBy: inv.invited_by })
      if (def.kind !== 'guardian' && !one('SELECT 1 AS x FROM employees WHERE school_id = ? AND user_id = ?', inv.school_id, user.id)) {
        const n = one('SELECT COUNT(*) AS n FROM employees WHERE school_id = ?', inv.school_id).n + 1
        addEmployee({
          schoolId: inv.school_id,
          userId: user.id,
          employeeNo: `EMP-${String(n + 1000)}`,
          staffType: def.kind === 'teacher' ? 'teaching' : 'non_teaching',
          department: def.kind === 'teacher' ? 'Academics' : def.kind === 'admin' ? 'Administration' : 'Facilities',
          designation: roleLabel(inv.role),
        })
      }
      if (scopes.guardianOf) {
        const g = scopes.guardianOf
        // The inviting admin verified the relationship before sending the invite.
        run(
          `INSERT INTO guardian_links (school_id, guardian_user_id, student_user_id, relationship, can_pickup, can_view_fees, verified_at, verified_by, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
           ON CONFLICT (school_id, guardian_user_id, student_user_id) DO UPDATE SET status = 'active', verified_at = excluded.verified_at, verified_by = excluded.verified_by`,
          inv.school_id, user.id, g.studentId, g.relationship, g.canPickup ? 1 : 0, g.canViewFees ? 1 : 0, inv.created_at, inv.invited_by,
        )
      }
      run('UPDATE invitations SET accepted_at = ?, accepted_user_id = ? WHERE id = ?', nowIso(), user.id, inv.id)
    })
    audit(req, 'member.invite_accepted', { userId: user.id, schoolId: inv.school_id, entityType: 'invitation', entityId: inv.id, detail: { role: inv.role } })
    const session = createSession(user.id, { portal: null })
    setSessionCookie(res, session)
    res.json({ ok: true })
  }),
)

// ---------- School administration ----------

const schoolScoped = (req) => {
  if (!req.ctx.schoolId) throw bad('school.required')
  return req.ctx.schoolId
}

identity.get('/admin/overview', requirePerm('school.view'), (req, res) => {
  const school = schoolScoped(req)
  const year = currentYear(school)
  const s = one('SELECT * FROM schools WHERE id = ?', school)
  const today = isoDate()
  const count = (sql, ...p) => one(sql, ...p).n
  const attendance = all('SELECT status, COUNT(*) AS n FROM attendance WHERE school_id = ? AND date = ? GROUP BY status', school, today)
  res.json({
    school: { id: s.id, code: s.code, name: { en: s.name_en, kn: s.name_kn }, board: s.board, timezone: s.timezone },
    year: year && { label: year.label, startsOn: year.starts_on, endsOn: year.ends_on },
    counts: {
      students: count("SELECT COUNT(*) AS n FROM enrollments WHERE school_id = ? AND academic_year_id = ? AND status = 'active'", school, year?.id ?? -1),
      sections: count('SELECT COUNT(*) AS n FROM sections WHERE school_id = ? AND academic_year_id = ?', school, year?.id ?? -1),
      staff: count("SELECT COUNT(*) AS n FROM employees WHERE school_id = ? AND status = 'active'", school),
      guardians: count("SELECT COUNT(DISTINCT guardian_user_id) AS n FROM guardian_links WHERE school_id = ? AND status = 'active'", school),
      pendingInvites: count('SELECT COUNT(*) AS n FROM invitations WHERE school_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?', school, nowIso()),
    },
    attendanceToday: { date: today, ...Object.fromEntries(attendance.map((a) => [a.status, a.n])) },
    permissions: [...req.ctx.perms],
  })
})

identity.get('/admin/members', requirePerm('members.view'), (req, res) => {
  const school = schoolScoped(req)
  const q = `%${text(req.query.q, 80)}%`
  const rows = all(
    `SELECT m.id, m.role, m.status, m.created_at, u.id AS user_id, u.name, u.email, u.mfa_enabled_at,
            (SELECT group_concat(sec.label_en, ', ') FROM membership_scopes ms JOIN sections sec ON sec.id = ms.scope_id
              WHERE ms.membership_id = m.id AND ms.scope_type = 'section') AS sections
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.school_id = ? AND m.status != 'ended' AND (u.name LIKE ? OR u.email LIKE ?)
     ORDER BY u.name, m.role LIMIT 300`,
    school, q, q,
  )
  res.json({
    members: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      email: r.email,
      role: r.role,
      roleLabel: roleLabel(r.role),
      kind: ROLES[r.role]?.kind,
      status: r.status,
      mfa: Boolean(r.mfa_enabled_at),
      sections: r.sections ?? '',
      self: r.user_id === req.user.id,
    })),
    invitableRoles: req.ctx.perms.has('members.invite') ? INVITABLE.filter((r) => canInviteRole(req.ctx, r)).map((r) => ({ role: r, label: roleLabel(r), kind: ROLES[r].kind })) : [],
  })
})

identity.patch('/admin/members/:id', requirePerm('members.manage'), (req, res) => {
  const school = schoolScoped(req)
  const m = one('SELECT * FROM memberships WHERE id = ? AND school_id = ?', id(req.params.id), school)
  if (!m) throw notFound()
  if (m.user_id === req.user.id) throw bad('member.self')
  const status = req.body.status
  if (!['active', 'suspended', 'ended'].includes(status)) throw bad()
  if (m.status === 'ended') throw bad('member.ended')
  transaction(() => {
    run('UPDATE memberships SET status = ?, valid_to = CASE WHEN ? = \'ended\' THEN ? ELSE valid_to END WHERE id = ?', status, status, isoDate(), m.id)
    if (status !== 'active') run('UPDATE sessions SET active_membership_id = NULL WHERE active_membership_id = ?', m.id)
  })
  audit(req, 'member.status_changed', { entityType: 'membership', entityId: m.id, detail: { from: m.status, to: status, role: m.role } })
  res.json({ ok: true })
})

// Issues a one-hour reset link for a member, for the admin to hand over in person.
// Refused when the account also belongs to another school, so one school cannot
// take over an account another school relies on.
identity.post('/admin/members/:id/reset-password', requirePerm('members.manage'), (req, res) => {
  const school = schoolScoped(req)
  const m = one('SELECT * FROM memberships WHERE id = ? AND school_id = ?', id(req.params.id), school)
  if (!m) throw notFound()
  if (m.user_id === req.user.id) throw bad('member.self')
  const elsewhere = one("SELECT 1 AS x FROM memberships WHERE user_id = ? AND status = 'active' AND (school_id IS NULL OR school_id != ?)", m.user_id, school)
  if (elsewhere) throw new HttpError(409, 'member.shared')
  const target = one('SELECT mfa_enabled_at FROM users WHERE id = ?', m.user_id)
  if (target.mfa_enabled_at && activeMemberships(m.user_id).some((x) => isPrivilegedRole(x.role))) throw new HttpError(409, 'member.privileged')
  const token = createReset(m.user_id, req.user.id)
  audit(req, 'member.reset_link_issued', { entityType: 'user', entityId: m.user_id })
  res.json({ link: `/reset/${token}` })
})

identity.get('/admin/students', requirePerm('students.view'), (req, res) => {
  const school = schoolScoped(req)
  const year = currentYear(school)
  res.json({
    students: all(
      `SELECT u.id, u.name, e.admission_no, e.roll_no, sec.label_en, sec.label_kn,
              (SELECT COUNT(*) FROM guardian_links l WHERE l.student_user_id = u.id AND l.school_id = e.school_id AND l.status = 'active') AS guardians
       FROM enrollments e JOIN users u ON u.id = e.student_user_id JOIN sections sec ON sec.id = e.section_id
       WHERE e.school_id = ? AND e.academic_year_id = ? AND e.status = 'active' ORDER BY sec.label_en, u.name`,
      school,
      year?.id ?? -1,
    ).map((s) => ({ id: s.id, name: s.name, admissionNo: s.admission_no, rollNo: s.roll_no, section: { en: s.label_en, kn: s.label_kn }, guardians: s.guardians })),
  })
})

// Staff directory. Pay and bank details appear only for people whose role is
// meant to see them (HR, payroll), and every such read is audited.
identity.get('/admin/staff', requirePerm('staff.view'), (req, res) => {
  const school = schoolScoped(req)
  const withPay = req.ctx.perms.has('hr.compensation.view')
  const rows = all(
    `SELECT e.*, u.name, d.name_en AS dept_en, d.name_kn AS dept_kn FROM employees e JOIN users u ON u.id = e.user_id
     LEFT JOIN departments d ON d.id = e.department_id WHERE e.school_id = ? ORDER BY u.name`,
    school,
  )
  const pay = (empId) =>
    one('SELECT effective_from, monthly_gross_paise, bank_account_last4 FROM employee_compensation WHERE employee_id = ? AND school_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1', empId, school, isoDate())
  if (withPay) audit(req, 'hr.compensation.read', { entityType: 'employees', entityId: 'directory' })
  res.json({
    canSeePay: withPay,
    staff: rows.map((e) => ({
      id: e.id,
      name: e.name,
      employeeNo: e.employee_no,
      staffType: e.staff_type,
      department: e.dept_en ? { en: e.dept_en, kn: e.dept_kn } : null,
      designation: { en: e.designation_en, kn: e.designation_kn },
      status: e.status,
      ...(withPay ? { pay: pay(e.id) && { from: pay(e.id).effective_from, monthlyGrossPaise: pay(e.id).monthly_gross_paise, bankLast4: pay(e.id).bank_account_last4 } } : {}),
    })),
  })
})

const NOTE_PERMS = { health: 'health.view', counseling: 'counseling.view', safeguarding: 'safeguarding.view' }

// Restricted notes: each kind has its own permission, regardless of seniority.
identity.get('/students/:id/notes/:kind', requireUser, (req, res) => {
  const kind = req.params.kind
  const perm = NOTE_PERMS[kind]
  if (!perm) throw notFound()
  return requirePerm(perm)(req, res, () => {
    const school = schoolScoped(req)
    const studentId = id(req.params.id)
    if (!one('SELECT 1 AS x FROM enrollments WHERE school_id = ? AND student_user_id = ?', school, studentId)) throw notFound()
    audit(req, `${kind}.read`, { entityType: 'student', entityId: studentId })
    res.json({
      notes: all('SELECT id, body, created_at FROM student_notes WHERE school_id = ? AND student_user_id = ? AND kind = ? ORDER BY id DESC', school, studentId, kind),
    })
  })
})

identity.get('/admin/audit', requirePerm('audit.view'), (req, res) => {
  const school = schoolScoped(req)
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER
  const rows = all(
    `SELECT a.id, a.at, a.action, a.outcome, a.entity_type, a.entity_id, a.detail, u.name AS actor FROM audit_events a
     LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.school_id = ? AND a.id < ? ORDER BY a.id DESC LIMIT 50`,
    school,
    before,
  )
  res.json({ events: rows.map((r) => ({ ...r, detail: JSON.parse(r.detail) })), next: rows.length === 50 ? rows.at(-1).id : null })
})

identity.get('/admin/setup', requirePerm('school.view'), (req, res) => {
  const school = schoolScoped(req)
  const year = currentYear(school)
  const s = one('SELECT s.*, g.name AS group_name, l.name AS legal_name FROM schools s LEFT JOIN school_groups g ON g.id = s.group_id LEFT JOIN legal_entities l ON l.id = s.legal_entity_id WHERE s.id = ?', school)
  res.json({
    school: { code: s.code, name: { en: s.name_en, kn: s.name_kn }, board: s.board, emailDomain: s.email_domain, languages: s.languages.split(','), timezone: s.timezone, group: s.group_name, legalEntity: s.legal_name },
    campuses: all('SELECT id, code, name_en, name_kn FROM campuses WHERE school_id = ?', school).map((c) => ({ id: c.id, code: c.code, name: { en: c.name_en, kn: c.name_kn } })),
    years: all('SELECT label, starts_on, ends_on, status FROM academic_years WHERE school_id = ? ORDER BY starts_on DESC', school),
    financialYears: all('SELECT f.label, f.starts_on, f.ends_on, f.status FROM financial_years f JOIN schools s ON s.legal_entity_id = f.legal_entity_id WHERE s.id = ?', school),
    terms: all('SELECT name_en, name_kn, starts_on, ends_on FROM terms WHERE school_id = ? AND academic_year_id = ? ORDER BY starts_on', school, year?.id ?? -1).map((t) => ({ name: { en: t.name_en, kn: t.name_kn }, startsOn: t.starts_on, endsOn: t.ends_on })),
    departments: all('SELECT name_en, name_kn, kind FROM departments WHERE school_id = ? ORDER BY name_en', school).map((d) => ({ name: { en: d.name_en, kn: d.name_kn }, kind: d.kind })),
    grades: all('SELECT level, name_en, name_kn FROM grades WHERE school_id = ? ORDER BY level', school).map((g) => ({ level: g.level, name: { en: g.name_en, kn: g.name_kn } })),
    sections: all(
      `SELECT sec.id, sec.label_en, sec.label_kn, sec.capacity, g.level,
              (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = sec.id AND e.status = 'active') AS enrolled
       FROM sections sec JOIN grades g ON g.id = sec.grade_id WHERE sec.school_id = ? AND sec.academic_year_id = ? ORDER BY g.level, sec.name`,
      school,
      year?.id ?? -1,
    ).map((x) => ({ id: x.id, label: { en: x.label_en, kn: x.label_kn }, capacity: x.capacity, level: x.level, enrolled: x.enrolled })),
    canConfigure: req.ctx.perms.has('school.configure'),
  })
})

identity.post('/admin/sections', requirePerm('school.configure'), (req, res) => {
  const school = schoolScoped(req)
  const year = currentYear(school)
  if (!year) throw bad('year.missing')
  const level = Number(req.body.level)
  const name = text(req.body.name, 4).toUpperCase()
  const capacity = Number(req.body.capacity) || 40
  if (!/^[A-Z]{1,2}$/.test(name) || !(capacity > 0 && capacity <= 80)) throw bad()
  const grade = one('SELECT * FROM grades WHERE school_id = ? AND level = ?', school, level)
  if (!grade) throw bad('invalid.grade')
  const campus = one('SELECT id FROM campuses WHERE school_id = ? ORDER BY id LIMIT 1', school)
  if (one('SELECT 1 AS x FROM sections WHERE academic_year_id = ? AND grade_id = ? AND name = ?', year.id, grade.id, name)) throw bad('section.exists')
  const sid = run(
    'INSERT INTO sections (school_id, campus_id, academic_year_id, grade_id, name, label_en, label_kn, capacity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    school, campus.id, year.id, grade.id, name, `Class ${level}${name}`, `${grade.name_kn} ${name}`, capacity,
  ).lastInsertRowid
  audit(req, 'school.section_created', { entityType: 'section', entityId: sid, detail: { level, name, capacity } })
  res.json({ ok: true })
})

// Group view: aggregate figures for the group's own schools only.
identity.get('/group/overview', requirePerm('group.view'), (req, res) => {
  const ids = req.ctx.schoolIds
  if (!ids.length) return res.json({ schools: [] })
  const schools = all(`SELECT * FROM schools WHERE id IN (${ids.map(Number).join(',')}) ORDER BY name_en`)
  res.json({
    group: one('SELECT name FROM school_groups WHERE id = ?', req.ctx.groupId)?.name ?? null,
    schools: schools.map((s) => {
      const year = currentYear(s.id)
      return {
        id: s.id,
        code: s.code,
        name: { en: s.name_en, kn: s.name_kn },
        students: one("SELECT COUNT(*) AS n FROM enrollments WHERE school_id = ? AND academic_year_id = ? AND status = 'active'", s.id, year?.id ?? -1).n,
        staff: one("SELECT COUNT(*) AS n FROM employees WHERE school_id = ? AND status = 'active'", s.id).n,
        sections: one('SELECT COUNT(*) AS n FROM sections WHERE school_id = ? AND academic_year_id = ?', s.id, year?.id ?? -1).n,
      }
    }),
  })
})

// ---------- Parents and guardians ----------

identity.get('/family/children', requirePerm('family.view'), (req, res) => {
  res.json({
    children: guardianChildren(req.ctx, req.user.id).map((c) => ({
      id: c.student_user_id,
      name: c.name,
      firstName: { en: c.first_name_en, kn: c.first_name_kn },
      relationship: c.relationship,
      section: c.section_en ? { en: c.section_en, kn: c.section_kn } : null,
      admissionNo: c.admission_no,
      canPickup: Boolean(c.can_pickup),
      canViewFees: Boolean(c.can_view_fees),
    })),
  })
})

identity.get('/family/children/:id', requirePerm('family.view'), (req, res) => {
  const childId = id(req.params.id)
  const link = guardianChildren(req.ctx, req.user.id).find((c) => c.student_user_id === childId)
  if (!link) {
    audit(req, 'family.child_denied', { outcome: 'denied', entityType: 'student', entityId: childId })
    throw forbidden()
  }
  if (!link.section_id) return res.json({ enrolled: false })
  const scope = { schoolId: req.ctx.schoolId, sectionId: link.section_id }
  const today = isoDate()
  const attendance = {}
  for (const row of all('SELECT date, status FROM attendance WHERE student_id = ? AND school_id = ? AND date >= ?', childId, scope.schoolId, addDays(today, -120))) {
    attendance[row.date] = row.status
  }
  res.json({
    enrolled: true,
    today,
    homework: studentHomework(childId, scope),
    exams: upcomingExams(scope),
    results: all('SELECT * FROM results WHERE student_id = ? AND school_id = ? ORDER BY created_at DESC, id DESC LIMIT 20', childId, scope.schoolId).map(toResult),
    announcements: scopedAnnouncements(scope).slice(0, 10),
    awards: studentAwards(childId, scope),
    attendance,
  })
})

// ---------- Staff self-service ----------

identity.get('/staff/me', requirePerm('self.service'), (req, res) => {
  const school = schoolScoped(req)
  const e = one(
    `SELECT e.*, d.name_en AS dept_en, d.name_kn AS dept_kn FROM employees e LEFT JOIN departments d ON d.id = e.department_id
     WHERE e.school_id = ? AND e.user_id = ?`,
    school,
    req.user.id,
  )
  // People always see their own pay record.
  const pay = e && one('SELECT effective_from, monthly_gross_paise, bank_account_last4 FROM employee_compensation WHERE employee_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1', e.id, isoDate())
  res.json({
    employee: e && {
      employeeNo: e.employee_no,
      staffType: e.staff_type,
      department: e.dept_en ? { en: e.dept_en, kn: e.dept_kn } : null,
      designation: { en: e.designation_en, kn: e.designation_kn },
      joinedOn: e.joined_on,
    },
    pay: pay && { from: pay.effective_from, monthlyGrossPaise: pay.monthly_gross_paise, bankLast4: pay.bank_account_last4 },
    announcements: all('SELECT * FROM announcements WHERE school_id = ? AND section_id IS NULL ORDER BY created_at DESC LIMIT 10', school).map((a) => ({
      id: a.id,
      title: { en: a.title_en, kn: a.title_kn },
      body: { en: a.body_en, kn: a.body_kn },
      createdAt: a.created_at.replace(' ', 'T') + 'Z',
    })),
  })
})

