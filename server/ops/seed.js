// Synthetic demo data for the operations modules: fee setup and some payments,
// leave and example payroll rules, a bus route, library books, suppliers and
// stock, a few admissions, and the extra staff who run each desk. Runs once
// per database (it skips anything that already exists).
import { hashPassword } from '../auth.js'
import { all, one, run, transaction } from '../db.js'
import { addDays, isoDate } from '../dates.js'
import { DEMO_SCHOOL_CODE, academicYearFor, addEmployee, addMembership } from '../tenancy.js'
import { newSecret } from '../totp.js'
import { ensureChart, fyPeriod, insertId, nextNumber, nextSeq } from './common.js'
import { captureCounterPayment, createDemand, generateForStudent } from './fees.js'
import { storeRun } from './hr.js'

const ADMIN_PW = () => process.env.DEMO_ADMIN_PASSWORD || 'admin1234'
const STAFF_PW = () => process.env.DEMO_STAFF_PASSWORD || 'staff1234'

// The desk staff added for the module demos.
export const opsDemoPeople = {
  receptionist: { email: 'reception@vidyanexus.school', name: 'Lakshmi N.', first: { en: 'Lakshmi', kn: 'ಲಕ್ಷ್ಮಿ' }, role: 'receptionist', employeeNo: 'EMP-0104', mfa: true, gross: 26000, designation: { en: 'Front office', kn: 'ಮುಂಭಾಗದ ಕಚೇರಿ' } },
  safeguarding: { email: 'safeguarding@vidyanexus.school', name: 'Meera Iyer', first: { en: 'Meera', kn: 'ಮೀರಾ' }, role: 'safeguarding_officer', employeeNo: 'EMP-0105', mfa: true, gross: 48000, designation: { en: 'Designated safeguarding lead', kn: 'ಮಕ್ಕಳ ಸುರಕ್ಷತಾ ಮುಖ್ಯಸ್ಥರು' } },
  nurse: { email: 'nurse@vidyanexus.school', name: "Anita D'Souza", first: { en: 'Anita', kn: 'ಅನಿತಾ' }, role: 'nurse', employeeNo: 'EMP-0301', gross: 30000, designation: { en: 'School nurse', kn: 'ಶಾಲಾ ದಾದಿ' } },
  librarian: { email: 'librarian@vidyanexus.school', name: 'Prakash H.', first: { en: 'Prakash', kn: 'ಪ್ರಕಾಶ್' }, role: 'librarian', employeeNo: 'EMP-0302', gross: 32000, designation: { en: 'Librarian', kn: 'ಗ್ರಂಥಪಾಲಕರು' } },
  stores: { email: 'stores@vidyanexus.school', name: 'Raju P.', first: { en: 'Raju', kn: 'ರಾಜು' }, role: 'inventory', employeeNo: 'EMP-0303', gross: 24000, designation: { en: 'Stores keeper', kn: 'ದಾಸ್ತಾನು ಪಾಲಕರು' } },
  attendant: { email: 'savitha.r@vidyanexus.school', name: 'Savitha R.', first: { en: 'Savitha', kn: 'ಸವಿತಾ' }, role: 'attendant', employeeNo: 'EMP-0202', gross: 16000, designation: { en: 'Bus attendant, route 4', kn: 'ಬಸ್ ಸಹಾಯಕರು, ಮಾರ್ಗ 4' } },
}

const uid = (email) => one('SELECT id FROM users WHERE email = ?', email)?.id

function addPerson(schoolId, p, hrUser) {
  if (uid(p.email)) return uid(p.email)
  const id = insertId(
    `INSERT INTO users (email, password_hash, role, name, first_name_en, first_name_kn, school_en, school_kn, class_name_en, class_name_kn, mfa_secret, mfa_enabled_at)
     VALUES (?, ?, ?, ?, ?, ?, '', '', '', '', ?, ?)`,
    p.email, hashPassword(p.mfa ? ADMIN_PW() : STAFF_PW()), p.mfa ? 'admin' : 'staff', p.name, p.first.en, p.first.kn,
    p.mfa ? newSecret() : null, p.mfa ? new Date().toISOString() : null,
  )
  addMembership({ userId: id, schoolId, role: p.role })
  const emp = addEmployee({ schoolId, userId: id, employeeNo: p.employeeNo, staffType: 'non_teaching', department: p.role === 'attendant' ? 'Transport' : 'Administration', designation: p.designation })
  run('INSERT INTO employee_compensation (school_id, employee_id, effective_from, monthly_gross_paise, bank_account_last4, created_by) VALUES (?, ?, ?, ?, ?, ?)', schoolId, emp, academicYearFor().starts, p.gross * 100, String(1000 + emp).slice(-4), hrUser)
  return id
}

