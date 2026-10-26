import { subjectById, subjects } from '../shared/catalog.js'
import { all, one } from './db.js'
import { addDays, isoDate, weekStart } from './dates.js'

const bi = (row, field) => ({ en: row[`${field}_en`], kn: row[`${field}_kn`] })

// Announcement categories map to the icons used in the mockup.
export const ANNOUNCEMENT_CATEGORIES = {
  holiday: 'bell',
  event: 'trophy',
  library: 'book',
  meeting: 'users',
  celebration: 'flag',
  general: 'bell',
}

const iconFor = (a) => ANNOUNCEMENT_CATEGORIES[a.category] ?? 'bell'

export const toAnnouncement = (a) => ({
  id: a.id,
  title: bi(a, 'title'),
  body: bi(a, 'body'),
  category: a.category,
  important: Boolean(a.important),
  eventDate: a.event_date,
  createdAt: a.created_at.replace(' ', 'T') + 'Z',
  icon: iconFor(a),
})

export const toExam = (e) => ({ id: e.id, subject: e.subject, name: bi(e, 'name'), date: e.exam_date, syllabus: bi(e, 'syllabus') })

export const toHomework = (h) => ({
  id: h.id,
  subject: h.subject,
  title: bi(h, 'title'),
  detail: bi(h, 'detail'),
  dueDate: h.due_date,
  project: Boolean(h.project),
  done: Boolean(h.done),
  doneCount: h.done_count,
  createdAt: h.created_at.replace(' ', 'T') + 'Z',
})

export const toResult = (r) => ({ id: r.id, studentId: r.student_id, subject: r.subject, name: bi(r, 'name'), score: r.score, max: r.max, createdAt: r.created_at })

export const toPlan = (p) =>
  p && { id: p.id, title: bi(p, 'title'), summary: bi(p, 'summary'), steps: JSON.parse(p.steps), source: p.source, createdAt: p.created_at.replace(' ', 'T') + 'Z' }

export function studentHomework(studentId) {
  return all(
    `SELECT h.*, (s.student_id IS NOT NULL) AS done FROM homework h
     LEFT JOIN homework_status s ON s.homework_id = h.id AND s.student_id = ?
     ORDER BY h.due_date, h.id`,
    studentId,
  ).map(toHomework)
}

export const latestPlan = (studentId) => toPlan(one('SELECT * FROM plans WHERE student_id = ? ORDER BY id DESC LIMIT 1', studentId))

export function upcomingExams() {
  return all('SELECT * FROM exams WHERE exam_date >= ? ORDER BY exam_date, id', isoDate()).map(toExam)
}

function notifications(userId, homework, announcements, plan) {
  const today = isoDate()
  const tomorrow = addDays(today, 1)
  const list = []
  for (const h of homework) {
    if (h.done || (h.dueDate !== today && h.dueDate !== tomorrow)) continue
    const when = h.dueDate === today ? { en: 'is due today', kn: 'ಇಂದು ಸಲ್ಲಿಸಬೇಕು' } : { en: 'is due tomorrow', kn: 'ನಾಳೆ ಸಲ್ಲಿಸಬೇಕು' }
    list.push({ key: `hw:${h.id}`, text: { en: `${h.title.en} ${when.en}`, kn: `${h.title.kn} ${when.kn}` }, at: h.createdAt, to: '/homework' })
  }
  const recent = new Date(Date.now() - 4 * 864e5).toISOString()
  for (const a of announcements.filter((a) => a.createdAt >= recent)) {
    list.push({ key: `ann:${a.id}`, text: { en: `New announcement: ${a.title.en}`, kn: `ಹೊಸ ಪ್ರಕಟಣೆ: ${a.title.kn}` }, at: a.createdAt, to: '/announcements' })
  }
  if (plan && plan.source === 'ai') {
    list.push({
      key: `plan:${plan.id}`,
      text: { en: `Your AI coach made a new plan: ${plan.title.en}`, kn: `ನಿಮ್ಮ AI ತರಬೇತುದಾರ ಹೊಸ ಯೋಜನೆ ಮಾಡಿದೆ: ${plan.title.kn}` },
      at: plan.createdAt,
      to: '/',
    })
  }
  const read = new Set(all('SELECT key FROM notification_reads WHERE user_id = ?', userId).map((r) => r.key))
  return list
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8)
    .map((n) => ({ ...n, read: read.has(n.key) }))
}

