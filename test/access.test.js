// Acceptance checks for the identity, tenancy and authorization foundation
// (master prompt §11, criteria 1–5, plus MFA, recovery and invitations).
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { startApp } from './helpers.js'

let app
let one
let codeAt
let currentStep
const idOf = (email) => one('SELECT id FROM users WHERE email = ?', email).id
const mfaCode = (email, offset = 0) => codeAt(one('SELECT mfa_secret FROM users WHERE email = ?', email).mfa_secret, currentStep() + offset)

const JASON = 'jason@vidyanexus.school'
const RAHUL = 'rahul.k@vidyanexus.school'
const DOLA = 'dola.ramesh@vidyanexus.school'
const SURESH = 'suresh.k@vidyanexus.school'
const PRINCIPAL = 'principal@vidyanexus.school'
const TRUSTEE = 'trustee@vidyanexus.school'
const KIRAN = 'kiran.m@vidyanexus.school'
const HR = 'hr@vidyanexus.school'
const ASHA = 'asha.k@sahyadri.school'
const NIKHIL = 'nikhil@sahyadri.school'

// Signs in and opens the given workspace role (with MFA when needed).
// (Clears the replay marker first so tests can sign the same person in repeatedly
// within one 30-second window; the replay rule itself has its own test.)
async function as(email, password, role) {
  const c = app.client()
  const s = await c.login(email, password)
  const w = s.workspaces.find((x) => x.role === role)
  assert.ok(w, `${email} has no ${role} workspace`)
  if (s.active?.id !== w.id) {
    const body = { membershipId: w.id }
    if (w.privileged) {
      app.db.run('UPDATE users SET mfa_last_step = NULL WHERE email = ?', email)
      body.code = mfaCode(email)
    }
    const r = await c.post('/workspaces/active', body)
    assert.equal(r.status, 200, JSON.stringify(r.data))
  }
  return c
}

before(async () => {
  app = await startApp()
  one = app.db.one
  ;({ codeAt, currentStep } = await import('../server/totp.js'))
})
after(() => app.close())

describe('1. entry cards and URLs cannot grant permissions', () => {
  test('a student who signs in through the administration card gets no admin access', async () => {
    const c = app.client()
    const s = await c.login(JASON, 'jason123', { portal: 'admin' })
    assert.equal(s.user.role === 'admin', false)
    assert.ok(s.workspaces.every((w) => w.kind === 'learner'))
    for (const p of ['/admin/overview', '/admin/members', '/admin/staff', '/admin/audit', '/group/overview']) {
      const r = await c.get(p)
      assert.equal(r.status, 403, p)
    }
  })

  test("nobody can switch into another person's membership by id", async () => {
    const c = await as(DOLA, 'teacher123', 'teacher')
    const principalMembership = one("SELECT id FROM memberships WHERE role = 'principal'").id
    const r = await c.post('/workspaces/active', { membershipId: principalMembership })
    assert.equal(r.status, 403)
    assert.equal((await c.get('/admin/overview')).status, 403)
  })

  test('denied attempts are written to the audit log', async () => {
    const before = one("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'access.denied'").n
    const c = await as(DOLA, 'teacher123', 'teacher')
    await c.get('/admin/staff')
    assert.equal(one("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'access.denied'").n, before + 1)
  })
})