export function seedOperations() {
  if (process.env.SEED_DEMO === 'false') return false
  const school = one('SELECT * FROM schools WHERE code = ?', DEMO_SCHOOL_CODE)
  const principal = uid('principal@vidyanexus.school')
  if (!school || !principal || one('SELECT 1 AS x FROM fee_heads WHERE school_id = ?', school.id)) return false
  const s = school.id
  const year = one("SELECT * FROM academic_years WHERE school_id = ? AND status = 'current'", s)
  if (!year) return false
  const today = isoDate()
  const kiran = uid('kiran.m@vidyanexus.school')
  const hr = uid('hr@vidyanexus.school')
  const suresh = uid('suresh.k@vidyanexus.school')
  const jason = uid('jason@vidyanexus.school')
  const rahul = uid('rahul.k@vidyanexus.school')
  const dola = uid('dola.ramesh@vidyanexus.school')
  const driver = uid('manjunath.b@vidyanexus.school')
  const ayStart = Number(year.starts_on.slice(0, 4))

  transaction(() => {
    ensureChart(s)
    const people = Object.fromEntries(Object.entries(opsDemoPeople).map(([k, p]) => [k, addPerson(s, p, hr)]))

    // Pay records for the earlier demo staff, so payroll has everyone.
    for (const [email, rupees, last4] of [['principal@vidyanexus.school', 110000, '2201'], ['kiran.m@vidyanexus.school', 38000, '3302'], ['hr@vidyanexus.school', 42000, '4403']]) {
      const emp = one('SELECT id FROM employees WHERE school_id = ? AND user_id = ?', s, uid(email))?.id
      if (emp && !one('SELECT 1 AS x FROM employee_compensation WHERE employee_id = ?', emp)) {
        run('INSERT INTO employee_compensation (school_id, employee_id, effective_from, monthly_gross_paise, bank_account_last4, created_by) VALUES (?, ?, ?, ?, ?, ?)', s, emp, year.starts_on, rupees * 100, last4, hr)
      }
    }

    // ----- Fees -----
    const head = (code, en, kn, kind, refundable = 0) => insertId('INSERT INTO fee_heads (school_id, code, name_en, name_kn, kind, refundable) VALUES (?, ?, ?, ?, ?, ?)', s, code, en, kn, kind, refundable)
    const tui = head('TUI', 'Tuition fee', 'ಬೋಧನಾ ಶುಲ್ಕ', 'tuition')
    const ann = head('ANN', 'Annual charges', 'ವಾರ್ಷಿಕ ಶುಲ್ಕ', 'annual')
    const exm = head('EXM', 'Examination fee', 'ಪರೀಕ್ಷಾ ಶುಲ್ಕ', 'exam')
    head('ADM', 'Admission fee', 'ಪ್ರವೇಶ ಶುಲ್ಕ', 'admission')
    head('TRN', 'Transport fee', 'ಸಾರಿಗೆ ಶುಲ್ಕ', 'transport')
    head('CAU', 'Caution deposit', 'ಭದ್ರತಾ ಠೇವಣಿ', 'other', 1)
    for (let g = 1; g <= 10; g++) {
      const tuition = (14000 + g * 600) * 100
      const plan = (h, n, label, due, amt) => run('INSERT INTO fee_plan_items (school_id, academic_year_id, grade_level, head_id, installment_no, label, due_on, amount_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', s, year.id, g, h, n, label, due, amt)
      plan(tui, 1, 'Term 1', `${ayStart}-06-15`, tuition)
      plan(tui, 2, 'Term 2', `${ayStart}-10-15`, tuition)
      plan(tui, 3, 'Term 3', `${ayStart + 1}-01-15`, tuition)
      plan(ann, 1, 'Annual', `${ayStart}-06-30`, 6500 * 100)
      plan(exm, 1, 'Board/term exams', `${ayStart}-09-15`, 1500 * 100)
    }
    for (const e of all("SELECT student_user_id FROM enrollments WHERE school_id = ? AND academic_year_id = ? AND status = 'active'", s, year.id)) generateForStudent(s, e.student_user_id, kiran)

    // Counter payments: Jason's first term is paid; Rahul has paid part.
    const pay = (student, paise, method, ref, on) => {
      const pid = insertId(
        `INSERT INTO payments (school_id, student_user_id, amount_paise, method, reference, status, settlement_status, received_by, received_on, idempotency_key)
         VALUES (?, ?, ?, ?, ?, 'initiated', 'not_applicable', ?, ?, ?)`,
        s, student, paise, method, ref, kiran, on, `seed-${student}-${paise}`,
      )
      return pid
    }
    if (jason) {
      const p = pay(jason, (14000 + 7 * 600 + 6500) * 100, 'upi', 'UPI 4512', `${ayStart}-06-12`)
      captureCounterPayment(p, kiran)
    }
    if (rahul) {
      const p = pay(rahul, 10000 * 100, 'cash', '', `${ayStart}-07-02`)
      captureCounterPayment(p, kiran)
    }
    // A concession waiting for the principal (asked by the accountant).
    if (rahul) run("INSERT INTO fee_concessions (school_id, student_user_id, academic_year_id, kind, percent, reason, requested_by) VALUES (?, ?, ?, 'sibling', 10, 'Younger sibling joining in June (sibling policy).', ?)", s, rahul, year.id, kiran)

    // ----- HR -----
    for (const [code, en, kn, days, paid] of [
      ['CL', 'Casual leave', 'ಸಾಂದರ್ಭಿಕ ರಜೆ', 12, 1],
      ['SL', 'Sick leave', 'ಅನಾರೋಗ್ಯ ರಜೆ', 10, 1],
      ['EL', 'Earned leave', 'ಗಳಿಕೆ ರಜೆ', 15, 1],
      ['LOP', 'Leave without pay', 'ವೇತನರಹಿತ ರಜೆ', 0, 0],
    ]) run('INSERT INTO leave_types (school_id, code, name_en, name_kn, days_per_year, paid) VALUES (?, ?, ?, ?, ?, ?)', s, code, en, kn, days, paid)
    // Example deduction rules. NOT statutory advice: the school's auditor must verify them.
    const rule = (code, en, kn, kind, basis, bp, fixed, cap, min, max) =>
      run('INSERT INTO payroll_rules (school_id, code, name_en, name_kn, kind, basis, percent_bp, fixed_paise, base_cap_paise, min_gross_paise, max_gross_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', s, code, en, kn, kind, basis, bp, fixed, cap, min, max)
    rule('BASIC', 'Basic pay share of gross (example)', 'ಒಟ್ಟು ವೇತನದಲ್ಲಿ ಮೂಲ ವೇತನದ ಪಾಲು (ಉದಾಹರಣೆ)', 'component', 'gross', 5000, 0, null, null, null)
    rule('PF_EE', 'Provident fund, employee (example)', 'ಭವಿಷ್ಯ ನಿಧಿ, ನೌಕರ (ಉದಾಹರಣೆ)', 'deduction', 'basic', 1200, 0, 15000 * 100, null, null)
    rule('PF_ER', 'Provident fund, employer (example)', 'ಭವಿಷ್ಯ ನಿಧಿ, ಉದ್ಯೋಗದಾತ (ಉದಾಹರಣೆ)', 'employer', 'basic', 1200, 0, 15000 * 100, null, null)
    rule('ESI_EE', 'ESI, employee (example)', 'ಇಎಸ್‌ಐ, ನೌಕರ (ಉದಾಹರಣೆ)', 'deduction', 'gross', 75, 0, null, null, 21000 * 100)
    rule('ESI_ER', 'ESI, employer (example)', 'ಇಎಸ್‌ಐ, ಉದ್ಯೋಗದಾತ (ಉದಾಹರಣೆ)', 'employer', 'gross', 325, 0, null, null, 21000 * 100)
    rule('PT', 'Professional tax (example)', 'ವೃತ್ತಿ ತೆರಿಗೆ (ಉದಾಹರಣೆ)', 'deduction', 'fixed', 0, 200 * 100, null, 25000 * 100, null)
    // A pending leave request from the class teacher.
    const dolaEmp = dola && one('SELECT id FROM employees WHERE school_id = ? AND user_id = ?', s, dola)?.id
    const cl = one("SELECT id FROM leave_types WHERE school_id = ? AND code = 'CL'", s).id
    if (dolaEmp) run("INSERT INTO leave_requests (school_id, employee_id, leave_type_id, from_date, to_date, days, reason) VALUES (?, ?, ?, ?, ?, 1, 'Family function')", s, dolaEmp, cl, addDays(today, 6), addDays(today, 6))
    // Last month's payroll, prepared by HR and waiting for the principal.
    const [y, m] = today.split('-').map(Number)
    const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    if (hr) storeRun(s, lastMonth, hr)

    // ----- Transport -----
    const vid = insertId('INSERT INTO vehicles (school_id, reg_no, capacity, insurance_until, fitness_until, permit_until) VALUES (?, ?, ?, ?, ?, ?)', s, 'KA-01-AB-1234', 32, addDays(today, 200), addDays(today, 20), addDays(today, 300))
    insertId('INSERT INTO vehicles (school_id, reg_no, capacity, insurance_until, fitness_until, permit_until) VALUES (?, ?, ?, ?, ?, ?)', s, 'KA-05-MN-7788', 40, addDays(today, 120), addDays(today, 150), addDays(today, -3))
    const route = insertId(
      'INSERT INTO transport_routes (school_id, code, name_en, name_kn, vehicle_id, driver_user_id, attendant_user_id, monthly_fee_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      s, 'R4', 'Jayanagar – JP Nagar', 'ಜಯನಗರ – ಜೆಪಿ ನಗರ', vid, driver ?? null, people.attendant, 1800 * 100,
    )
    const stops = [['Jayanagar 4th Block', '07:15', '15:40'], ['South End Circle', '07:25', '15:50'], ['JP Nagar 2nd Phase', '07:35', '16:00']].map(([name, up, down], i) =>
      insertId('INSERT INTO route_stops (route_id, seq, name, pickup_time, drop_time) VALUES (?, ?, ?, ?, ?)', route, i + 1, name, up, down),
    )
    insertId("INSERT INTO transport_routes (school_id, code, name_en, name_kn, monthly_fee_paise) VALUES (?, 'R7', 'Banashankari – Kumaraswamy Layout', 'ಬನಶಂಕರಿ – ಕುಮಾರಸ್ವಾಮಿ ಲೇಔಟ್', ?)", s, 1600 * 100)
    if (jason && suresh) {
      const a = insertId('INSERT INTO transport_allocations (school_id, student_user_id, route_id, stop_id, from_date, consent_guardian_user_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', s, jason, route, stops[1], `${today.slice(0, 7)}-01`, suresh, principal)
      const trn = one("SELECT id FROM fee_heads WHERE school_id = ? AND code = 'TRN'", s).id
      createDemand({ schoolId: s, studentId: jason, yearId: year.id, headId: trn, installmentNo: 1, description: `Transport R4 ${today.slice(0, 7)}`, dueOn: `${today.slice(0, 7)}-10`, amount: 1800 * 100, source: 'transport', sourceRef: `alloc:${a}:${today.slice(0, 7)}`, by: principal })
    }
    if (rahul && kiran) insertId('INSERT INTO transport_allocations (school_id, student_user_id, route_id, stop_id, from_date, consent_guardian_user_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', s, rahul, route, stops[2], year.starts_on, kiran, principal)

    // ----- Library -----
    const book = (title, author, lang, subject, n) => {
      const b = insertId('INSERT INTO books (school_id, title, author, language, subject) VALUES (?, ?, ?, ?, ?)', s, title, author, lang, subject)
      return Array.from({ length: n }, () => insertId('INSERT INTO book_copies (school_id, book_id, accession_no) VALUES (?, ?, ?)', s, b, `ACC-${String(nextSeq(s, 'ACC', 'all')).padStart(5, '0')}`))
    }
    const wings = book('Wings of Fire', 'A. P. J. Abdul Kalam', 'en', 'Biography', 3)
    book('Malgudi Days', 'R. K. Narayan', 'en', 'Stories', 2)
    book('ಮಲೆಗಳಲ್ಲಿ ಮದುಮಗಳು', 'ಕುವೆಂಪು', 'kn', 'Novel', 2)
    book('ಚಿಕವೀರ ರಾಜೇಂದ್ರ', 'ಮಾಸ್ತಿ ವೆಂಕಟೇಶ ಅಯ್ಯಂಗಾರ್', 'kn', 'Novel', 1)
    book('A Brief History of Time', 'Stephen Hawking', 'en', 'Science', 2)
    book('NCERT Mathematics, Class 7', 'NCERT', 'en', 'Mathematics', 5)
    const librarian = people.librarian
    if (jason) {
      run("UPDATE book_copies SET status = 'on_loan' WHERE id = ?", wings[0])
      run('INSERT INTO library_loans (school_id, copy_id, borrower_user_id, issued_by, issued_on, due_on) VALUES (?, ?, ?, ?, ?, ?)', s, wings[0], jason, librarian, addDays(today, -17), addDays(today, -3))
    }

    // ----- Purchasing, stores, assets -----
    run("INSERT INTO vendors (school_id, name, gstin, phone) VALUES (?, 'Sri Ganesh Stationers', '29ABCDE1234F1Z5', '+91 80 2654 1122')", s)
    run("INSERT INTO vendors (school_id, name, gstin, phone) VALUES (?, 'Bengaluru Tech Supplies', '29PQRSX6789K1Z2', '+91 80 4110 9988')", s)
    const item = (sku, name, unit, kind, level) => insertId('INSERT INTO items (school_id, sku, name, unit, kind, reorder_level) VALUES (?, ?, ?, ?, ?, ?)', s, sku, name, unit, kind, level)
    const paper = item('PAPER-A4', 'A4 paper, 500 sheets', 'ream', 'consumable', 20)
    const marker = item('MARKER-WB', 'Whiteboard markers', 'box', 'consumable', 10)
    item('CHALK-W', 'White chalk', 'box', 'consumable', 15)
    const projector = item('PROJ-HD', 'HD projector', 'nos', 'asset', 0)
    run("INSERT INTO stock_moves (school_id, item_id, qty, kind, reference, note, moved_by) VALUES (?, ?, 46, 'adjustment', 'opening', 'Opening stock', ?)", s, paper, people.stores)
    run("INSERT INTO stock_moves (school_id, item_id, qty, kind, reference, note, moved_by) VALUES (?, ?, 8, 'adjustment', 'opening', 'Opening stock', ?)", s, marker, people.stores)
    const reqId = insertId("INSERT INTO requisitions (school_id, number, purpose, requested_by, estimated_paise) VALUES (?, ?, 'Projectors for classes 7A and 7B', ?, ?)", s, nextNumber(s, 'REQ', fyPeriod(), 5), kiran, 2 * 42000 * 100)
    run('INSERT INTO requisition_lines (requisition_id, item_id, qty, est_unit_paise) VALUES (?, ?, 2, ?)', reqId, projector, 42000 * 100)
    run("INSERT INTO assets (school_id, tag, name, location, purchase_date, cost_paise, warranty_until, status, custodian_user_id) VALUES (?, 'AST-00001', 'Smart board', 'Class 7A', ?, ?, ?, 'in_use', ?)", s, `${ayStart - 1}-05-20`, 185000 * 100, addDays(today, 40), dola ?? null)
    run("INSERT INTO assets (school_id, tag, name, location, purchase_date, cost_paise, warranty_until, status, custodian_user_id) VALUES (?, 'AST-00002', 'Laptop', 'Principal office', ?, ?, ?, 'in_use', ?)", s, `${ayStart}-04-02`, 68000 * 100, addDays(today, 500), principal)
    run("INSERT INTO doc_sequences (school_id, kind, period, next_no) VALUES (?, 'AST', 'all', 2) ON CONFLICT DO UPDATE SET next_no = MAX(next_no, 2)", s)

    // ----- Reception, health, safeguarding, helpdesk -----
    run("INSERT INTO visitors (school_id, pass_no, name, mobile, purpose, host, kind, recorded_by) VALUES (?, ?, 'Venkatesh (AMC technician)', '+91 98860 12121', 'Water purifier service', 'Facilities', 'contractor', ?)", s, nextNumber(s, 'VIS', today.replace(/-/g, ''), 3), people.receptionist)
    if (jason) run("INSERT INTO infirmary_visits (school_id, student_user_id, complaint, action_taken, sent_home, guardian_informed, recorded_by, visited_at) VALUES (?, ?, 'Headache after PE', 'Rested 20 minutes, water; returned to class', 0, 1, ?, ?)", s, jason, people.nurse, `${addDays(today, -2)}T10:20:00.000Z`)
    if (dola) run("INSERT INTO safeguarding_cases (school_id, number, student_user_id, category, severity, summary, reported_by) VALUES (?, ?, ?, 'bullying', 'medium', 'Synthetic demo case: name-calling in the lunch queue reported by two classmates.', ?)", s, nextNumber(s, 'SG', fyPeriod(), 4), rahul ?? null, dola)
    if (suresh) run("INSERT INTO tickets (school_id, number, raised_by, category, subject, body, priority, due_at) VALUES (?, ?, ?, 'transport', 'Bus pickup two minutes earlier?', 'Could the South End Circle pickup be at 07:23? School gate traffic is heavy.', 'normal', ?)", s, nextNumber(s, 'TKT', fyPeriod(), 5), suresh, new Date(Date.now() + 72 * 3600e3).toISOString())

    // ----- Admissions pipeline -----
    const sec7B = one("SELECT id FROM sections WHERE school_id = ? AND academic_year_id = ? AND label_en = 'Class 7B'", s, year.id)?.id
    const app = (child, grade, guardian, rel, mobile, status, extra = {}) =>
      run(
        `INSERT INTO admission_applications (school_id, academic_year_id, number, child_name, child_dob, grade_level, previous_school, guardian_name, guardian_relationship, guardian_mobile, guardian_email, source, status,
           docs_birth_certificate, docs_address_proof, docs_transfer_certificate, docs_photo, offer_section_id, offer_expires_on, follow_up_on, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        s, year.id, nextNumber(s, 'APP', year.label, 5), child, extra.dob ?? null, grade, extra.prev ?? '', guardian, rel, mobile, extra.email ?? '', extra.source ?? 'walk_in', status,
        extra.docs ? 1 : 0, extra.docs ? 1 : 0, extra.docs && extra.prev ? 1 : 0, extra.docs ? 1 : 0, extra.section ?? null, extra.expires ?? null, extra.follow ?? null, people.receptionist,
      )
    app('Ananya Hegde', 1, 'Pooja Hegde', 'mother', '+919900112233', 'enquiry', { source: 'website', follow: today })
    app('Rohan Gowda', 7, 'Mahesh Gowda', 'father', '+919900223344', 'applied', { prev: 'Little Flower School, Mandya', dob: `${ayStart - 12}-03-11` })
    app('Kavya Rao', 7, 'Sunita Rao', 'mother', '+919900334455', 'accepted', { prev: 'Sacred Heart School', docs: true, section: sec7B, expires: addDays(today, 10), dob: `${ayStart - 12}-08-02`, email: 'sunita.rao@example.com' })
    app('Aditya Kumar', 7, 'Ramesh Kumar', 'father', '+919900445566', 'offered', { prev: 'Delhi Public School', docs: true, section: sec7B, expires: addDays(today, 5) })
  })
  return true
}