// Everything the student app needs, in one payload.
export function studentOverview(user) {
  const id = user.id
  const today = isoDate()
  const homework = studentHomework(id)
  const announcements = all('SELECT * FROM announcements ORDER BY created_at DESC, id DESC').map(toAnnouncement)
  const plan = latestPlan(id)

  const chapters = {}
  for (const row of all('SELECT subject, chapter_index FROM chapter_progress WHERE student_id = ?', id)) {
    ;(chapters[row.subject] ??= []).push(row.chapter_index)
  }

  const attendance = {}
  for (const row of all('SELECT date, status FROM attendance WHERE student_id = ? AND date >= ?', id, addDays(today, -400))) {
    attendance[row.date] = row.status
  }

  return {
    today,
    homework,
    goals: all('SELECT * FROM goals WHERE student_id = ? AND week_start = ? ORDER BY id', id, weekStart(today)).map((g) => ({
      id: g.id,
      label: bi(g, 'label'),
      done: Boolean(g.done),
    })),
    announcements,
    exams: upcomingExams(),
    results: all('SELECT * FROM results WHERE student_id = ? ORDER BY created_at DESC, id DESC LIMIT 30', id).map(toResult),
    attendance,
    studyLog: all('SELECT date, minutes FROM study_log WHERE student_id = ? AND date >= ? ORDER BY date', id, addDays(today, -60)),
    chapters,
    plan,
    attempts: all('SELECT * FROM test_attempts WHERE student_id = ? ORDER BY id DESC LIMIT 20', id).map((t) => ({
      id: t.id,
      subject: t.subject,
      title: bi(t, 'title'),
      score: t.score,
      total: t.total,
      createdAt: t.created_at.replace(' ', 'T') + 'Z',
    })),
    notifications: notifications(id, homework, announcements, plan),
  }
}

// A compact, factual summary of the student's situation for the AI tutor and coach.
export function studentContext(user) {
  const id = user.id
  const done = {}
  for (const row of all('SELECT subject, chapter_index FROM chapter_progress WHERE student_id = ?', id)) {
    ;(done[row.subject] ??= new Set()).add(row.chapter_index)
  }
  const subjectLines = subjects.map((s) => {
    const finished = done[s.id]?.size ?? 0
    const current = s.chapters.find((_, i) => !done[s.id]?.has(i))
    return `- ${s.name.en} (teacher ${s.teacher}): ${finished}/${s.chapters.length} chapters done${current ? `, now studying "${current.en}"` : ''}`
  })
  const today = isoDate()
  const exams = upcomingExams().map((e) => `- ${subjectById[e.subject]?.name.en} ${e.name.en} on ${e.date} (syllabus: ${e.syllabus.en})`)
  const pending = studentHomework(id)
    .filter((h) => !h.done && h.dueDate >= today)
    .map((h) => `- ${h.title.en}: ${h.detail.en}, due ${h.dueDate}`)
  const results = all('SELECT * FROM results WHERE student_id = ? ORDER BY created_at DESC LIMIT 8', id).map(
    (r) => `- ${subjectById[r.subject]?.name.en} ${r.name_en}: ${r.score}/${r.max}`,
  )
  return [
    `Student: ${user.first_name_en}, ${user.class_name_en}, ${user.school_en}. Today is ${today}.`,
    'Subjects:',
    ...subjectLines,
    'Upcoming exams:',
    ...(exams.length ? exams : ['- none scheduled']),
    'Pending homework:',
    ...(pending.length ? pending : ['- none']),
    'Recent marks:',
    ...(results.length ? results : ['- none yet']),
  ].join('\n')
}