describe('2. tenant isolation', () => {
  test('students only see their own school and section', async () => {
    const jason = await as(JASON, 'jason123', 'student')
    const j = (await jason.get('/student/overview')).data
    assert.ok(j.homework.length > 0)
    assert.ok(j.homework.every((h) => !h.title.en.startsWith('Sahyadri')))
    assert.ok(j.announcements.every((a) => !a.title.en.startsWith('Sahyadri')))

    const nikhil = await as(NIKHIL, 'student123', 'student')
    const n = (await nikhil.get('/student/overview')).data
    assert.deepEqual(n.homework.map((h) => h.title.en), ['Sahyadri maths sheet'])
    assert.deepEqual(n.announcements.map((a) => a.title.en), ['Sahyadri sports meet'])
    assert.deepEqual(n.awards, [])
    // Toggling another school's homework is refused.
    const vpsHomework = one("SELECT id FROM homework WHERE school_id = (SELECT id FROM schools WHERE code = 'VPS-BLR') LIMIT 1").id
    assert.equal((await nikhil.post(`/homework/${vpsHomework}/toggle`)).status, 404)
  })

  test("a teacher cannot see or change another school's records", async () => {
    const asha = await as(ASHA, 'teacher123', 'teacher')
    const o = (await asha.get('/teacher/overview')).data
    assert.deepEqual(o.students.map((s) => s.email), [NIKHIL])
    assert.ok(o.homework.every((h) => h.title.en.startsWith('Sahyadri')))
    assert.ok(o.announcements.every((a) => a.title.en.startsWith('Sahyadri')))

    const vpsHomework = one("SELECT id FROM homework WHERE school_id = (SELECT id FROM schools WHERE code = 'VPS-BLR') LIMIT 1").id
    assert.equal((await asha.del(`/teacher/homework/${vpsHomework}`)).status, 404)
    assert.ok(one('SELECT id FROM homework WHERE id = ?', vpsHomework))

    const marks = await asha.post('/teacher/results', { subject: 'mathematics', nameEn: 'Test', max: 10, scores: { [idOf(JASON)]: 5 } })
    assert.equal(marks.status, 400)
    const award = await asha.post('/teacher/awards', { studentId: idOf(JASON), titleEn: 'x', category: 'academic', level: 'school', medal: 'gold', date: '2026-01-01' })
    assert.equal(award.status, 403)
    await asha.put('/teacher/attendance', { date: '2026-01-05', marks: { [idOf(JASON)]: 'A' } })
    assert.equal(one('SELECT status FROM attendance WHERE student_id = ? AND date = ?', idOf(JASON), '2026-01-05'), undefined)
  })

  test("a principal's registers only list their own school", async () => {
    const c = await as(PRINCIPAL, 'admin1234', 'principal')
    const students = (await c.get('/admin/students')).data.students
    assert.ok(students.some((s) => s.name === 'Jason'))
    assert.ok(students.every((s) => s.name !== 'Nikhil S.'))
    const members = (await c.get('/admin/members')).data.members
    assert.ok(members.every((m) => m.email !== ASHA))
    // Restricted notes of another school's student are not found.
    const notes = await c.get(`/students/${idOf(NIKHIL)}/notes/health`)
    assert.equal(notes.status, 403)
  })

  test('the group view covers only schools in that group', async () => {
    const c = await as(TRUSTEE, 'admin1234', 'owner_trustee')
    const g = (await c.get('/group/overview')).data
    assert.deepEqual(g.schools.map((s) => s.code), ['VPS-BLR'])
  })
})

describe('3. parents see only correctly linked children', () => {
  test('linked child is visible, other children are not', async () => {
    const c = await as(SURESH, 'parent123', 'guardian')
    const kids = (await c.get('/family/children')).data.children
    assert.deepEqual(kids.map((k) => k.name), ['Jason'])
    const own = await c.get(`/family/children/${idOf(JASON)}`)
    assert.equal(own.status, 200)
    assert.ok(own.data.homework.length > 0)
    assert.equal((await c.get(`/family/children/${idOf(RAHUL)}`)).status, 403)
    assert.equal((await c.get(`/family/children/${idOf(NIKHIL)}`)).status, 403)
  })

  test('an unverified or suspended link shows nothing', async () => {
    app.db.run("UPDATE guardian_links SET status = 'suspended' WHERE guardian_user_id = ?", idOf(SURESH))
    const c = await as(SURESH, 'parent123', 'guardian')
    assert.deepEqual((await c.get('/family/children')).data.children, [])
    assert.equal((await c.get(`/family/children/${idOf(JASON)}`)).status, 403)
    app.db.run("UPDATE guardian_links SET status = 'active' WHERE guardian_user_id = ?", idOf(SURESH))
  })

  test('a parent cannot use student or teacher endpoints', async () => {
    const c = await as(SURESH, 'parent123', 'guardian')
    assert.equal((await c.get('/student/overview')).status, 403)
    assert.equal((await c.get('/teacher/overview')).status, 403)
  })
})

describe('4. salaries and restricted notes', () => {
  test('a teacher cannot read salaries or counseling/health/safeguarding notes', async () => {
    const c = await as(DOLA, 'teacher123', 'teacher')
    assert.equal((await c.get('/admin/staff')).status, 403)
    for (const kind of ['counseling', 'health', 'safeguarding']) {
      assert.equal((await c.get(`/students/${idOf(JASON)}/notes/${kind}`)).status, 403, kind)
    }
  })

  test('seniority alone does not unlock pay or counseling notes', async () => {
    const c = await as(PRINCIPAL, 'admin1234', 'principal')
    const staff = (await c.get('/admin/staff')).data
    assert.equal(staff.canSeePay, false)
    assert.ok(staff.staff.every((s) => !('pay' in s)))
    assert.equal((await c.get(`/students/${idOf(JASON)}/notes/counseling`)).status, 403)
  })

  test('HR sees pay, and the read is audited', async () => {
    const c = await as(HR, 'admin1234', 'hr')
    const staff = (await c.get('/admin/staff')).data
    assert.equal(staff.canSeePay, true)
    assert.ok(staff.staff.some((s) => s.pay?.monthlyGrossPaise === 5200000))
    assert.ok(one("SELECT 1 AS x FROM audit_events WHERE action = 'hr.compensation.read'"))
  })

  test('staff see their own pay in self-service', async () => {
    const c = await as(DOLA, 'teacher123', 'teacher')
    const me = (await c.get('/staff/me')).data
    assert.equal(me.pay.monthlyGrossPaise, 5200000)
  })
})

