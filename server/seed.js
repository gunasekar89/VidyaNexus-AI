import { demoStudent, defaultRevisionPlan, subjects } from '../shared/catalog.js'
import { hashPassword } from './auth.js'
import { all, one, run, transaction } from './db.js'
import { addDays, isoDate, parseDate, weekStart } from './dates.js'

// Demo school: one teacher and four Class 7A students. Dates are relative to
// the day the database is created, so the dashboard always looks "live".
export const demoAccounts = {
  student: { email: demoStudent.email, password: process.env.DEMO_STUDENT_PASSWORD || 'jason123' },
  teacher: { email: 'dola.ramesh@vidyanexus.school', password: process.env.DEMO_TEACHER_PASSWORD || 'teacher123' },
}

const classmates = [
  { name: 'Rahul K.', first: { en: 'Rahul', kn: 'ರಾಹುಲ್' }, email: 'rahul.k@vidyanexus.school', roll: '07A-21', guardian: 'Kiran M.', phone: '+91 98450 22334' },
  { name: 'Meera P.', first: { en: 'Meera', kn: 'ಮೀರಾ' }, email: 'meera.p@vidyanexus.school', roll: '07A-12', guardian: 'Prakash H.', phone: '+91 98860 44120' },
  { name: 'Arjun N.', first: { en: 'Arjun', kn: 'ಅರ್ಜುನ್' }, email: 'arjun.n@vidyanexus.school', roll: '07A-03', guardian: 'Nagaraj S.', phone: '+91 99000 31876' },
]

// Deterministic pseudo-random numbers so every fresh database looks the same.
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600e3).toISOString().replace('T', ' ').slice(0, 19)
}

export function addStudent({ name, first, email, password, roll, guardian, phone, avatar = null }) {
  const { lastInsertRowid } = run(
    `INSERT INTO users (email, password_hash, role, name, first_name_en, first_name_kn, roll_no, guardian, phone, avatar)
     VALUES (?, ?, 'student', ?, ?, ?, ?, ?, ?, ?)`,
    email, hashPassword(password), name, first.en, first.kn, roll, guardian, phone, avatar,
  )
  const id = Number(lastInsertRowid)
  const plan = defaultRevisionPlan
  run(
    `INSERT INTO plans (student_id, title_en, title_kn, summary_en, summary_kn, steps, source) VALUES (?, ?, ?, ?, ?, ?, 'starter')`,
    id,
    'Math Revision Plan',
    'ಗಣಿತ ಪುನರಾವರ್ತನೆ ಯೋಜನೆ',
    'Focus on Algebra (Ch 4–6), practice 10 more questions, and take a mock test.',
    'ಬೀಜಗಣಿತದ ಮೇಲೆ ಗಮನ ಕೊಡಿ (ಅಧ್ಯಾಯ 4–6), ಇನ್ನೂ 10 ಪ್ರಶ್ನೆ ಅಭ್ಯಾಸ ಮಾಡಿ, ಮತ್ತು ಅಣಕು ಪರೀಕ್ಷೆ ಬರೆಯಿರಿ.',
    JSON.stringify(plan),
  )
  return id
}

