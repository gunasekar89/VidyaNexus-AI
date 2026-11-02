import { demoStudent } from '../shared/catalog.js'
import { hashPassword } from './auth.js'
import { all, one, run, transaction } from './db.js'
import { addDays, isoDate } from './dates.js'
import { newSecret } from './totp.js'

// Synthetic demo organisation. Everything here is made-up data for demos and tests.
export const DEMO_SCHOOL_CODE = 'VPS-BLR'
export const OTHER_SCHOOL_CODE = 'SPS-MYS'

const insertId = (sql, ...p) => Number(run(sql, ...p).lastInsertRowid)

// Karnataka academic years start in June; financial years start in April.
export function academicYearFor(today = isoDate()) {
  const [y, m] = today.split('-').map(Number)
  const start = m >= 6 ? y : y - 1
  return { label: `${start}-${String(start + 1).slice(2)}`, starts: `${start}-06-01`, ends: `${start + 1}-04-10` }
}
export function financialYearFor(today = isoDate()) {
  const [y, m] = today.split('-').map(Number)
  const start = m >= 4 ? y : y - 1
  return { label: `FY ${start}-${String(start + 1).slice(2)}`, starts: `${start}-04-01`, ends: `${start + 1}-03-31` }
}

const GRADE_KN = ['', '1ನೇ', '2ನೇ', '3ನೇ', '4ನೇ', '5ನೇ', '6ನೇ', '7ನೇ', '8ನೇ', '9ನೇ', '10ನೇ']

// Creates a school with a campus, the current academic year, terms, grades
// 1–10 and the given sections. Returns the new ids.
export function createSchool({ code, nameEn, nameKn, groupId = null, legalEntityId = null, emailDomain = null, campus, sections }) {
  const schoolId = insertId(
    'INSERT INTO schools (group_id, legal_entity_id, code, name_en, name_kn, email_domain) VALUES (?, ?, ?, ?, ?, ?)',
    groupId, legalEntityId, code, nameEn, nameKn, emailDomain,
  )
  const campusId = insertId('INSERT INTO campuses (school_id, code, name_en, name_kn) VALUES (?, ?, ?, ?)', schoolId, campus.code, campus.en, campus.kn)
  for (const [en, kn, kind] of [
    ['Academics', 'ಶೈಕ್ಷಣಿಕ', 'academic'],
    ['Administration', 'ಆಡಳಿತ', 'administrative'],
    ['Transport', 'ಸಾರಿಗೆ', 'operations'],
    ['Facilities', 'ಸೌಲಭ್ಯಗಳು', 'operations'],
  ]) {
    run('INSERT INTO departments (school_id, name_en, name_kn, kind) VALUES (?, ?, ?, ?)', schoolId, en, kn, kind)
  }
  const ay = academicYearFor()
  const yearId = insertId("INSERT INTO academic_years (school_id, label, starts_on, ends_on, status) VALUES (?, ?, ?, ?, 'current')", schoolId, ay.label, ay.starts, ay.ends)
  const mid = `${ay.starts.slice(0, 4)}-10-31`
  run('INSERT INTO terms (school_id, academic_year_id, name_en, name_kn, starts_on, ends_on) VALUES (?, ?, ?, ?, ?, ?)', schoolId, yearId, 'Term 1', 'ಅವಧಿ 1', ay.starts, mid)
  run('INSERT INTO terms (school_id, academic_year_id, name_en, name_kn, starts_on, ends_on) VALUES (?, ?, ?, ?, ?, ?)', schoolId, yearId, 'Term 2', 'ಅವಧಿ 2', addDays(mid, 1), ay.ends)
  const gradeIds = {}
  for (let level = 1; level <= 10; level++) {
    gradeIds[level] = insertId('INSERT INTO grades (school_id, level, name_en, name_kn) VALUES (?, ?, ?, ?)', schoolId, level, `Class ${level}`, `${GRADE_KN[level]} ತರಗತಿ`)
  }
  const sectionIds = {}
  for (const [level, name] of sections) {
    sectionIds[`${level}${name}`] = insertId(
      'INSERT INTO sections (school_id, campus_id, academic_year_id, grade_id, name, label_en, label_kn) VALUES (?, ?, ?, ?, ?, ?, ?)',
      schoolId, campusId, yearId, gradeIds[level], name, `Class ${level}${name}`, `${GRADE_KN[level]} ತರಗತಿ ${name === 'A' ? 'ಎ' : name === 'B' ? 'ಬಿ' : name}`,
    )
  }
  return { schoolId, campusId, yearId, sectionIds }
}