describe('5. multi-role users switch only among verified memberships', () => {
  test('an accountant who is also a parent can switch, with MFA for the admin side', async () => {
    const c = app.client()
    const s = await c.login(KIRAN, 'admin1234', { portal: 'family' })
    assert.deepEqual(s.workspaces.map((w) => w.role).sort(), ['accountant', 'guardian'])
    // The family card opens the parent workspace straight away.
    assert.equal(s.active.role, 'guardian')
    assert.deepEqual((await c.get('/family/children')).data.children.map((k) => k.name), ['Rahul K.'])

    const acct = s.workspaces.find((w) => w.role === 'accountant')
    assert.equal((await c.post('/workspaces/active', { membershipId: acct.id })).data.error, 'mfa.required')
    assert.equal((await c.post('/workspaces/active', { membershipId: acct.id, code: '000000' })).status, 401)
    const ok = await c.post('/workspaces/active', { membershipId: acct.id, code: mfaCode(KIRAN) })
    assert.equal(ok.status, 200)
    assert.equal(ok.data.active.role, 'accountant')
    // Accountant permissions do not include the family view or pay.
    assert.equal((await c.get('/family/children')).status, 403)
    assert.equal((await c.get('/admin/staff')).status, 403)
  })

  test('the same MFA code cannot be used twice', async () => {
    app.db.run('UPDATE users SET mfa_last_step = NULL WHERE email = ?', TRUSTEE)
    const code = mfaCode(TRUSTEE)
    const a = app.client()
    const sa = await a.login(TRUSTEE, 'admin1234')
    assert.equal((await a.post('/workspaces/active', { membershipId: sa.workspaces[0].id, code })).status, 200)
    const b = app.client()
    const sb = await b.login(TRUSTEE, 'admin1234')
    assert.equal((await b.post('/workspaces/active', { membershipId: sb.workspaces[0].id, code })).status, 401)
  })

  test('a suspended membership stops working on the next request', async () => {
    const t = await as(DOLA, 'teacher123', 'teacher')
    assert.equal((await t.get('/teacher/overview')).status, 200)
    const p = await as(PRINCIPAL, 'admin1234', 'principal')
    const m = (await p.get('/admin/members')).data.members.find((x) => x.email === DOLA)
    assert.equal((await p.patch(`/admin/members/${m.id}`, { status: 'suspended' })).status, 200)
    assert.equal((await t.get('/teacher/overview')).status, 403)
    assert.equal((await p.patch(`/admin/members/${m.id}`, { status: 'active' })).status, 200)
  })
})