function seedStudentHistory(id, random, profile) {
  const today = isoDate()

  // Chapters already finished in each subject.
  for (const s of subjects) {
    const done = profile.chapters[s.id] ?? Math.floor(random() * (s.chapters.length - 1)) + 1
    for (let i = 0; i < Math.min(done, s.chapters.length); i++) {
      run('INSERT INTO chapter_progress (student_id, subject, chapter_index) VALUES (?, ?, ?)', id, s.id, i)
    }
  }

  // ~5 months of attendance. Sundays are off; second Saturdays are holidays.
  for (let back = 150; back >= 1; back--) {
    const date = addDays(today, -back)
    const d = parseDate(date)
    if (d.getDay() === 0) continue
    const secondSaturday = d.getDay() === 6 && d.getDate() > 7 && d.getDate() <= 14
    const status = secondSaturday ? 'H' : random() < profile.absentRate ? 'A' : 'P'
    run('INSERT INTO attendance (student_id, date, status) VALUES (?, ?, ?)', id, date, status)
  }

  // Study minutes for the last two weeks (an unbroken streak for the demo student).
  const pattern = [45, 60, 30, 75, 50, 90, 40]
  for (let back = 13; back >= 1; back--) {
    const mins = profile.streak ? pattern[back % 7] : random() < 0.3 ? 0 : Math.round(20 + random() * 60)
    if (mins) run('INSERT INTO study_log (student_id, date, minutes) VALUES (?, ?, ?)', id, addDays(today, -back), mins)
  }

  // This week's goals.
  const goals = [
    ['Complete Math revision', 'ಗಣಿತ ಪುನರಾವರ್ತನೆ ಪೂರ್ಣಗೊಳಿಸಿ', 1],
    ['Read 2 English chapters', '2 ಇಂಗ್ಲಿಷ್ ಅಧ್ಯಾಯ ಓದಿ', 1],
    ['Finish Science worksheet', 'ವಿಜ್ಞಾನ ಕಾರ್ಯಪತ್ರ ಮುಗಿಸಿ', 1],
    ['Practice Kannada spelling', 'ಕನ್ನಡ ಕಾಗುಣಿತ ಅಭ್ಯಾಸ', 0],
    ['Take a mock test', 'ಅಣಕು ಪರೀಕ್ಷೆ ಬರೆಯಿರಿ', 0],
  ]
  for (const [en, kn, done] of goals) {
    run('INSERT INTO goals (student_id, label_en, label_kn, done, week_start) VALUES (?, ?, ?, ?, ?)', id, en, kn, done, weekStart(today))
  }

  // Formative Assessment 1 marks.
  const fa = profile.results
  for (const s of subjects.slice(0, 5)) {
    const score = fa[s.id] ?? Math.round(30 + random() * 18)
    run(
      `INSERT INTO results (student_id, subject, name_en, name_kn, score, max, created_at) VALUES (?, ?, ?, ?, ?, 50, ?)`,
      id, s.id, 'Formative Assessment 1', 'ರಚನಾತ್ಮಕ ಮೌಲ್ಯಮಾಪನ 1', score, hoursAgo(24 * 20),
    )
  }
}