const deptId = (schoolId, name) => one('SELECT id FROM departments WHERE school_id = ? AND name_en = ?', schoolId, name)?.id ?? null

// The demo group and school that existing (pre-tenancy) data belongs to.
export function ensureDemoTenant() {
  const existing = one('SELECT * FROM schools WHERE code = ?', DEMO_SCHOOL_CODE)
  if (existing) {
    const year = one("SELECT id FROM academic_years WHERE school_id = ? AND status = 'current'", existing.id)
    const section = one("SELECT id FROM sections WHERE school_id = ? AND academic_year_id = ? AND label_en = 'Class 7A'", existing.id, year?.id ?? -1)
    return { schoolId: existing.id, groupId: existing.group_id, yearId: year?.id, sectionIds: { '7A': section?.id } }
  }
  const groupId = insertId("INSERT INTO school_groups (code, name) VALUES ('VET', 'Vidya Education Trust')")
  const legalId = insertId("INSERT INTO legal_entities (group_id, name, kind) VALUES (?, 'Vidya Education Trust', 'trust')", groupId)
  const fy = financialYearFor()
  run("INSERT INTO financial_years (legal_entity_id, label, starts_on, ends_on, status) VALUES (?, ?, ?, ?, 'open')", legalId, fy.label, fy.starts, fy.ends)
  const t = createSchool({
    code: DEMO_SCHOOL_CODE,
    nameEn: 'Vidya Public School, Bengaluru',
    nameKn: 'ವಿದ್ಯಾ ಪಬ್ಲಿಕ್ ಶಾಲೆ, ಬೆಂಗಳೂರು',
    groupId,
    legalEntityId: legalId,
    emailDomain: 'vidyanexus.school',
    campus: { code: 'JNR', en: 'Jayanagar campus', kn: 'ಜಯನಗರ ಕ್ಯಾಂಪಸ್' },
    sections: [[7, 'A'], [7, 'B']],
  })
  return { ...t, groupId }
}