describe('sign-in, recovery and onboarding', () => {
  test('each sign-in page lists only the demo accounts for its own card', async () => {
    const keys = async (portal) => (await app.client().get(`/auth/demo?portal=${portal}`)).data.accounts.map((a) => a.key)
    const family = await keys('family')
    const admin = await keys('admin')
    assert.deepEqual(family.sort(), ['guardian', 'student'])
    assert.ok(admin.includes('accountantParent') && admin.includes('principal'))
    assert.ok(!(await keys('staff')).includes('accountantParent'))
  })

  test('unknown accounts and wrong passwords get the same answer', async () => {
    const c = app.client()
    const a = await c.post('/auth/login', { identifier: 'nobody@nowhere.in', password: 'x' })
    const b = await c.post('/auth/login', { identifier: JASON, password: 'wrong' })
    const d = await c.post('/auth/login', { identifier: 'VPS-07A-18', password: 'jason123', institution: 'NOPE' })
    assert.deepEqual([a.status, b.status, d.status], [401, 401, 401])
    assert.deepEqual([a.data, b.data, d.data], [{ error: 'auth.invalid' }, { error: 'auth.invalid' }, { error: 'auth.invalid' }])
  })

  test('students sign in with admission number + institution code; staff with employee ID or mobile', async () => {
    const s = await app.client().login('VPS-07A-18', 'jason123', { institution: 'vps-blr', portal: 'family' })
    assert.equal(s.user.email, JASON)
    const d = await app.client().login('EMP-0201', 'staff1234', { institution: 'VPS-BLR', portal: 'staff' })
    assert.equal(d.active.role, 'driver')
    assert.equal(d.user.role, 'staff')
    const m = await app.client().login('98450 12345', 'parent123', { portal: 'family' })
    assert.equal(m.user.email, SURESH)
  })

  test('privileged workspaces never open without MFA, even from the admin card', async () => {
    const c = app.client()
    const s = await c.login(PRINCIPAL, 'admin1234', { portal: 'admin' })
    assert.equal(s.active, null)
    assert.equal((await c.get('/admin/overview')).status, 403)
  })

  test('a non-teaching employee reaches self-service from either staff route, without teacher or admin rights', async () => {
    for (const portal of ['staff', 'admin']) {
      const c = app.client()
      const s = await c.login('manjunath.b@vidyanexus.school', 'staff1234', { portal })
      assert.equal(s.active.kind, 'worker')
      assert.equal((await c.get('/staff/me')).status, 200)
      assert.equal((await c.get('/teacher/overview')).status, 403)
      assert.equal((await c.get('/admin/overview')).status, 403)
    }
  })

  test('password recovery answers the same for unknown accounts and resets work once', async () => {
    const c = app.client()
    assert.deepEqual((await c.post('/auth/recover', { identifier: 'nobody@nowhere.in' })).data, { ok: true })
    assert.deepEqual((await c.post('/auth/recover', { identifier: RAHUL })).data, { ok: true })
    const p = await as(PRINCIPAL, 'admin1234', 'principal')
    const m = (await p.get('/admin/members')).data.members.find((x) => x.email === RAHUL)
    const { link } = (await p.post(`/admin/members/${m.id}/reset-password`)).data
    const token = link.split('/').pop()
    assert.equal((await c.post('/auth/reset', { token, password: 'newpass123' })).status, 200)
    assert.equal((await c.post('/auth/reset', { token, password: 'again12345' })).status, 400)
    await app.client().login(RAHUL, 'newpass123')
  })

  test('an admin cannot reset the password of an account shared with another school', async () => {
    app.db.run("INSERT INTO memberships (user_id, school_id, role) VALUES (?, (SELECT id FROM schools WHERE code = 'SPS-MYS'), 'guardian')", idOf(SURESH))
    const p = await as(PRINCIPAL, 'admin1234', 'principal')
    const m = (await p.get('/admin/members')).data.members.find((x) => x.email === SURESH)
    assert.equal((await p.post(`/admin/members/${m.id}/reset-password`)).status, 409)
  })

  test('invited teachers get exactly the sections they were invited to', async () => {
    const p = await as(PRINCIPAL, 'admin1234', 'principal')
    const setup = (await p.get('/admin/setup')).data
    const b7 = setup.sections.find((s) => s.label.en === 'Class 7B')
    const inv = await p.post('/admin/invitations', { email: 'new.teacher@vidyanexus.school', name: 'Lakshmi Iyer', role: 'teacher', sectionIds: [b7.id] })
    assert.equal(inv.status, 200)
    // Roles from another level or for students cannot be invited.
    assert.equal((await p.post('/admin/invitations', { email: 'x@y.in', name: 'X', role: 'owner_trustee' })).status, 403)
    assert.equal((await p.post('/admin/invitations', { email: 'x@y.in', name: 'X', role: 'student' })).status, 403)
    const token = inv.data.link.split('/').pop()
    const c = app.client()
    assert.equal((await c.get(`/invitations/${token}`)).data.role, 'teacher')
    assert.equal((await c.post(`/invitations/${token}/accept`, { password: 'lakshmi123' })).status, 200)
    assert.equal((await c.post(`/invitations/${token}/accept`, { password: 'lakshmi123' })).status, 404)
    const t = await as('new.teacher@vidyanexus.school', 'lakshmi123', 'teacher')
    const o = (await t.get('/teacher/overview')).data
    assert.deepEqual(o.students, [])
    assert.deepEqual(o.sections.map((s) => s.label.en), ['Class 7B'])
  })

  test('a teacher cannot invite anyone', async () => {
    const t = await as(DOLA, 'teacher123', 'teacher')
    assert.equal((await t.post('/admin/invitations', { email: 'a@b.in', name: 'A', role: 'teacher', sectionIds: [1] })).status, 403)
  })

  test('audit events cannot be changed or deleted', () => {
    assert.throws(() => app.db.run('DELETE FROM audit_events'), /append-only/)
    assert.throws(() => app.db.run("UPDATE audit_events SET action = 'x'"), /append-only/)
  })
})