export function seedIfEmpty() {
  if (one('SELECT COUNT(*) AS n FROM users').n > 0) return false
  const today = isoDate()

  transaction(() => {
    const { lastInsertRowid: teacherId } = run(
      `INSERT INTO users (email, password_hash, role, name, first_name_en, first_name_kn, phone)
       VALUES (?, ?, 'teacher', 'Dola Ramesh', 'Dola', 'ದೋಲಾ', '+91 98440 55667')`,
      demoAccounts.teacher.email,
      hashPassword(demoAccounts.teacher.password),
    )

    const jason = addStudent({
      name: demoStudent.name,
      first: demoStudent.firstName,
      email: demoAccounts.student.email,
      password: demoAccounts.student.password,
      roll: demoStudent.rollNo,
      guardian: demoStudent.guardian,
      phone: demoStudent.phone,
    })
    seedStudentHistory(jason, rng(7), {
      chapters: { mathematics: 4, science: 3, english: 3, 'social-science': 2, kannada: 2, 'computer-science': 2 },
      absentRate: 0.05,
      streak: true,
      results: { mathematics: 42, science: 38, english: 45, 'social-science': 40, kannada: 36 },
    })

    classmates.forEach((c, i) => {
      const id = addStudent({ ...c, password: process.env.DEMO_STUDENT_PASSWORD || 'student123' })
      seedStudentHistory(id, rng(100 + i), { chapters: {}, absentRate: 0.08 + i * 0.03, streak: false, results: {} })
    })

    const homework = [
      ['mathematics', 'Mathematics Homework', 'ಗಣಿತ ಮನೆಗೆಲಸ', 'Ch 5 – Practice questions', 'ಅಧ್ಯಾಯ 5 – ಅಭ್ಯಾಸ ಪ್ರಶ್ನೆಗಳು', 0, 0],
      ['science', 'Science Worksheet', 'ವಿಜ್ಞಾನ ಕಾರ್ಯಪತ್ರ', 'Force and Motion', 'ಬಲ ಮತ್ತು ಚಲನೆ', 1, 0],
      ['english', 'English Essay', 'ಇಂಗ್ಲಿಷ್ ಪ್ರಬಂಧ', 'My Favourite Place', 'ನನ್ನ ಮೆಚ್ಚಿನ ಸ್ಥಳ', 5, 0],
      ['social-science', 'Social Science Project', 'ಸಮಾಜ ವಿಜ್ಞಾನ ಯೋಜನೆ', 'Our Local Government', 'ನಮ್ಮ ಸ್ಥಳೀಯ ಸರ್ಕಾರ', 8, 1],
      ['kannada', 'Kannada Spelling List', 'ಕನ್ನಡ ಕಾಗುಣಿತ ಪಟ್ಟಿ', 'Lesson 3 words', 'ಪಾಠ 3 ಪದಗಳು', -3, 0],
      ['computer-science', 'Scratch Animation', 'ಸ್ಕ್ರ್ಯಾಚ್ ಅನಿಮೇಷನ್', 'Make a sprite dance', 'ಸ್ಪ್ರೈಟ್ ನೃತ್ಯ ಮಾಡಿಸಿ', -10, 0],
    ]
    for (const [subject, ten, tkn, den, dkn, offset, project] of homework) {
      const { lastInsertRowid } = run(
        `INSERT INTO homework (subject, title_en, title_kn, detail_en, detail_kn, due_date, project, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        subject, ten, tkn, den, dkn, addDays(today, offset), project, teacherId,
      )
      // Past homework is already handed in.
      if (offset < 0) {
        for (const s of all("SELECT id FROM users WHERE role = 'student'")) {
          run('INSERT INTO homework_status (homework_id, student_id) VALUES (?, ?)', lastInsertRowid, s.id)
        }
      }
    }

    const nextSaturday = addDays(today, ((6 - parseDate(today).getDay() + 7) % 7) || 7)
    const year = parseDate(today).getFullYear()
    const rajyotsava = `${today > `${year}-11-01` ? year + 1 : year}-11-01`
    const announcements = [
      ['Dasara Holiday Notice', 'ದಸರಾ ರಜೆ ಸೂಚನೆ', 'School will be closed for the festival holidays. Enjoy the celebrations with your family!', 'ಹಬ್ಬದ ರಜೆಗಾಗಿ ಶಾಲೆ ಮುಚ್ಚಿರುತ್ತದೆ. ಕುಟುಂಬದೊಂದಿಗೆ ಹಬ್ಬವನ್ನು ಆನಂದಿಸಿ!', 'holiday', 1, null, 2],
      ['Inter-School Science Fair', 'ಅಂತರ-ಶಾಲಾ ವಿಜ್ಞಾನ ಮೇಳ', 'Registrations open for Classes 6–10.', '6–10ನೇ ತರಗತಿಗಳಿಗೆ ನೋಂದಣಿ ಆರಂಭ.', 'event', 0, addDays(today, 10), 24],
      ['New Library Books', 'ಹೊಸ ಗ್ರಂಥಾಲಯ ಪುಸ್ತಕಗಳು', 'Explore 50+ new books in our school library!', 'ನಮ್ಮ ಶಾಲಾ ಗ್ರಂಥಾಲಯದಲ್ಲಿ 50+ ಹೊಸ ಪುಸ್ತಕಗಳು!', 'library', 0, null, 72],
      ['Parent–Teacher Meeting', 'ಪೋಷಕ–ಶಿಕ್ಷಕ ಸಭೆ', 'PTM for Class 7 on Saturday at 10:00 AM.', '7ನೇ ತರಗತಿಯ ಸಭೆ ಶನಿವಾರ ಬೆಳಿಗ್ಗೆ 10:00ಕ್ಕೆ.', 'meeting', 1, nextSaturday, 120],
      ['Kannada Rajyotsava Celebrations', 'ಕನ್ನಡ ರಾಜ್ಯೋತ್ಸವ ಆಚರಣೆ', 'Cultural programme on Nov 1. Sign up for performances with your class teacher.', 'ನವೆಂಬರ್ 1 ರಂದು ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮ. ನಿಮ್ಮ ತರಗತಿ ಶಿಕ್ಷಕರಲ್ಲಿ ಹೆಸರು ನೋಂದಾಯಿಸಿ.', 'celebration', 0, rajyotsava, 168],
    ]
    for (const [ten, tkn, ben, bkn, category, important, eventDate, ago] of announcements) {
      run(
        `INSERT INTO announcements (title_en, title_kn, body_en, body_kn, category, important, event_date, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ten, tkn, ben, bkn, category, important, eventDate, teacherId, hoursAgo(ago),
      )
    }

    const exams = [
      ['mathematics', 'Unit Test', 'ಘಟಕ ಪರೀಕ್ಷೆ', 6, 'Chapters 4–6', 'ಅಧ್ಯಾಯ 4–6'],
      ['science', 'Unit Test', 'ಘಟಕ ಪರೀಕ್ಷೆ', 10, 'Heat; Force and Motion', 'ಉಷ್ಣ; ಬಲ ಮತ್ತು ಚಲನೆ'],
      ['english', 'Reading Assessment', 'ಓದುವ ಮೌಲ್ಯಮಾಪನ', 14, 'Unseen passage', 'ಅಪರಿಚಿತ ಗದ್ಯಭಾಗ'],
    ]
    for (const [subject, nen, nkn, offset, sen, skn] of exams) {
      run(
        `INSERT INTO exams (subject, name_en, name_kn, exam_date, syllabus_en, syllabus_kn) VALUES (?, ?, ?, ?, ?, ?)`,
        subject, nen, nkn, addDays(today, offset), sen, skn,
      )
    }
  })
  return true
}