export function enrollStudent({ schoolId, yearId, sectionId, userId, admissionNo, rollNo = '' }) {
  run(
    `INSERT INTO enrollments (school_id, student_user_id, academic_year_id, section_id, admission_no, roll_no, starts_on)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    schoolId, userId, yearId, sectionId, admissionNo, rollNo, isoDate(),
  )
  run("INSERT INTO memberships (user_id, school_id, role) VALUES (?, ?, 'student')", userId, schoolId)
  run("INSERT INTO login_identifiers (school_id, kind, value, user_id) VALUES (?, 'student_id', ?, ?)", schoolId, admissionNo, userId)
}

export function addMembership({ userId, schoolId = null, groupId = null, role, sections = [], createdBy = null }) {
  const id = insertId('INSERT INTO memberships (user_id, school_id, group_id, role, created_by) VALUES (?, ?, ?, ?, ?)', userId, schoolId, groupId, role, createdBy)
  for (const s of sections) run("INSERT INTO membership_scopes (membership_id, scope_type, scope_id) VALUES (?, 'section', ?)", id, s)
  return id
}

export function addEmployee({ schoolId, userId, employeeNo, staffType, department, designation }) {
  const id = insertId(
    `INSERT INTO employees (school_id, user_id, employee_no, staff_type, department_id, designation_en, designation_kn, joined_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    schoolId, userId, employeeNo, staffType, deptId(schoolId, department), designation.en, designation.kn, addDays(isoDate(), -400),
  )
  run("INSERT INTO login_identifiers (school_id, kind, value, user_id) VALUES (?, 'employee_id', ?, ?)", schoolId, employeeNo, userId)
  return id
}

// Attaches data created before tenancy existed (or by the legacy seed) to the
// demo school: students get an enrollment in 7A, teachers an employee record
// and a 7A teaching membership, and learning records get a school. Idempotent.
export function backfillLegacy() {
  const orphans = all(
    "SELECT * FROM users u WHERE u.role IN ('student', 'teacher') AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id) ORDER BY u.id",
  )
  const unassigned = ['homework', 'announcements', 'exams', 'results', 'awards', 'attendance'].some((t) => one(`SELECT 1 AS x FROM ${t} WHERE school_id IS NULL LIMIT 1`))
  if (!orphans.length && !unassigned) return false
  transaction(() => {
    const t = ensureDemoTenant()
    const section = t.sectionIds['7A']
    for (const u of orphans) {
      if (u.role === 'student') {
        const admissionNo = `VPS-${u.roll_no || `S${u.id}`}`
        enrollStudent({ schoolId: t.schoolId, yearId: t.yearId, sectionId: section, userId: u.id, admissionNo, rollNo: u.roll_no })
      } else {
        addEmployee({ schoolId: t.schoolId, userId: u.id, employeeNo: `EMP-T${String(u.id).padStart(3, '0')}`, staffType: 'teaching', department: 'Academics', designation: { en: 'Class teacher, 7A', kn: '7ಎ ತರಗತಿ ಶಿಕ್ಷಕರು' } })
        addMembership({ userId: u.id, schoolId: t.schoolId, role: 'teacher', sections: [section] })
      }
    }
    for (const table of ['homework', 'exams']) run(`UPDATE ${table} SET school_id = ?, section_id = ? WHERE school_id IS NULL`, t.schoolId, section)
    for (const table of ['announcements', 'results', 'awards', 'attendance']) run(`UPDATE ${table} SET school_id = ? WHERE school_id IS NULL`, t.schoolId)
  })
  return true
}

function addUser({ email, password, name, first, role, mobile = null, mfa = false }) {
  const id = insertId(
    `INSERT INTO users (email, mobile, password_hash, role, name, first_name_en, first_name_kn, school_en, school_kn, class_name_en, class_name_kn, mfa_secret, mfa_enabled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', '', '', '', ?, ?)`,
    email, mobile, hashPassword(password), role, name, first.en, first.kn, mfa ? newSecret() : null, mfa ? new Date().toISOString() : null,
  )
  return id
}

const userId = (email) => one('SELECT id FROM users WHERE email = ?', email)?.id

export const demoIdentities = {
  guardian: { email: 'suresh.k@vidyanexus.school', password: process.env.DEMO_PARENT_PASSWORD || 'parent123', card: 'family' },
  principal: { email: 'principal@vidyanexus.school', password: process.env.DEMO_ADMIN_PASSWORD || 'admin1234', card: 'admin', mfa: true },
  trustee: { email: 'trustee@vidyanexus.school', password: process.env.DEMO_ADMIN_PASSWORD || 'admin1234', card: 'admin', mfa: true },
  accountantParent: { email: 'kiran.m@vidyanexus.school', password: process.env.DEMO_ADMIN_PASSWORD || 'admin1234', card: 'admin', mfa: true },
  hr: { email: 'hr@vidyanexus.school', password: process.env.DEMO_ADMIN_PASSWORD || 'admin1234', card: 'admin', mfa: true },
  driver: { email: 'manjunath.b@vidyanexus.school', password: process.env.DEMO_STAFF_PASSWORD || 'staff1234', card: 'staff', employeeId: 'EMP-0201' },
}

// Adds the extra synthetic people that show the new roles: a parent, a
// principal, a trustee, a multi-role accountant-parent, HR, a driver, plus a
// second independent school for isolation checks. Skips anything that exists.
export function seedDemoIdentities() {
  if (process.env.SEED_DEMO === 'false') return false
  const school = one('SELECT * FROM schools WHERE code = ?', DEMO_SCHOOL_CODE)
  if (!school || userId(demoIdentities.principal.email)) return false
  const t = ensureDemoTenant()
  const jason = userId(demoStudent.email)
  const rahul = userId('rahul.k@vidyanexus.school')
  const dola = userId('dola.ramesh@vidyanexus.school')
  const d = demoIdentities

  transaction(() => {
    const suresh = addUser({ ...d.guardian, name: 'Suresh K.', first: { en: 'Suresh', kn: 'ಸುರೇಶ್' }, role: 'guardian', mobile: '+919845012345' })
    addMembership({ userId: suresh, schoolId: t.schoolId, role: 'guardian' })
    if (jason) {
      run(
        `INSERT INTO guardian_links (school_id, guardian_user_id, student_user_id, relationship, is_primary, can_pickup, can_view_fees, can_view_health, verified_at, status)
         VALUES (?, ?, ?, 'father', 1, 1, 1, 1, datetime('now'), 'active')`,
        t.schoolId, suresh, jason,
      )
    }

    const principal = addUser({ ...d.principal, name: 'Dr. Shalini Rao', first: { en: 'Shalini', kn: 'ಶಾಲಿನಿ' }, role: 'admin' })
    addMembership({ userId: principal, schoolId: t.schoolId, role: 'principal' })
    addEmployee({ schoolId: t.schoolId, userId: principal, employeeNo: 'EMP-0001', staffType: 'teaching', department: 'Administration', designation: { en: 'Principal', kn: 'ಪ್ರಾಂಶುಪಾಲರು' } })

    const trustee = addUser({ ...d.trustee, name: 'Ravi Shankar', first: { en: 'Ravi', kn: 'ರವಿ' }, role: 'admin' })
    addMembership({ userId: trustee, groupId: t.groupId, role: 'owner_trustee' })

    // One person, two verified roles: Rahul's parent who also works as the accountant.
    const kiran = addUser({ ...d.accountantParent, name: 'Kiran M.', first: { en: 'Kiran', kn: 'ಕಿರಣ್' }, role: 'guardian', mobile: '+919845022334' })
    addMembership({ userId: kiran, schoolId: t.schoolId, role: 'accountant' })
    addEmployee({ schoolId: t.schoolId, userId: kiran, employeeNo: 'EMP-0102', staffType: 'non_teaching', department: 'Administration', designation: { en: 'Accountant', kn: 'ಲೆಕ್ಕಿಗರು' } })
    addMembership({ userId: kiran, schoolId: t.schoolId, role: 'guardian' })
    if (rahul) {
      run(
        `INSERT INTO guardian_links (school_id, guardian_user_id, student_user_id, relationship, is_primary, can_pickup, can_view_fees, verified_at, status)
         VALUES (?, ?, ?, 'father', 1, 1, 1, datetime('now'), 'active')`,
        t.schoolId, kiran, rahul,
      )
    }

    const hr = addUser({ ...d.hr, name: 'Farah Khan', first: { en: 'Farah', kn: 'ಫರಾ' }, role: 'admin' })
    addMembership({ userId: hr, schoolId: t.schoolId, role: 'hr' })
    addEmployee({ schoolId: t.schoolId, userId: hr, employeeNo: 'EMP-0103', staffType: 'non_teaching', department: 'Administration', designation: { en: 'HR officer', kn: 'ಮಾನವ ಸಂಪನ್ಮೂಲ ಅಧಿಕಾರಿ' } })

    const driver = addUser({ ...d.driver, name: 'Manjunath B.', first: { en: 'Manjunath', kn: 'ಮಂಜುನಾಥ್' }, role: 'staff', mobile: '+919900020201' })
    addMembership({ userId: driver, schoolId: t.schoolId, role: 'driver' })
    const driverEmp = addEmployee({ schoolId: t.schoolId, userId: driver, employeeNo: d.driver.employeeId, staffType: 'non_teaching', department: 'Transport', designation: { en: 'Bus driver, route 4', kn: 'ಬಸ್ ಚಾಲಕರು, ಮಾರ್ಗ 4' } })

    // Restricted records used to prove access boundaries (synthetic).
    const pay = (emp, rupees, last4) =>
      run('INSERT INTO employee_compensation (school_id, employee_id, effective_from, monthly_gross_paise, bank_account_last4, created_by) VALUES (?, ?, ?, ?, ?, ?)', t.schoolId, emp, `${academicYearFor().starts}`, rupees * 100, last4, hr)
    const dolaEmp = dola && one('SELECT id FROM employees WHERE school_id = ? AND user_id = ?', t.schoolId, dola)?.id
    if (dolaEmp) pay(dolaEmp, 52000, '4417')
    pay(driverEmp, 21000, '9032')
    if (jason) {
      run("INSERT INTO student_notes (school_id, student_user_id, kind, body, created_by) VALUES (?, ?, 'health', 'Mild peanut allergy. Carries no medication at school.', ?)", t.schoolId, jason, principal)
      run("INSERT INTO student_notes (school_id, student_user_id, kind, body, created_by) VALUES (?, ?, 'counseling', 'Synthetic demo note: met counselor about exam stress; follow-up in two weeks.', ?)", t.schoolId, jason, principal)
    }

    // A second, independent school with its own people and records.
    const other = createSchool({
      code: OTHER_SCHOOL_CODE,
      nameEn: 'Sahyadri Public School, Mysuru',
      nameKn: 'ಸಹ್ಯಾದ್ರಿ ಪಬ್ಲಿಕ್ ಶಾಲೆ, ಮೈಸೂರು',
      campus: { code: 'MAIN', en: 'Main campus', kn: 'ಮುಖ್ಯ ಕ್ಯಾಂಪಸ್' },
      sections: [[7, 'A']],
    })
    const asha = addUser({ email: 'asha.k@sahyadri.school', password: process.env.DEMO_TEACHER_PASSWORD || 'teacher123', name: 'Asha Kulkarni', first: { en: 'Asha', kn: 'ಆಶಾ' }, role: 'teacher' })
    addEmployee({ schoolId: other.schoolId, userId: asha, employeeNo: 'EMP-0001', staffType: 'teaching', department: 'Academics', designation: { en: 'Class teacher, 7A', kn: '7ಎ ತರಗತಿ ಶಿಕ್ಷಕರು' } })
    addMembership({ userId: asha, schoolId: other.schoolId, role: 'teacher', sections: [other.sectionIds['7A']] })
    const nikhil = addUser({ email: 'nikhil@sahyadri.school', password: process.env.DEMO_STUDENT_PASSWORD || 'student123', name: 'Nikhil S.', first: { en: 'Nikhil', kn: 'ನಿಖಿಲ್' }, role: 'student' })
    run("UPDATE users SET class_name_en = 'Class 7A', class_name_kn = '7ನೇ ತರಗತಿ ಎ', school_en = 'Sahyadri Public School, Mysuru', school_kn = 'ಸಹ್ಯಾದ್ರಿ ಪಬ್ಲಿಕ್ ಶಾಲೆ, ಮೈಸೂರು' WHERE id = ?", nikhil)
    enrollStudent({ schoolId: other.schoolId, yearId: other.yearId, sectionId: other.sectionIds['7A'], userId: nikhil, admissionNo: 'SPS-0007', rollNo: '07A-07' })
    run(
      `INSERT INTO homework (subject, title_en, title_kn, detail_en, detail_kn, due_date, created_by, school_id, section_id) VALUES ('mathematics', 'Sahyadri maths sheet', 'ಸಹ್ಯಾದ್ರಿ ಗಣಿತ ಹಾಳೆ', 'Fractions', 'ಭಿನ್ನರಾಶಿಗಳು', ?, ?, ?, ?)`,
      addDays(isoDate(), 2), asha, other.schoolId, other.sectionIds['7A'],
    )
    run(
      `INSERT INTO announcements (title_en, title_kn, body_en, body_kn, category, created_by, school_id) VALUES ('Sahyadri sports meet', 'ಸಹ್ಯಾದ್ರಿ ಕ್ರೀಡಾಕೂಟ', 'Only for Sahyadri students.', 'ಸಹ್ಯಾದ್ರಿ ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಮಾತ್ರ.', 'event', ?, ?)`,
      asha, other.schoolId,
    )
  })
  return true
}
